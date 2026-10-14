import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  MUSHAF_MAX_PAGE,
  MUSHAF_MIN_PAGE,
  MUSHAF_PAGE_COUNT,
  MushafLayout,
  QURAN_CONTENT_CACHE_TTL_DAYS,
} from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QURAN_CONTENT, QuranContentProvider } from '../../integrations/providers';

/**
 * Mushaf content (CLS-BE-01, CR-11, TRD section 9).
 *
 * The rules this service exists to enforce:
 *   1. Quran text comes from the licensed provider and from nowhere else. It is never
 *      generated, never edited, never written to an editable column.
 *   2. Nothing is cached for longer than the licence allows — 7 days under the Quran
 *      Foundation terms. The `content_cache.expires_at` CHECK constraint enforces it at
 *      the database level; this service never asks for more.
 *   3. Everything is read-through cached, because a live class reads the same page
 *      once per participant and the provider is not a hot path we want to hammer.
 *
 * Without a configured licence the service still answers *metadata* queries (which
 * pages a layout has, which surah starts a page) because those are indices, not text.
 * Page content returns 501 in production, and a clearly-flagged structural response in
 * development so the classroom UI can be built before the licence is signed.
 */
@Injectable()
export class MushafService {
  private readonly logger = new Logger(MushafService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(QURAN_CONTENT) private readonly provider: QuranContentProvider,
  ) {}

  /** Layout metadata — indices only, safe to serve without a licence. */
  layouts() {
    return Object.values(MushafLayout).map((layout) => ({
      layout,
      linesPerPage: linesForLayout(layout),
      pageCount: MUSHAF_PAGE_COUNT,
      minPage: MUSHAF_MIN_PAGE,
      maxPage: MUSHAF_MAX_PAGE,
    }));
  }

  /**
   * One page of layout structure.
   *
   * `licensed: false` in the response is a hard signal to the client: render page
   * numbers and layout, but never substitute placeholder text for Quran text.
   */
  async getPage(
    layout: MushafLayout,
    page: number,
  ): Promise<{
    layout: MushafLayout;
    page: number;
    lines: Array<{ lineNumber: number; ayahs: Array<{ surah: number; ayah: number }> }>;
    surahStart: number;
    ayahStart: number;
    licensed: boolean;
    source: string;
    cachedUntil: string;
  }> {
    assertPageRange(page);

    const key = cacheKey(layout, page);
    const cached = await this.prisma.contentCache.findUnique({ where: { key } });

    if (cached && cached.expiresAt > new Date()) {
      return {
        ...(cached.value as Omit<
          Awaited<ReturnType<typeof this.fetchPage>>,
          'licensed' | 'source' | 'cachedUntil'
        >),
        licensed: this.provider.isLicensed(),
        source: this.provider.name,
        cachedUntil: cached.expiresAt.toISOString(),
      };
    }

    const page_ = await this.fetchPage(layout, page);

    // CR-11 — never more than the licence allows, and the CHECK constraint on
    // content_cache would reject anything longer anyway.
    const ttlMs = this.ttlMs();
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.contentCache
      .upsert({
        where: { key },
        update: { value: page_ as never, fetchedAt: new Date(), expiresAt },
        create: { key, value: page_ as never, fetchedAt: new Date(), expiresAt },
      })
      .catch((error: unknown) => {
        // A cache write must never break a class; log and carry on.
        this.logger.warn(`Could not cache ${key}: ${(error as Error).message}`);
      });

    return {
      ...page_,
      licensed: this.provider.isLicensed(),
      source: this.provider.name,
      cachedUntil: expiresAt.toISOString(),
    };
  }

  /**
   * Fetches from the provider.
   *
   * In production a non-licensed adapter is a hard failure: a classroom that silently
   * rendered empty pages would look like a broken product and, worse, invite someone
   * to "fix it" by pasting text from elsewhere.
   */
  private async fetchPage(layout: MushafLayout, page: number) {
    if (!this.provider.isLicensed() && this.config.isProduction) {
      throw new AppError(
        ErrorCode.NOT_IMPLEMENTED,
        'Quran content requires a licensed provider; no licence is configured for this deployment (CR-11)',
        { layout, page, provider: this.provider.name },
      );
    }

    if (!this.provider.isLicensed()) {
      this.logger.warn(
        `Serving structural Mushaf data from the "${this.provider.name}" adapter with no licence. ` +
          'No Quran text is produced. Do not ship this configuration.',
      );
    }

    return this.provider.getPage(layout, page);
  }

  /** Word-level data for a single ayah, same licensing rules. */
  async getAyahWords(layout: MushafLayout, surah: number, ayah: number) {
    if (surah < 1 || surah > 114) throw AppError.badRequest('Surah must be between 1 and 114');
    if (ayah < 1) throw AppError.badRequest('Ayah must be 1 or greater');

    if (!this.provider.isLicensed() && this.config.isProduction) {
      throw new AppError(
        ErrorCode.NOT_IMPLEMENTED,
        'Quran content requires a licensed provider (CR-11)',
        { layout, surah, ayah },
      );
    }

    return {
      surah,
      ayah,
      words: await this.provider.getAyahWords(layout, surah, ayah),
      licensed: this.provider.isLicensed(),
      source: this.provider.name,
    };
  }

  /** Drops every cache entry — used when a licence changes or a source is corrected. */
  async purgeCache(): Promise<{ deleted: number }> {
    const result = await this.prisma.contentCache.deleteMany({});
    this.logger.warn(`Mushaf cache purged (${result.count} entries)`);
    return { deleted: result.count };
  }

  /** Ageing out entries past their TTL; run nightly with the other retention jobs. */
  async purgeExpired(): Promise<{ deleted: number }> {
    const result = await this.prisma.contentCache.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return { deleted: result.count };
  }

  /**
   * Cache lifetime. Kept under the licence ceiling with a day of headroom so a clock
   * skew between app and database cannot push an entry one second past the limit.
   */
  private ttlMs(): number {
    return (QURAN_CONTENT_CACHE_TTL_DAYS - 1) * 86_400_000;
  }
}

function cacheKey(layout: MushafLayout, page: number): string {
  return `mushaf:${layout}:page:${page}`;
}

export function assertPageRange(page: number): void {
  if (!Number.isInteger(page) || page < MUSHAF_MIN_PAGE || page > MUSHAF_MAX_PAGE) {
    throw AppError.badRequest(
      `Mushaf page must be an integer between ${MUSHAF_MIN_PAGE} and ${MUSHAF_MAX_PAGE}, got ${page}`,
    );
  }
}

function linesForLayout(layout: MushafLayout): number {
  switch (layout) {
    case MushafLayout.MADANI_15:
      return 15;
    case MushafLayout.INDOPAK_13:
      return 13;
    case MushafLayout.INDOPAK_16:
      return 16;
  }
}

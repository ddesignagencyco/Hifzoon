import { Injectable, Logger } from '@nestjs/common';

import { MushafLayout } from '@hifzoon/shared';

import { AppConfigService } from '../config/app-config.service';
import { type AyahWord, type MushafPageContent, type QuranContentProvider } from './providers';

/**
 * Quran Foundation API adapter (CR-11, TRD section 9).
 *
 * Quran Foundation provides Quran text via their public REST API. This adapter
 * fetches page layout data and ayah words via their endpoints.
 *
 * API docs: https://quran-api.com
 */
@Injectable()
export class QuranFoundationProvider implements QuranContentProvider {
  readonly name = 'quran_foundation';
  private readonly logger = new Logger(QuranFoundationProvider.name);
  private readonly baseUrl = 'https://api.quran-api.com/api/v1';

  constructor(private readonly config: AppConfigService) {}

  isLicensed(): boolean {
    return true;
  }

  async getPage(
    layout: MushafLayout,
    page: number,
  ): Promise<MushafPageContent> {
    const mushafName = this.layoutToMushafName(layout);
    const pageNum = String(page).padStart(3, '0');

    const url = `${this.baseUrl}/mushaf/${mushafName}/page/${pageNum}`;

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.error(
        `Failed to fetch page ${page} from Quran Foundation: ${response.statusText}`,
      );
      throw new Error(`Quran Foundation API error: ${response.statusText}`);
    }

    const data = (await response.json()) as QuranApiPage;

    return {
      layout,
      page,
      lines: data.lines.map((line) => ({
        lineNumber: line.line,
        ayahs: line.ayahs.map((ayah) => ({
          surah: ayah.surah,
          ayah: ayah.number,
        })),
      })),
      surahStart: data.surah_number,
      ayahStart: data.ayah_number,
    };
  }

  async getAyahWords(
    _layout: MushafLayout,
    surah: number,
    ayah: number,
  ): Promise<AyahWord[]> {
    const url = `${this.baseUrl}/surah/${surah}/ayah/${ayah}`;

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.error(
        `Failed to fetch words for ${surah}:${ayah} from Quran Foundation: ${response.statusText}`,
      );
      throw new Error(`Quran Foundation API error: ${response.statusText}`);
    }

    const data = (await response.json()) as QuranApiAyah;

    return (data.words || []).map((word, index) => ({
      index,
      text: word.text,
      tajweedRules: word.tajweed || [],
    }));
  }

  private layoutToMushafName(layout: MushafLayout): string {
    switch (layout) {
      case MushafLayout.MADANI_15:
        return 'madani';
      case MushafLayout.INDOPAK_13:
        return 'indopak';
      case MushafLayout.QALOON_16:
        return 'qaloon';
      default:
        throw new Error(`Unsupported Mushaf layout: ${layout}`);
    }
  }
}

interface QuranApiLine {
  line: number;
  ayahs: Array<{ surah: number; number: number }>;
}

interface QuranApiPage {
  page: number;
  surah_number: number;
  ayah_number: number;
  lines: QuranApiLine[];
}

interface QuranApiWord {
  text: string;
  tajweed?: string[];
}

interface QuranApiAyah {
  surah: number;
  ayah: number;
  words?: QuranApiWord[];
}

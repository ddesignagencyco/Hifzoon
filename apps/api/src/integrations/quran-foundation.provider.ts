import { Injectable, Logger } from '@nestjs/common';

import { MushafLayout } from '@hifzoon/shared';

import { AppConfigService } from '../config/app-config.service';
import {
  type AyahWord,
  type MushafPageContent,
  type QuranContentProvider,
  type WordMeaningLanguage,
} from './providers';

/**
 * Quran Foundation Content API v4 (CR-11, TRD section 9).
 *
 * An OAuth2 client-credentials app (dev-console.quran.foundation) gets an hour-long token
 * from `/oauth2/token` with `scope=content`; every content call sends it as `x-auth-token`
 * with the app's `x-client-id`. The secret stays on this server.
 *
 * Layouts, as the API serves them (checked against production on 2026-11-05):
 *   - mushaf 1 — Madani, 15 lines, 604 pages, Uthmani script (`text_uthmani`)
 *   - mushaf 7 — IndoPak, 16 lines, 548 pages, IndoPak script (`text_indopak`)
 * The API has no 13-line IndoPak page layout, so that layout is not offered.
 */
const MUSHAF_ID: Partial<Record<MushafLayout, number>> = {
  [MushafLayout.MADANI_15]: 1,
  [MushafLayout.INDOPAK_16]: 7,
};

const HOSTS = {
  production: { auth: 'https://oauth2.quran.foundation', api: 'https://apis.quran.foundation' },
  prelive: {
    auth: 'https://prelive-oauth2.quran.foundation',
    api: 'https://apis-prelive.quran.foundation',
  },
} as const;

/**
 * Reference recitation for practice (FR-AIC-04): Mishary Rashid Alafasy, Murattal, the
 * clearest steady pace for a child to follow.
 */
export const DEFAULT_RECITATION_ID = 7;
/** Audio file paths in recitation responses are relative to this host. */
const AUDIO_HOST = 'https://verses.quran.foundation/';

/** Renew the token this long before it expires, so a request never carries a dying one. */
const TOKEN_MARGIN_MS = 60_000;

interface QfWord {
  position: number;
  char_type_name: string;
  line_number?: number;
  text_uthmani?: string;
  text_indopak?: string;
  translation?: { text?: string | null } | null;
}

interface QfVerse {
  verse_key: string;
  words?: QfWord[];
}

@Injectable()
export class QuranFoundationProvider implements QuranContentProvider {
  readonly name = 'quran_foundation';
  private readonly logger = new Logger(QuranFoundationProvider.name);
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;
  /** Audio paths do not change, so each ayah is asked for once per process. */
  private readonly audioUrls = new Map<string, string>();

  constructor(private readonly config: AppConfigService) {}

  isLicensed(): boolean {
    const env = this.config.value;
    return Boolean(env.QURAN_FOUNDATION_CLIENT_ID && env.QURAN_FOUNDATION_CLIENT_SECRET);
  }

  supportsLayout(layout: MushafLayout): boolean {
    return MUSHAF_ID[layout] !== undefined;
  }

  async getPage(layout: MushafLayout, page: number): Promise<MushafPageContent> {
    const mushaf = this.mushafFor(layout);
    const data = await this.get<{ verses?: QfVerse[] }>(`/verses/by_page/${page}`, {
      words: 'true',
      word_fields: 'line_number',
      per_page: '50',
      mushaf: String(mushaf),
    });
    const verses = data.verses ?? [];
    if (verses.length === 0) throw new Error(`Quran Foundation has no page ${page} for ${layout}`);

    // Each line lists the ayahs that have words on it, in reading order.
    const byLine = new Map<number, Array<{ surah: number; ayah: number }>>();
    for (const verse of verses) {
      const [surah, ayah] = verse.verse_key.split(':').map(Number);
      for (const word of verse.words ?? []) {
        if (!word.line_number) continue;
        const list = byLine.get(word.line_number) ?? [];
        if (!list.some((a) => a.surah === surah && a.ayah === ayah)) list.push({ surah, ayah });
        byLine.set(word.line_number, list);
      }
    }
    const [surahStart, ayahStart] = verses[0].verse_key.split(':').map(Number);
    return {
      layout,
      page,
      lines: [...byLine.entries()]
        .sort(([a], [b]) => a - b)
        .map(([lineNumber, ayahs]) => ({ lineNumber, ayahs })),
      surahStart,
      ayahStart,
    };
  }

  async getAyahWords(
    layout: MushafLayout,
    surah: number,
    ayah: number,
    language: WordMeaningLanguage = 'en',
  ): Promise<AyahWord[]> {
    const mushaf = this.mushafFor(layout);
    const field = layout === MushafLayout.MADANI_15 ? 'text_uthmani' : 'text_indopak';
    // `language` picks the word-by-word meaning each word carries in `translation`.
    const data = await this.get<{ verse?: QfVerse }>(`/verses/by_key/${surah}:${ayah}`, {
      words: 'true',
      word_fields: field,
      mushaf: String(mushaf),
      language,
    });
    // Ayah-end markers are not words: mistakes are logged against word positions only.
    return (data.verse?.words ?? [])
      .filter((w) => w.char_type_name === 'word')
      .map((w, index) => ({
        index,
        text: w[field] ?? '',
        tajweedRules: [],
        translation: w.translation?.text ?? null,
      }));
  }

  /** `page_number` on a verse is the Madani page whatever `mushaf` is asked for. */
  async madaniPageOf(surah: number, ayah: number): Promise<number> {
    const data = await this.get<{ verse?: { page_number?: number } }>(
      `/verses/by_key/${surah}:${ayah}`,
      {
        words: 'false',
      },
    );
    const page = data.verse?.page_number;
    if (!page) throw new Error(`Quran Foundation has no page for ${surah}:${ayah}`);
    return page;
  }

  /** `/recitations/{id}/by_ayah/{key}`: one ayah's audio file, made absolute. */
  async recitationAudioUrl(
    surah: number,
    ayah: number,
    recitationId = DEFAULT_RECITATION_ID,
  ): Promise<string> {
    const key = `${recitationId}:${surah}:${ayah}`;
    const cached = this.audioUrls.get(key);
    if (cached) return cached;
    const data = await this.get<{ audio_files?: Array<{ verse_key?: string; url?: string }> }>(
      `/recitations/${recitationId}/by_ayah/${surah}:${ayah}`,
      {},
    );
    const path = data.audio_files?.find((f) => f.url)?.url;
    if (!path) throw new Error(`Quran Foundation has no recitation audio for ${surah}:${ayah}`);
    const url = /^https?:\/\//.test(path)
      ? path
      : new URL(path.replace(/^\/+/, ''), AUDIO_HOST).href;
    this.audioUrls.set(key, url);
    return url;
  }

  private mushafFor(layout: MushafLayout): number {
    const id = MUSHAF_ID[layout];
    if (id === undefined) {
      throw new Error(`Quran Foundation has no ${layout} page layout`);
    }
    return id;
  }

  private async get<T>(path: string, query: Record<string, string>, retried = false): Promise<T> {
    const env = this.config.value;
    const url = `${HOSTS[env.QURAN_FOUNDATION_ENV].api}/content/api/v4${path}?${new URLSearchParams(query).toString()}`;
    const response = await fetch(url, {
      headers: {
        'x-auth-token': await this.accessToken(),
        'x-client-id': env.QURAN_FOUNDATION_CLIENT_ID ?? '',
      },
    });
    // A token revoked or rotated early: get a new one and try once more.
    if (response.status === 401 && !retried) {
      this.token = null;
      return this.get<T>(path, query, true);
    }
    if (!response.ok) {
      this.logger.error(`Quran Foundation ${path} returned ${response.status}`);
      throw new Error(`Quran Foundation API error ${response.status} for ${path}`);
    }
    return (await response.json()) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > Date.now()) return this.token.value;
    // One token request at a time, however many pages a class opens at once.
    this.pendingToken ??= this.requestToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async requestToken(): Promise<string> {
    const env = this.config.value;
    if (!env.QURAN_FOUNDATION_CLIENT_ID || !env.QURAN_FOUNDATION_CLIENT_SECRET) {
      throw new Error('QURAN_FOUNDATION_CLIENT_ID and QURAN_FOUNDATION_CLIENT_SECRET are not set');
    }
    const basic = Buffer.from(
      `${env.QURAN_FOUNDATION_CLIENT_ID}:${env.QURAN_FOUNDATION_CLIENT_SECRET}`,
    ).toString('base64');
    const response = await fetch(`${HOSTS[env.QURAN_FOUNDATION_ENV].auth}/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=content',
    });
    if (!response.ok) {
      this.logger.error(`Quran Foundation token request returned ${response.status}`);
      throw new Error(`Quran Foundation token request failed (${response.status})`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}

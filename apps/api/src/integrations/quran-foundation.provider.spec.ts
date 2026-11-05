import { MushafLayout } from '@hifzoon/shared';

import { QuranFoundationProvider } from './quran-foundation.provider';

const config = {
  value: {
    QURAN_FOUNDATION_CLIENT_ID: 'client-1',
    QURAN_FOUNDATION_CLIENT_SECRET: 'secret-1',
    QURAN_FOUNDATION_ENV: 'production',
  },
};

const token = { access_token: 'tok-1', expires_in: 3600 };
const page3 = {
  verses: [
    {
      verse_key: '2:6',
      words: [
        { position: 1, char_type_name: 'word', line_number: 1 },
        { position: 2, char_type_name: 'word', line_number: 2 },
        { position: 3, char_type_name: 'end', line_number: 2 },
      ],
    },
    { verse_key: '2:7', words: [{ position: 1, char_type_name: 'word', line_number: 2 }] },
  ],
};

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function provider(responses: Array<ReturnType<typeof json>>) {
  const fetchMock = jest.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { qf: new QuranFoundationProvider(config as never), fetchMock };
}

const urls = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([u]) => String(u));

describe('QuranFoundationProvider', () => {
  it('is licensed only with credentials, and offers Madani 15 and IndoPak 16 but not 13', () => {
    const { qf } = provider([]);
    expect(qf.isLicensed()).toBe(true);
    expect(qf.supportsLayout(MushafLayout.MADANI_15)).toBe(true);
    expect(qf.supportsLayout(MushafLayout.INDOPAK_16)).toBe(true);
    expect(qf.supportsLayout(MushafLayout.INDOPAK_13)).toBe(false);
    expect(new QuranFoundationProvider({ value: {} } as never).isLicensed()).toBe(false);
  });

  it('lists, per line, the ayahs with words on it, from the production content API', async () => {
    const { qf, fetchMock } = provider([json(token), json(page3)]);
    const page = await qf.getPage(MushafLayout.MADANI_15, 3);

    expect(page).toMatchObject({ page: 3, surahStart: 2, ayahStart: 6 });
    expect(page.lines).toEqual([
      { lineNumber: 1, ayahs: [{ surah: 2, ayah: 6 }] },
      {
        lineNumber: 2,
        ayahs: [
          { surah: 2, ayah: 6 },
          { surah: 2, ayah: 7 },
        ],
      },
    ]);
    const [tokenUrl, pageUrl] = urls(fetchMock);
    expect(tokenUrl).toBe('https://oauth2.quran.foundation/oauth2/token');
    expect(pageUrl).toContain('https://apis.quran.foundation/content/api/v4/verses/by_page/3?');
    expect(pageUrl).toContain('mushaf=1');
  });

  it('sends the token and client id, and reuses the token across calls', async () => {
    const { qf, fetchMock } = provider([json(token), json(page3), json(page3)]);
    await qf.getPage(MushafLayout.MADANI_15, 3);
    await qf.getPage(MushafLayout.MADANI_15, 3);

    expect(urls(fetchMock).filter((u) => u.endsWith('/oauth2/token'))).toHaveLength(1);
    const headers = (fetchMock.mock.calls[1] as unknown[])[1] as {
      headers: Record<string, string>;
    };
    expect(headers.headers).toEqual({ 'x-auth-token': 'tok-1', 'x-client-id': 'client-1' });
  });

  it('gets a new token once when one is refused', async () => {
    const { qf, fetchMock } = provider([json(token), json({}, 401), json(token), json(page3)]);
    await expect(qf.getPage(MushafLayout.MADANI_15, 3)).resolves.toMatchObject({ page: 3 });
    expect(urls(fetchMock).filter((u) => u.endsWith('/oauth2/token'))).toHaveLength(2);
  });

  it('returns only words (not the ayah-end marker), in IndoPak script for IndoPak', async () => {
    const { qf, fetchMock } = provider([
      json(token),
      json({
        verse: {
          verse_key: '1:1',
          words: [
            {
              position: 1,
              char_type_name: 'word',
              text_indopak: 'بِسۡمِ',
              translation: { text: 'به نام' },
            },
            {
              position: 2,
              char_type_name: 'word',
              text_indopak: 'اللّٰهِ',
              translation: { text: 'الله' },
            },
            { position: 3, char_type_name: 'end', text_indopak: '۝١' },
          ],
        },
      }),
    ]);
    const words = await qf.getAyahWords(MushafLayout.INDOPAK_16, 1, 1, 'fa');

    expect(words).toEqual([
      { index: 0, text: 'بِسۡمِ', tajweedRules: [], translation: 'به نام' },
      { index: 1, text: 'اللّٰهِ', tajweedRules: [], translation: 'الله' },
    ]);
    // The meaning language reaches the content API (Farsi here, not English).
    expect(urls(fetchMock)[1]).toContain('language=fa');
    expect(urls(fetchMock)[1]).toContain('mushaf=7');
    expect(urls(fetchMock)[1]).toContain('word_fields=text_indopak');
  });

  it('refuses the 13-line IndoPak layout it has no pages for', async () => {
    const { qf } = provider([]);
    await expect(qf.getPage(MushafLayout.INDOPAK_13, 1)).rejects.toThrow(/no INDOPAK_13/);
  });
});

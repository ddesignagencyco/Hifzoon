import { describe, it, expect } from 'vitest';
import { ayahsOnPage, clampPage, isValidPage, layoutLabel, mushafApi, toArabicDigits } from '@/lib/api/modules/mushaf';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

describe('mushaf API module', () => {
  it('lists layouts', async () => {
    mockApi({
      'GET /mushaf/layouts': {
        body: envelope([{ layout: 'MADANI_15', linesPerPage: 15, pageCount: 604, minPage: 1, maxPage: 604 }]),
      },
    });
    const layouts = await mushafApi.layouts();
    expect(layouts[0].linesPerPage).toBe(15);
  });

  it('fetches one page for a layout', async () => {
    const api = mockApi({
      'GET /mushaf/pages/INDOPAK_13/12': {
        body: envelope({ layout: 'INDOPAK_13', page: 12, lines: [], surahStart: 2, ayahStart: 1, licensed: false, source: 'fake', cachedUntil: '2026-10-20T00:00:00Z' }),
      },
    });
    const page = await mushafApi.page('INDOPAK_13', 12);
    expect(api.calls[0].url).toContain('/mushaf/pages/INDOPAK_13/12');
    expect(page.licensed).toBe(false);
  });

  it('rejects an out-of-range page with the API message', async () => {
    mockApi({ 'GET /mushaf/pages/MADANI_15/999': apiError(400, 'BAD_REQUEST', 'Mushaf page must be an integer between 1 and 604, got 999') });
    await expect(mushafApi.page('MADANI_15', 999)).rejects.toThrow(/between 1 and 604/);
  });

  it('fetches ayah words with query params', async () => {
    const api = mockApi({
      'GET /mushaf/ayah-words': {
        body: envelope({ surah: 1, ayah: 2, words: [{ index: 0, text: 'x', tajweedRules: [] }], licensed: true, source: 'qf' }),
      },
    });
    const words = await mushafApi.ayahWords({ layout: 'MADANI_15', surah: 1, ayah: 2 });
    expect(api.calls[0].url).toContain('/mushaf/ayah-words?layout=MADANI_15&surah=1&ayah=2');
    expect(words.words).toHaveLength(1);
  });
});

describe('mushaf helpers', () => {
  it('collects distinct valid ayahs in reading order', () => {
    const refs = ayahsOnPage({
      lines: [
        { lineNumber: 1, ayahs: [{ surah: 1, ayah: 0 }] },
        { lineNumber: 2, ayahs: [{ surah: 1, ayah: 1 }, { surah: 1, ayah: 2 }] },
        { lineNumber: 3, ayahs: [{ surah: 1, ayah: 2 }] },
        { lineNumber: 4, ayahs: [{ surah: 115, ayah: 1 }] },
      ],
    });
    expect(refs).toEqual([{ surah: 1, ayah: 1 }, { surah: 1, ayah: 2 }]);
    expect(ayahsOnPage(null)).toEqual([]);
  });

  it('validates and clamps pages', () => {
    expect(isValidPage(1)).toBe(true);
    expect(isValidPage(605)).toBe(false);
    expect(isValidPage(2.5)).toBe(false);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(700)).toBe(604);
    expect(clampPage(Number.NaN)).toBe(1);
  });

  it('labels layouts and converts digits', () => {
    expect(layoutLabel('MADANI_15')).toBe('Madani (15-line)');
    expect(layoutLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(toArabicDigits(123)).toBe('١٢٣');
  });
});

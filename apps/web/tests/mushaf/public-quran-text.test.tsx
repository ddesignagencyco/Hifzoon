// @vitest-environment jsdom
import React from 'react';
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { envelope } from '../helpers/fetch-mock';
import { MushafViewer } from '@/components/mushaf/MushafViewer';
import { toPublicPage } from '@/lib/api/modules/quran-public';

// A real response from https://api.quran.com/api/v4/verses/by_page/1 (Al-Fatiha).
const PAGE_1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'quran-com-page-1.json'), 'utf-8'));

const fakeStructure = {
  layout: 'MADANI_15', page: 1, lines: [{ lineNumber: 1, ayahs: [{ surah: 1, ayah: 1 }] }],
  surahStart: 1, ayahStart: 1, licensed: false, source: 'fake', cachedUntil: '2026-10-20T00:00:00Z',
};

function mockFetch(publicOk = true) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('api.quran.com')) {
      return publicOk ? new Response(JSON.stringify(PAGE_1), { status: 200 }) : new Response('down', { status: 503 });
    }
    if (url.includes('/mushaf/pages/')) return new Response(JSON.stringify(envelope(fakeStructure)), { status: 200 });
    return new Response(JSON.stringify(envelope(null)), { status: 404 });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Quran text without a licensed provider (Quran.com fallback)', () => {
  it('maps the page into lines of words with 0-based positions and ayah-end markers', () => {
    const page = toPublicPage(1, PAGE_1.verses);
    const words = page.lines.flatMap((l) => l.words);
    expect(words.filter((w) => w.isAyahEnd)).toHaveLength(7);
    const first = words.find((w) => !w.isAyahEnd)!;
    expect(first).toMatchObject({ surah: 1, ayah: 1, wordIndex: 0 });
    expect(page.lines.every((l, i, a) => i === 0 || a[i - 1].lineNumber < l.lineNumber)).toBe(true);
  });

  it('shows the real text, attributed, and selecting a word gives its position', async () => {
    mockFetch();
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<MushafViewer layout="MADANI_15" page={1} onSelect={onSelect} />);

    expect(await screen.findByText(/text: Quran\.com \(Uthmani script\)/)).toBeTruthy();
    expect(screen.queryByText('Quran text is not licensed in this environment')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Surah 1, ayah 2, word 1' }));
    expect(onSelect).toHaveBeenCalledWith({ surah: 1, ayah: 2, wordIndex: 0 });
  });

  it('falls back to the ayah structure if Quran.com is unreachable', async () => {
    mockFetch(false);
    renderWithProviders(<MushafViewer layout="MADANI_15" page={1} />);
    expect(await screen.findByText('Quran text is not licensed in this environment')).toBeTruthy();
  });

  it('keeps the structure view for IndoPak (page numbers differ from Madani)', async () => {
    const spy = mockFetch();
    renderWithProviders(<MushafViewer layout="INDOPAK_13" page={1} />);
    expect(await screen.findByText('Quran text is not licensed in this environment')).toBeTruthy();
    expect(spy.mock.calls.some(([u]) => String(u).includes('api.quran.com'))).toBe(false);
  });
});

// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MushafViewer, WordPosition } from '@/components/mushaf/MushafViewer';
import { MistakeLogger } from '@/components/classroom/MistakeLogger';
import { chooseOption, optionLabels, renderWithProviders, findErrorToast } from '../helpers/render';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const CID = 'class-1';

function Harness({ students = [{ studentId: 's1', displayName: 'Amina' }] }: { students?: Array<{ studentId: string; displayName: string }> }) {
  const [selection, setSelection] = useState<WordPosition | null>(null);
  return (
    <>
      <MushafViewer layout="MADANI_15" page={1} selected={selection} onSelect={setSelection} />
      <MistakeLogger classId={CID} students={students} selection={selection} />
    </>
  );
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const licensedPage = {
  layout: 'MADANI_15',
  page: 1,
  lines: [{ lineNumber: 1, ayahs: [{ surah: 1, ayah: 1 }] }],
  surahStart: 1,
  ayahStart: 1,
  licensed: true,
  source: 'licensed-test',
  cachedUntil: '2026-10-20T00:00:00Z',
};

describe('MistakeLogger with the Mushaf viewer', () => {
  it('selecting a word fills the position and submits the MarkMistakeDto payload', async () => {
    const api = mockApi({
      'GET /mushaf/pages/MADANI_15/1': { body: envelope(licensedPage) },
      'GET /mushaf/ayah-words': {
        body: envelope({
          surah: 1,
          ayah: 1,
          words: [
            { index: 0, text: 'W0', tajweedRules: [] },
            { index: 1, text: 'W1', tajweedRules: ['ghunnah'] },
          ],
          licensed: true,
          source: 'licensed-test',
        }),
      },
      [`POST /classes/${CID}/mistakes`]: (c) => ({
        status: 201,
        body: envelope({ id: 'm1', classId: CID, confirmed: true, occurredAt: '2026-10-15T13:00:00Z', tajweedRule: null, ...(c.body as object) }),
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<Harness />);

    const word = await screen.findByRole('button', { name: 'Surah 1, ayah 1, word 1' });
    await user.click(word);
    expect(word.getAttribute('aria-pressed')).toBe('true');
    expect((document.getElementById('mistake-surah') as HTMLInputElement).value).toBe('1');
    expect((document.getElementById('mistake-ayah') as HTMLInputElement).value).toBe('1');
    expect((document.getElementById('mistake-word') as HTMLInputElement).value).toBe('1');

    await chooseOption(screen.getByLabelText(/Mistake type/), /tajweed/i);
    await user.type(screen.getByLabelText(/Tajweed rule/), 'Ghunnah');
    await user.click(screen.getByRole('button', { name: /Log mistake/ }));

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.url).toContain(`/classes/${CID}/mistakes`);
    expect(post.body).toEqual({ studentId: 's1', surah: 1, ayah: 1, wordIndex: 1, type: 'TAJWEED_RULE', tajweedRule: 'Ghunnah' });
  });

  it('blocks submission until a type and student are chosen', async () => {
    const api = mockApi({
      'GET /mushaf/pages/MADANI_15/1': { body: envelope({ ...licensedPage, licensed: false, source: 'fake' }) },
    });
    const user = userEvent.setup();
    renderWithClient(
      <Harness
        students={[
          { studentId: 's1', displayName: 'Amina' },
          { studentId: 's2', displayName: 'Bilal' },
        ]}
      />,
    );

    // Unlicensed: structure-only view with a notice, ayahs are selectable.
    expect((await screen.findByText(/not licensed in this environment/i))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Select Surah 1, ayah 1' }));
    expect((document.getElementById('mistake-word') as HTMLInputElement).value).toBe('0');

    await user.click(screen.getByRole('button', { name: /Log mistake/ }));
    expect((screen.getByText('Choose the student who made the mistake'))).toBeTruthy();
    expect((screen.getByText('Choose a mistake type'))).toBeTruthy();
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('explains a 403 for a trial student instead of a generic permission error', async () => {
    mockApi({
      'GET /mushaf/pages/MADANI_15/1': { body: envelope(licensedPage) },
      'GET /mushaf/ayah-words': {
        body: envelope({ surah: 1, ayah: 1, words: [{ index: 0, text: 'W0', tajweedRules: [] }], licensed: true, source: 'licensed-test' }),
      },
      [`POST /classes/${CID}/mistakes`]: apiError(403, 'NOT_RESOURCE_OWNER', 'You do not have access to this resource'),
    });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Surah 1, ayah 1, word 0' }));
    await chooseOption(screen.getByLabelText(/Mistake type/), /tajweed/i);
    await user.type(screen.getByLabelText(/Tajweed rule/), 'Ghunnah');
    await user.click(screen.getByRole('button', { name: /Log mistake/ }));

    await findErrorToast(/only be saved for students enrolled with you/i);
  }, 15_000);
});

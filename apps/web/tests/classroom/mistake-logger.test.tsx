// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogMistakeDialog, type LogTarget } from '@/components/classroom/LogMistakeDialog';
import { findErrorToast, renderWithProviders } from '../helpers/render';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const CID = 'class-1';
const ONE = [{ studentId: 's1', displayName: 'Amina' }];
const TWO = [...ONE, { studentId: 's2', displayName: 'Bilal' }];
const WORD: LogTarget = { kind: 'word', position: { surah: 112, ayah: 3, wordIndex: 1 }, text: 'يَلِدْ' };
const DUA_WORD: LogTarget = { kind: 'item', label: 'Supplications for when you wake up (1) · word 2 (لِلَّهِ)' };

const created = (c: { body: unknown }) => ({
  status: 201,
  body: envelope({ id: 'm1', classId: CID, confirmed: true, occurredAt: '2026-10-15T13:00:00Z', tajweedRule: null, ...(c.body as object) }),
});

function open(target: LogTarget, { students = ONE, courseType = null as string | null, onLogged = vi.fn(), onClose = vi.fn() } = {}) {
  renderWithProviders(
    <LogMistakeDialog open onClose={onClose} classId={CID} courseType={courseType} students={students} target={target} onLogged={onLogged} />,
  );
  return { dialog: screen.getByRole('dialog', { name: 'Log a mistake' }), onLogged, onClose };
}

describe('LogMistakeDialog (quick log from the selected word)', () => {
  it('shows the selected Mushaf word, one tap picks the kind, and Enter logs the MarkMistakeDto', async () => {
    const api = mockApi({ [`POST /classes/${CID}/mistakes`]: created });
    const user = userEvent.setup();
    const { dialog, onLogged, onClose } = open(WORD);

    expect(within(dialog).getByText('112:3 · word 2')).toBeTruthy();
    expect(within(dialog).getByText('يَلِدْ')).toBeTruthy();
    // One student: no picker.
    expect(within(dialog).queryByRole('group', { name: 'Student' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Tajweed rule' }));
    expect(within(dialog).getByRole('button', { name: 'Tajweed rule' }).getAttribute('aria-pressed')).toBe('true');
    await user.type(within(dialog).getByLabelText(/Tajweed rule/), 'Ghunnah{Enter}');

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({
      studentId: 's1',
      surah: 112,
      ayah: 3,
      wordIndex: 1,
      type: 'TAJWEED_RULE',
      tajweedRule: 'Ghunnah',
    });
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('a board word logs against its item, with the course’s own kinds', async () => {
    const api = mockApi({ [`POST /classes/${CID}/mistakes`]: created });
    const user = userEvent.setup();
    const { dialog } = open(DUA_WORD, { courseType: 'DUAS' });
    expect(within(dialog).getByText(DUA_WORD.kind === 'item' ? (DUA_WORD.label as string) : '')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Tajweed rule' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Memory / recall' }));
    await user.click(within(dialog).getByRole('button', { name: /Log mistake/ }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({
      studentId: 's1',
      type: 'MEMORY',
      itemRef: 'Supplications for when you wake up (1) · word 2 (لِلَّهِ)',
    });
  });

  it('with two students, asks who and what before logging', async () => {
    const api = mockApi({ [`POST /classes/${CID}/mistakes`]: created });
    const user = userEvent.setup();
    const { dialog } = open(WORD, { students: TWO });
    await user.click(within(dialog).getByRole('button', { name: /Log mistake/ }));
    await findErrorToast('Choose the student who made the mistake');
    await user.click(within(dialog).getByRole('button', { name: 'Bilal' }));
    await user.click(within(dialog).getByRole('button', { name: /Log mistake/ }));
    await findErrorToast('Choose what kind of mistake it was');
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('explains a 403 for a trial student instead of a generic permission error', async () => {
    mockApi({ [`POST /classes/${CID}/mistakes`]: apiError(403, 'NOT_RESOURCE_OWNER', 'You do not have access to this resource') });
    const user = userEvent.setup();
    const { dialog } = open(WORD);
    await user.click(within(dialog).getByRole('button', { name: 'Skipped word' }));
    await user.click(within(dialog).getByRole('button', { name: /Log mistake/ }));
    await findErrorToast(/only be saved for students enrolled with you/i);
  });

  it('Esc closes it', async () => {
    mockApi({});
    const user = userEvent.setup();
    const { onClose } = open(WORD);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Log a mistake' })).toBeTruthy();
  });
});

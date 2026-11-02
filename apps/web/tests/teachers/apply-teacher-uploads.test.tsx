// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption, findErrorToast, renderWithProviders } from '../helpers/render';
import { envelope, mockApi, type MockCall } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/apply-teacher',
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }));

import ApplyTeacherPage from '@/app/apply-teacher/page';

beforeEach(() => {
  // jsdom has no object URLs; the page only uses them for the preview <audio>.
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Presign answers with a key per kind and content type; storage PUTs succeed. */
function presignResponder(call: MockCall) {
  const body = call.body as { kind: string; contentType: string };
  const folder = body.kind === 'RECITATION_AUDIO' ? 'recitations' : 'documents';
  const name = `${folder}-${body.contentType.replace('/', '-')}`;
  return {
    body: envelope({
      key: `${folder}/2026/${name}`,
      url: `http://storage.test/hifzoon/${folder}/2026/${name}?sig=1`,
      method: 'PUT',
      headers: { 'Content-Type': body.contentType },
      expiresInSeconds: 900,
      maxBytes: 1,
    }),
  };
}

/** The "Subjects you can teach" chips come from the public course catalogue. */
const COURSES = {
  'GET /courses': { body: envelope([{ id: 'c-hifz', code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: '', levels: [] }]) },
};

// The page is large and the country list long: type with change events, not keystrokes.
vi.setConfig({ testTimeout: 30_000 });

async function fillApplicant() {
  fireEvent.change(document.getElementById('apply-name')!, { target: { value: 'Ustadh Omar' } });
  fireEvent.change(document.getElementById('apply-email')!, { target: { value: 'omar@example.com' } });
  // The page also renders the phone input's dial-code options, so pick the country
  // select's own option rather than the first "Pakistan" on the page.
  const country = screen.getByLabelText('Country of residence');
  fireEvent.focus(country);
  fireEvent.keyDown(country, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
  const option = (await screen.findAllByRole('option')).find(
    (el) => el.className.includes('hz-country-select__option') && /Pakistan/.test(el.textContent ?? ''),
  );
  fireEvent.click(option!);
  // Nothing is pre-selected any more: the applicant chooses every answer.
  fireEvent.click(screen.getByRole('button', { name: /Male \(Ustadh\)/ }));
  await chooseOption(screen.getByLabelText('Years of teaching experience'), /5 – 8 Years/);
  fireEvent.change(document.getElementById('apply-qiraat')!, { target: { value: 'Hafs ‘an ‘Asim' } });
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Hifz' }));
  fireEvent.click(screen.getByRole('button', { name: '6–9 years' }));
  fireEvent.change(screen.getByLabelText('Referee 1 full name'), { target: { value: 'Shaykh Karim' } });
  fireEvent.change(screen.getByLabelText('Referee 1 how they know you'), { target: { value: 'Principal' } });
  fireEvent.change(screen.getByLabelText('Referee 1 email or phone'), { target: { value: 'karim@example.com' } });
}

describe('apply-teacher: direct-to-storage uploads (M34)', () => {
  it('uploads the audio and documents, then sends only their keys', async () => {
    const api = mockApi({
      ...COURSES,
      'POST /uploads/presign': presignResponder,
      'PUT /hifzoon/recitations/2026/recitations-audio-mpeg': { status: 200 },
      'PUT /hifzoon/documents/2026/documents-application-pdf': { status: 200 },
      'PUT /hifzoon/documents/2026/documents-image-png': { status: 200 },
      'POST /teachers/applications': { status: 201, body: envelope({ id: 'app-1', status: 'SUBMITTED' }) },
    });
    const user = userEvent.setup();
    renderWithProviders(<ApplyTeacherPage />);
    await fillApplicant();

    await user.click(screen.getByRole('button', { name: /upload audio$/i }));
    fireEvent.change(screen.getByLabelText('Recitation audio file'), {
      target: { files: [new File(['audio-bytes'], 'fatiha.mp3', { type: 'audio/mpeg' })] },
    });
    fireEvent.change(screen.getByLabelText('Photo ID document'), {
      target: { files: [new File(['%PDF'], 'passport.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(screen.getByLabelText('Certificate document'), {
      target: { files: [new File(['png'], 'ijazah.png', { type: 'image/png' })] },
    });

    await user.click(screen.getByRole('button', { name: /submit application/i }));
    expect(await screen.findByText('Faculty Application Received')).toBeTruthy();

    const presigns = api.calls.filter((c) => c.url.includes('/uploads/presign')).map((c) => c.body);
    expect(presigns).toEqual([
      { kind: 'RECITATION_AUDIO', contentType: 'audio/mpeg', size: 11 },
      { kind: 'APPLICATION_DOCUMENT', contentType: 'application/pdf', size: 4 },
      { kind: 'APPLICATION_DOCUMENT', contentType: 'image/png', size: 3 },
    ]);
    const puts = api.calls.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => c.headers.get('Content-Type'))).toEqual(['audio/mpeg', 'application/pdf', 'image/png']);

    const submit = api.calls.find((c) => c.url.includes('/teachers/applications'))!;
    const body = submit.body as Record<string, unknown>;
    expect(body.recitationAudioKey).toBe('recitations/2026/recitations-audio-mpeg');
    expect(body.documents).toEqual({
      ID: 'documents/2026/documents-application-pdf',
      CERTIFICATE: 'documents/2026/documents-image-png',
    });
    expect(JSON.stringify(body)).not.toContain('data:');
    expect(body.references).toEqual([{ name: 'Shaykh Karim', relationship: 'Principal', email: 'karim@example.com' }]);
    expect(body.qualifications).toMatchObject({ gender: 'MALE', yearsExp: '5-8', languages: ['en'], subjects: ['HIFZ'], ageGroups: ['6-9'] });
    // The application is sent last, after every upload has finished.
    expect(api.calls.at(-1)).toBe(submit);
  });

  it('asks for every answer and a recorded or uploaded recitation before sending anything', async () => {
    const api = mockApi(COURSES);
    const user = userEvent.setup();
    renderWithProviders(<ApplyTeacherPage />);
    // Shared links are no longer accepted for the audition.
    expect(screen.queryByRole('button', { name: /paste link/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /submit application/i }));
    await findErrorToast(/fix the highlighted fields/i);
    expect(screen.getByText('Choose Ustadh or Ustadhah.')).toBeTruthy();
    expect(screen.getByText('Choose at least one subject you can teach.')).toBeTruthy();
    expect(screen.getByText('Record your recitation or upload an audio file.')).toBeTruthy();
    expect(screen.getByText('Upload a photo ID (passport or national ID).')).toBeTruthy();
    expect(screen.getByText(/Give the referee’s name/)).toBeTruthy();
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('refuses an oversize audio file and a wrong document type before any request', async () => {
    const api = mockApi({});
    const user = userEvent.setup();
    renderWithProviders(<ApplyTeacherPage />);
    await user.click(screen.getByRole('button', { name: /upload audio$/i }));
    const big = new File(['x'], 'long.wav', { type: 'audio/wav' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText('Recitation audio file'), { target: { files: [big] } });
    await findErrorToast(/25 MB or smaller/);

    fireEvent.change(screen.getByLabelText('Reference document'), {
      target: { files: [new File(['x'], 'ref.docx', { type: 'application/msword' })] },
    });
    await findErrorToast(/PDF, JPG or PNG/);
    expect(screen.getByLabelText('Reference document').getAttribute('aria-invalid')).toBe('true');
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('stops with a clear toast when the storage PUT fails, and does not submit', async () => {
    const api = mockApi({
      ...COURSES,
      'POST /uploads/presign': presignResponder,
      'PUT /hifzoon/recitations/2026/recitations-audio-mpeg': { status: 500 },
    });
    const user = userEvent.setup();
    renderWithProviders(<ApplyTeacherPage />);
    await fillApplicant();
    await user.click(screen.getByRole('button', { name: /upload audio$/i }));
    fireEvent.change(screen.getByLabelText('Recitation audio file'), {
      target: { files: [new File(['a'], 'fatiha.mp3', { type: 'audio/mpeg' })] },
    });
    fireEvent.change(screen.getByLabelText('Photo ID document'), {
      target: { files: [new File(['%PDF'], 'id.pdf', { type: 'application/pdf' })] },
    });
    await user.click(screen.getByRole('button', { name: /submit application/i }));
    await findErrorToast(/recitation could not be uploaded/i);
    expect(api.calls.some((c) => c.url.includes('/teachers/applications'))).toBe(false);
  });
});

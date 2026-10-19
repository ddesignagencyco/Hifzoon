// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import { AiFlagReview } from '@/components/classroom/MistakeList';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CID = 'class-1';

describe('AI flags in the classroom', () => {
  it('a 403 for a trial student is a short note, not an access-denied card, and other students still load', async () => {
    mockApi({
      'GET /students/s-trial/mistakes': apiError(403, 'NOT_RESOURCE_OWNER', 'You do not have access to this record'),
      'GET /students/s-enrolled/mistakes': {
        body: envelope([
          { id: 'm1', surah: 1, ayah: 2, wordIndex: 0, type: 'TAJWEED_RULE', tajweedRule: null, source: 'AI', confirmed: false, dismissedAt: null, occurredAt: '2026-10-17T13:20:00Z', lessonCardId: null, classId: CID },
        ]),
      },
    });
    renderWithProviders(
      <AiFlagReview
        classId={CID}
        students={[
          { studentId: 's-trial', displayName: 'Rehman' },
          { studentId: 's-enrolled', displayName: 'Maryam' },
        ]}
      />,
    );
    expect(await screen.findByLabelText('AI-flagged mistakes')).toBeTruthy();
    expect(screen.getByText(/Maryam · 1:2/)).toBeTruthy();
    expect(screen.queryByText(/don.t have access/i)).toBeNull();
  });

  it('with only a trial student, explains why there are no AI flags', async () => {
    mockApi({ 'GET /students/s-trial/mistakes': apiError(403, 'NOT_RESOURCE_OWNER', 'nope') });
    renderWithProviders(<AiFlagReview classId={CID} students={[{ studentId: 's-trial', displayName: 'Rehman' }]} />);
    expect(await screen.findByText(/AI flags aren.t available for Rehman yet/)).toBeTruthy();
    expect(screen.queryByText(/don.t have access/i)).toBeNull();
  });

  it('other errors still offer Retry', async () => {
    mockApi({ 'GET /students/s1/mistakes': apiError(500, 'INTERNAL_ERROR', 'Internal server error') });
    renderWithProviders(<AiFlagReview classId={CID} students={[{ studentId: 's1', displayName: 'Amina' }]} />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

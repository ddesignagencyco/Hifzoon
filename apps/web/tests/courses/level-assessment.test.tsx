// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeacherLevelPanel, atLevelEnd, levelLine } from '@/components/courses/LevelAssessment';
import { previewScore } from '@/lib/api/modules/assessments';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { findSuccessToast, renderWithProviders } from '../helpers/render';

const LEVEL = {
  id: 'l1',
  name: 'Level 1',
  position: 1,
  passMark: 70,
  rubric: { Tajweed: 50, Fluency: 50 },
  lessonCount: 10,
};

describe('level helpers', () => {
  it('previews the weighted score only once every criterion is valid', () => {
    expect(previewScore({ A: 50, B: 30, C: 20 }, { A: '80', B: '60', C: '100' })).toBe(78);
    expect(previewScore({ A: 50, B: 50 }, { A: '80' })).toBeNull();
    expect(previewScore({ A: 100 }, { A: '101' })).toBeNull();
  });

  it('describes the level and spots the last lesson', () => {
    expect(levelLine({ currentLevel: LEVEL, currentLessonPosition: 4 })).toBe(
      'Level 1 · lesson 4 of 10',
    );
    expect(levelLine({ currentLevel: null, currentLessonPosition: 1 })).toBe('Not on a level yet');
    expect(atLevelEnd({ currentLevel: LEVEL, currentLessonPosition: 10 })).toBe(true);
    expect(atLevelEnd({ currentLevel: LEVEL, currentLessonPosition: 9 })).toBe(false);
  });
});

describe('TeacherLevelPanel', () => {
  it('suggests the assessment at the end of the level and records one', async () => {
    const api = mockApi({
      'GET /courses/enrolments/enr-1/assessments': {
        body: envelope({ currentLevel: LEVEL, currentLessonPosition: 10, assessments: [] }),
      },
      'POST /courses/enrolments/enr-1/assessments': {
        status: 201,
        body: envelope({
          assessment: {
            id: 'a1',
            type: 'LEVEL',
            result: 'PASS',
            score: 80,
            rubricScores: {},
            notes: null,
            takenAt: null,
            createdAt: '2026-11-06T00:00:00Z',
            examinerId: 't1',
            level: LEVEL,
          },
          advancedTo: { id: 'l2', name: 'Level 2', position: 2 },
          finalLevel: false,
        }),
      },
    });
    renderWithProviders(<TeacherLevelPanel enrolmentId="enr-1" />);

    expect(await screen.findByText('Last lesson of the level')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Assess level/ }));
    await userEvent.type(screen.getByLabelText('Tajweed (50%)'), '90');
    await userEvent.type(screen.getByLabelText('Fluency (50%)'), '70');
    expect(screen.getByText('80%')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Record assessment' }));

    await findSuccessToast(/Moved to Level 2/);
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
        rubricScores: { Tajweed: 90, Fluency: 70 },
      }),
    );
  });

  it('refuses to submit until every criterion is scored', async () => {
    const api = mockApi({
      'GET /courses/enrolments/enr-1/assessments': {
        body: envelope({ currentLevel: LEVEL, currentLessonPosition: 3, assessments: [] }),
      },
    });
    renderWithProviders(<TeacherLevelPanel enrolmentId="enr-1" />);

    await userEvent.click(await screen.findByRole('button', { name: /Assess level/ }));
    await userEvent.type(screen.getByLabelText('Tajweed (50%)'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Record assessment' }));

    expect(await screen.findByText(/Give every criterion a score/)).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(screen.queryByText('Last lesson of the level')).toBeNull();
  });
});

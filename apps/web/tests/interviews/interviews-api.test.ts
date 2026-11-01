import { describe, it, expect } from 'vitest';
import {
  INTERVIEW_EARLY_OPEN_MINUTES,
  averageScore,
  interviewJoinWindow,
  interviewRoleLabel,
  interviewStatusLabel,
  interviewsApi,
  isFakeInterviewUrl,
  isInterviewClosed,
  validateInterviewOutcome,
  validateScheduleInterview,
} from '@/lib/api/modules/interviews';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';

const INTERVIEW = '01a13fa3-aa2d-7512-865f-d5613c10e08f';
const APPLICATION = '01a13fa3-a29e-7ee2-b12d-31d933c03130';
const MINUTE = 60_000;

describe('interviews API module', () => {
  it('lists interviews, passing only the filters that were set', async () => {
    const api = mockApi({ 'GET /interviews': { body: envelope([]) } });

    await interviewsApi.list();
    await interviewsApi.list({ applicationId: APPLICATION, status: 'LIVE', mine: true });

    expect(api.calls[0].url).toMatch(/\/interviews$/);
    expect(api.calls[1].url).toContain(`applicationId=${APPLICATION}`);
    expect(api.calls[1].url).toContain('status=LIVE');
    expect(api.calls[1].url).toContain('mine=true');
  });

  it('books an interview and returns the one-time applicant link', async () => {
    const api = mockApi({
      'POST /interviews': {
        body: envelope({
          id: INTERVIEW,
          applicantJoinUrl: 'https://hifzoon.test/interview/abc',
          durationMinutes: 30,
        }),
      },
    });

    const result = await interviewsApi.schedule({
      applicationId: APPLICATION,
      startsAt: '2026-11-10T09:00:00.000Z',
      durationMinutes: 30,
      stage: 'DEMO_CLASS',
      timeZone: 'Asia/Karachi',
    });

    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].body).toMatchObject({ applicationId: APPLICATION, stage: 'DEMO_CLASS' });
    expect(result.applicantJoinUrl).toBe('https://hifzoon.test/interview/abc');
  });

  it('sends the applicant token in the body, never in the URL', async () => {
    const api = mockApi({
      'POST /interviews/join': { body: envelope({ interviewId: INTERVIEW, window: 'open' }) },
      'POST /interviews/join/room': { body: envelope({ iid: INTERVIEW, role: 'APPLICANT' }) },
    });

    await interviewsApi.lobby('secret-token');
    await interviewsApi.joinRoom('secret-token');

    for (const call of api.calls) {
      // A token in a path lands in access logs, history and `Referer` headers.
      expect(call.url).not.toContain('secret-token');
      expect(call.body).toEqual({ token: 'secret-token' });
    }
  });

  it('polls the applicant’s own state route, which carries no notes', async () => {
    const api = mockApi({
      'POST /interviews/join/state': {
        body: envelope({ interviewId: INTERVIEW, status: 'LIVE', notes: null, participants: [] }),
      },
    });

    const snapshot = await interviewsApi.joinState('secret-token');

    // The staff `state` route is role-guarded, so an applicant must not be sent there.
    expect(api.calls[0].url).toContain('/interviews/join/state');
    expect(api.calls[0].body).toEqual({ token: 'secret-token' });
    expect(snapshot.notes).toBeNull();
  });

  it('surfaces an expired link as a real error', async () => {
    mockApi({
      'POST /interviews/join': apiError(401, 'TOKEN_EXPIRED', 'This interview link has expired'),
    });
    await expect(interviewsApi.lobby('old-token')).rejects.toThrow(/expired/);
  });

  it('posts the verdict with its rubric', async () => {
    const api = mockApi({
      [`POST /interviews/${INTERVIEW}/outcome`]: {
        body: envelope({
          id: INTERVIEW,
          outcome: 'PASSED',
          recordStepHint: { applicationId: APPLICATION, step: 'DEMO_CLASS', suggestedStatus: 'PASSED' },
        }),
      },
    });

    const result = await interviewsApi.recordOutcome(INTERVIEW, {
      outcome: 'PASSED',
      outcomeNotes: 'Strong recitation',
      scores: { tajweedScore: 4 },
    });

    expect(api.calls[0].body).toMatchObject({ outcome: 'PASSED', scores: { tajweedScore: 4 } });
    // The pipeline is not moved here — the step is only named back for the admin to record.
    expect(result.recordStepHint.step).toBe('DEMO_CLASS');
  });

  it('omits an empty cancel reason rather than sending a blank one', async () => {
    const api = mockApi({
      [`POST /interviews/${INTERVIEW}/cancel`]: { body: envelope({ id: INTERVIEW, status: 'CANCELLED' }) },
    });

    await interviewsApi.cancel(INTERVIEW, '   ');
    await interviewsApi.cancel(INTERVIEW, 'Qari shb is unwell');

    expect(api.calls[0].body).toEqual({});
    expect(api.calls[1].body).toEqual({ reason: 'Qari shb is unwell' });
  });
});

describe('interviewJoinWindow', () => {
  const startsAt = new Date('2026-11-10T09:00:00.000Z');
  const endsAt = new Date('2026-11-10T09:30:00.000Z');
  const at = (offsetMinutes: number) => startsAt.getTime() + offsetMinutes * MINUTE;

  it('mirrors the window the API enforces', () => {
    expect(interviewJoinWindow(startsAt.toISOString(), endsAt.toISOString(), at(-20))).toBe('early');
    // Exactly at the early-open boundary the room is open, as the API has it.
    expect(
      interviewJoinWindow(startsAt.toISOString(), endsAt.toISOString(), at(-INTERVIEW_EARLY_OPEN_MINUTES)),
    ).toBe('open');
    expect(interviewJoinWindow(startsAt.toISOString(), endsAt.toISOString(), at(15))).toBe('open');
    // The grace period after the end matches the one before the start.
    expect(interviewJoinWindow(startsAt.toISOString(), endsAt.toISOString(), at(35))).toBe('open');
    expect(interviewJoinWindow(startsAt.toISOString(), endsAt.toISOString(), at(45))).toBe('closed');
  });
});

describe('interview status helpers', () => {
  it('treats every finished state as closed, and only those', () => {
    expect(isInterviewClosed('SCHEDULED')).toBe(false);
    expect(isInterviewClosed('LIVE')).toBe(false);
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW_APPLICANT', 'NO_SHOW_INTERVIEWER'] as const) {
      expect(isInterviewClosed(status)).toBe(true);
    }
  });

  it('labels statuses and roles in words a person would use', () => {
    expect(interviewStatusLabel('NO_SHOW_APPLICANT')).toBe('Applicant did not attend');
    expect(interviewRoleLabel('INTERVIEWER')).toBe('Interviewer');
    // An unknown value falls back to itself rather than rendering blank.
    expect(interviewRoleLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('spots the development fake video URL', () => {
    expect(isFakeInterviewUrl('fake://room/abc')).toBe(true);
    expect(isFakeInterviewUrl('wss://livekit.hifzoon.test')).toBe(false);
    expect(isFakeInterviewUrl(null)).toBe(false);
  });
});

describe('validateScheduleInterview', () => {
  const now = new Date('2026-11-02T12:00:00.000Z').getTime();

  it('accepts a future booking of an allowed length', () => {
    expect(
      validateScheduleInterview({ startsAt: '2026-11-03T09:00:00.000Z', durationMinutes: 45 }, now),
    ).toBeNull();
  });

  it('rejects a missing or unparseable time', () => {
    expect(validateScheduleInterview({ startsAt: '' }, now)).toMatch(/date and time/);
    expect(validateScheduleInterview({ startsAt: 'tomorrow-ish' }, now)).toMatch(/date and time/);
  });

  it('rejects the past and an out-of-range length, mirroring the API', () => {
    expect(validateScheduleInterview({ startsAt: '2026-11-01T09:00:00.000Z' }, now)).toMatch(/past/);
    expect(
      validateScheduleInterview({ startsAt: '2026-11-03T09:00:00.000Z', durationMinutes: 5 }, now),
    ).toMatch(/between 10 and 120/);
    expect(
      validateScheduleInterview({ startsAt: '2026-11-03T09:00:00.000Z', durationMinutes: 180 }, now),
    ).toMatch(/between 10 and 120/);
  });
});

describe('validateInterviewOutcome', () => {
  it('accepts a decision with or without scores', () => {
    expect(validateInterviewOutcome({ outcome: 'PASSED' })).toBeNull();
    expect(validateInterviewOutcome({ outcome: 'FAILED', scores: { tajweedScore: 2 } })).toBeNull();
  });

  it('refuses PENDING, which is the state before a verdict', () => {
    expect(validateInterviewOutcome({ outcome: 'PENDING' })).toMatch(/passed or failed/);
  });

  it('refuses a score off the 1-5 scale', () => {
    expect(validateInterviewOutcome({ outcome: 'PASSED', scores: { tajweedScore: 0 } })).toMatch(
      /between 1 and 5/,
    );
    expect(validateInterviewOutcome({ outcome: 'PASSED', scores: { tajweedScore: 9 } })).toMatch(
      /between 1 and 5/,
    );
  });

  it('ignores a cleared score', () => {
    expect(validateInterviewOutcome({ outcome: 'PASSED', scores: { tajweedScore: null } })).toBeNull();
  });
});

describe('averageScore', () => {
  it('averages only what was actually scored, to one decimal', () => {
    expect(averageScore({ tajweedScore: 4, recitationScore: 5, teachingScore: null })).toBe(4.5);
    expect(averageScore({ tajweedScore: 4, recitationScore: 5, teachingScore: 4 })).toBe(4.3);
  });

  it('is null when nothing is scored, rather than zero', () => {
    expect(averageScore({})).toBeNull();
    expect(averageScore(null)).toBeNull();
    expect(averageScore({ tajweedScore: null })).toBeNull();
  });
});

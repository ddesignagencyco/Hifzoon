import { describe, it, expect } from 'vitest';
import {
  emptyPortion,
  formatRange,
  hoursUntilLock,
  lessonsApi,
  portionToDraft,
  validateLessonCardDraft,
  validateMistakeDraft,
} from '@/lib/api/modules/lessons';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const CID = 'class-1';
const LID = 'card-1';

describe('lessons API module — mistakes', () => {
  it('marks a mistake with the MarkMistakeDto body', async () => {
    const api = mockApi({
      [`POST /classes/${CID}/mistakes`]: (c) => ({
        status: 201,
        body: envelope({ id: 'm1', classId: CID, confirmed: true, occurredAt: '2026-10-15T13:00:00Z', tajweedRule: null, ...(c.body as object) }),
      }),
    });
    const m = await lessonsApi.markMistake(CID, { studentId: 's1', surah: 2, ayah: 5, wordIndex: 1, type: 'TAJWEED_RULE', tajweedRule: 'Ghunnah' });
    expect(api.calls[0].body).toEqual({ studentId: 's1', surah: 2, ayah: 5, wordIndex: 1, type: 'TAJWEED_RULE', tajweedRule: 'Ghunnah' });
    expect(m.id).toBe('m1');
  });

  it('lists class and student mistakes', async () => {
    const api = mockApi({
      [`GET /classes/${CID}/mistakes`]: { body: envelope([{ id: 'm1', studentId: 's1', surah: 1, ayah: 1, wordIndex: 0, type: 'SKIPPED_WORD', tajweedRule: null, occurredAt: '' }]) },
      'GET /students/s1/mistakes': { body: envelope([{ id: 'm1', source: 'AI', confirmed: false, dismissedAt: null, classId: CID }]) },
    });
    expect(await lessonsApi.classMistakes(CID)).toHaveLength(1);
    const history = await lessonsApi.studentMistakes('s1', { limit: 50, type: 'SKIPPED_WORD' });
    expect(api.calls[1].url).toContain('/students/s1/mistakes?limit=50&type=SKIPPED_WORD');
    expect(history[0].source).toBe('AI');
  });

  it('dismisses and confirms AI-flagged mistakes', async () => {
    const api = mockApi({
      'POST /mistakes/m1/dismiss': { body: envelope({ dismissed: true }) },
      'POST /mistakes/m1/confirm': { body: envelope({ id: 'm1', confirmed: true, dismissedAt: null }) },
    });
    expect(await lessonsApi.dismissMistake('m1', 'false positive')).toEqual({ dismissed: true });
    expect(api.calls[0].body).toEqual({ reason: 'false positive' });
    expect((await lessonsApi.confirmMistake('m1')).confirmed).toBe(true);
  });

  it('surfaces ownership errors', async () => {
    mockApi({ [`POST /classes/${CID}/mistakes`]: apiError(403, 'NOT_RESOURCE_OWNER', 'Not your student') });
    await expect(
      lessonsApi.markMistake(CID, { studentId: 's9', surah: 1, ayah: 1, wordIndex: 0, type: 'ADDED_WORD' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('lessons API module — lesson cards', () => {
  it('prefills, submits, reads, updates and reads the edit log', async () => {
    const api = mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: { body: envelope({ classId: CID, portions: [], students: [] }) },
      [`POST /classes/${CID}/lesson-card`]: { status: 201, body: envelope({ id: LID, submittedAt: '2026-10-15T13:00:00Z', portions: [] }) },
      [`GET /lesson-cards/${LID}`]: { body: envelope({ id: LID, locked: false }) },
      [`PATCH /lesson-cards/${LID}`]: (c) => ({ body: envelope({ id: LID, locked: true, loggedAsSupervisorEdit: true, ...(c.body as object) }) }),
      [`GET /lesson-cards/${LID}/edit-log`]: { body: envelope([{ id: 'e1', reason: 'fix', editor: { id: 'u', name: 'Sup' } }]) },
    });
    expect((await lessonsApi.prefill(CID)).classId).toBe(CID);
    const body = { homework: 'Revise', portions: [{ kind: 'SABAQ' as const, fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5, grade: 'GOOD' as const }] };
    expect((await lessonsApi.submit(CID, body)).id).toBe(LID);
    expect(api.calls[1].body).toEqual(body);
    expect((await lessonsApi.get(LID)).locked).toBe(false);
    const updated = await lessonsApi.update(LID, { parentNote: 'x', reason: 'fix' });
    expect(api.calls[3].method).toBe('PATCH');
    expect(api.calls[3].body).toEqual({ parentNote: 'x', reason: 'fix' });
    expect(updated.loggedAsSupervisorEdit).toBe(true);
    expect(await lessonsApi.editLog(LID)).toHaveLength(1);
  });

  it('carries the existing card id on a 409 prefill', async () => {
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: apiError(409, 'CONFLICT', 'This lesson card has already been submitted', { lessonCardId: LID, locked: false }),
    });
    await expect(lessonsApi.prefill(CID)).rejects.toMatchObject({ status: 409, details: { lessonCardId: LID } });
  });

  it('saves and approves the AI draft', async () => {
    const api = mockApi({
      [`PATCH /lesson-cards/${LID}/ai-draft`]: (c) => ({ body: envelope({ id: LID, aiSummaryDraft: (c.body as { draft: string }).draft, summaryApprovedAt: null }) }),
      [`POST /lesson-cards/${LID}/ai-draft/approve`]: { body: envelope({ approvedAt: '2026-10-15T14:00:00Z' }) },
    });
    expect((await lessonsApi.saveAiDraft(LID, 'Great class')).aiSummaryDraft).toBe('Great class');
    expect(api.calls[0].body).toEqual({ draft: 'Great class' });
    expect((await lessonsApi.approveAiDraft(LID)).approvedAt).toBeTruthy();
  });
});

describe('lesson validation', () => {
  it('validates a mistake draft against MarkMistakeDto', () => {
    const bad = validateMistakeDraft({ studentId: '', surah: '0', ayah: '0', wordIndex: '-1', type: '', tajweedRule: 'x'.repeat(81) });
    expect(Object.keys(bad.errors).sort()).toEqual(['ayah', 'studentId', 'surah', 'tajweedRule', 'type', 'wordIndex']);
    expect(bad.payload).toBeUndefined();

    const ok = validateMistakeDraft({ studentId: 's1', surah: '2', ayah: '5', wordIndex: '0', type: 'STOP_WAQF', tajweedRule: '  ' });
    expect(ok.payload).toEqual({ studentId: 's1', surah: 2, ayah: 5, wordIndex: 0, type: 'STOP_WAQF' });
  });

  it('requires at least one portion and valid ranges', () => {
    expect(validateLessonCardDraft({ homework: '', parentNote: '', portions: [] }).errors.portions).toBeTruthy();
    const r = validateLessonCardDraft({
      homework: '',
      parentNote: '',
      portions: [{ kind: '', fromSurah: '115', fromAyah: '0', toSurah: '', toAyah: '', grade: '' }],
    });
    expect(r.errors['portions.0.kind']).toBeTruthy();
    expect(r.errors['portions.0.fromSurah']).toMatch(/1 and 114/);
    expect(r.errors['portions.0.fromAyah']).toMatch(/1 or greater/);
  });

  it('rejects a range that ends before it starts and overlong text', () => {
    const r = validateLessonCardDraft({
      homework: 'x'.repeat(2001),
      parentNote: '',
      portions: [{ kind: 'SABAQ', fromSurah: '3', fromAyah: '1', toSurah: '2', toAyah: '5', grade: '' }],
    });
    expect(r.errors['portions.0.toSurah']).toMatch(/ends before/);
    expect(r.errors.homework).toBeTruthy();
  });

  it('builds a clean payload, omitting empty optional fields', () => {
    const r = validateLessonCardDraft({
      homework: ' Revise page 3 ',
      parentNote: '',
      portions: [{ kind: 'SABQI', fromSurah: '2', fromAyah: '', toSurah: '2', toAyah: '10', grade: 'EXCELLENT' }],
    });
    expect(r.payload).toEqual({ homework: 'Revise page 3', portions: [{ kind: 'SABQI', fromSurah: 2, toSurah: 2, toAyah: 10, grade: 'EXCELLENT' }] });
  });

  it('round-trips portions and formats ranges', () => {
    expect(portionToDraft({ kind: 'MANZIL', fromSurah: 1, toSurah: null, grade: null })).toEqual({ ...emptyPortion('MANZIL'), fromSurah: '1' });
    expect(formatRange({ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 })).toBe('2:1 – 2:5');
    expect(formatRange({})).toBe('No range recorded');
    expect(hoursUntilLock('2026-10-15T00:00:00Z', Date.parse('2026-10-16T00:00:00Z'))).toBe(24);
    expect(hoursUntilLock('2026-10-10T00:00:00Z', Date.parse('2026-10-16T00:00:00Z'))).toBe(0);
  });
});

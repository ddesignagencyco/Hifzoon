import { describe, it, expect, afterAll } from 'vitest';
import { qaApi, reviewableClasses, STANDARD_RUBRIC } from '@/lib/api/modules/qa';
import { casesApi, CaseRecord } from '@/lib/api/modules/cases';
import { ApiClientError } from '@/lib/api/http';
import { actAs, actAsAnonymous, uniq } from '../helpers/live';

const DAY = 86_400_000;

/** Live QA + safeguarding flows against the seeded API. */
describe('live API — QA & cases', () => {
  afterAll(() => actAsAnonymous());

  it('supervisor reads teachers, ratings and a scorecard', async () => {
    await actAs('supervisor');
    const teachers = await qaApi.teachers();
    expect(teachers.length).toBeGreaterThan(0);
    const teacher = teachers[0];

    const [rating, scorecard] = await Promise.all([qaApi.teacherRating(teacher.id), qaApi.scorecard(teacher.id, 6)]);
    expect(rating.teacherId).toBe(teacher.id);
    expect(rating.distribution).toHaveLength(5);
    expect(scorecard.windowMonths).toBe(6);
    expect(typeof scorecard.reviewsCount).toBe('number');
  });

  it('supervisor reviews a taught class with the standard rubric when one exists', async () => {
    await actAs('supervisor');
    const teachers = await qaApi.teachers();
    const now = Date.now();
    let target: { teacherId: string; classId: string } | null = null;
    for (const t of teachers) {
      const entries = await qaApi.teacherTimetable(t.id, {
        from: new Date(now - 60 * DAY).toISOString(),
        to: new Date(now).toISOString(),
        tz: 'UTC',
      });
      const candidate = reviewableClasses(entries, now)[0];
      if (candidate) {
        target = { teacherId: t.id, classId: candidate.id };
        break;
      }
    }
    if (!target) {
      console.warn('No taught class in the last 60 days — review step skipped.');
      return;
    }

    const scores = Object.fromEntries(STANDARD_RUBRIC.items.map((i) => [i.key, 4]));
    try {
      const review = await qaApi.submitReview(target.classId, { scores, feedback: `Integration ${uniq()}`, source: 'MANUAL' });
      expect(review.classId).toBe(target.classId);
      expect(review.scores).toMatchObject(scores);
    } catch (error) {
      // A supervisor may review a class only once; a re-run hits the unique constraint.
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).status).toBe(409);
    }
    const card = await qaApi.scorecard(target.teacherId, 3);
    expect(card.reviewsCount).toBeGreaterThan(0);
  });

  it('only SUPER_ADMIN may draw the monthly sample', async () => {
    await actAs('supervisor');
    const [teacher] = await qaApi.teachers();
    await expect(qaApi.drawSample(teacher.id)).rejects.toMatchObject({ status: 403 });

    await actAs('superAdmin');
    const result = await qaApi.drawSample(teacher.id);
    expect(result.period).toMatch(/^\d{4}-\d{2}$/);
    expect(Array.isArray(result.sampled)).toBe(true);
  });

  it('safeguarding lead: create → note → transition → assign → SLA → close', async () => {
    const lead = await actAs('safeguarding');
    const created: CaseRecord = await casesApi.open({
      type: 'SAFEGUARDING',
      summary: `Integration test concern ${uniq()} — please ignore.`,
      slaMinutes: 30,
    });
    expect(created.status).toBe('OPEN');

    const listed = await casesApi.list({ status: 'OPEN', type: 'SAFEGUARDING' });
    expect(listed.some((c) => c.id === created.id)).toBe(true);

    // Closing without a note is refused.
    await expect(casesApi.transition(created.id, 'CLOSED')).rejects.toMatchObject({ status: 400 });

    await casesApi.addNote(created.id, 'Spoke to the guardian; teacher removed from the class pending review.');
    const moved = await casesApi.transition(created.id, 'INVESTIGATING');
    expect(moved.status).toBe('INVESTIGATING');

    const assigned = await casesApi.assign(created.id, lead.userId);
    expect(assigned.ownerId).toBe(lead.userId);

    const detail = await casesApi.get(created.id);
    expect(detail.notes).toHaveLength(1);
    expect(detail.owner?.id).toBe(lead.userId);
    expect(detail.sla.breached).toBe(false);

    const sla = await casesApi.sla();
    expect(sla.open).toBeGreaterThan(0);
    expect(sla.openDetail.some((c) => c.id === created.id)).toBe(true);

    const closed = await casesApi.transition(created.id, 'CLOSED');
    expect(closed.status).toBe('CLOSED');
    await expect(casesApi.transition(created.id, 'ACTIONED')).rejects.toMatchObject({ status: 409 });
  });

  it('supervisors can list cases but not read the SLA report', async () => {
    await actAs('supervisor');
    expect(Array.isArray(await casesApi.list({}))).toBe(true);
    await expect(casesApi.sla()).rejects.toMatchObject({ status: 403 });
  });
});

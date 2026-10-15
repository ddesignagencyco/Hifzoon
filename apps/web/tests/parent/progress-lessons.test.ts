import { describe, it, expect } from 'vitest';
import { parentProgressApi, formatMonthKey, recentMonths } from '@/lib/api/modules/parent-progress';
import { lessonsReadApi, formatPortionRange, mistakeLabel } from '@/lib/api/modules/lessons-read';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const S = 'stu-1';

describe('parent progress API module', () => {
  it('reads the per-child dashboard', async () => {
    const api = mockApi({
      [`GET /parent/students/${S}/dashboard`]: {
        body: envelope({ student: { id: S, displayName: 'Maryam', age: 9 }, attendance: { attendanceRate: null }, upcomingClasses: [] }),
      },
    });
    const d = await parentProgressApi.dashboard(S);
    expect(api.calls[0].method).toBe('GET');
    expect(d.student.age).toBe(9);
    expect(d.attendance.attendanceRate).toBeNull();
  });

  it('requests charts with months clamped to 1–24', async () => {
    const api = mockApi({ [`GET /parent/students/${S}/charts`]: { body: envelope({ studentId: S, series: [] }) } });
    await parentProgressApi.charts(S, 6);
    await parentProgressApi.charts(S, 99);
    await parentProgressApi.charts(S, 0);
    expect(api.calls[0].url).toContain('months=6');
    expect(api.calls[1].url).toContain('months=24');
    expect(api.calls[2].url).toContain('months=1');
  });

  it('requests a monthly report card', async () => {
    const api = mockApi({ [`GET /parent/students/${S}/report-card`]: { body: envelope({ period: { year: 2026, month: 9 } }) } });
    const r = await parentProgressApi.reportCard(S, 2026, 9);
    expect(api.calls[0].url).toContain('year=2026&month=9');
    expect(r.period.month).toBe(9);
  });

  it('surfaces ownership errors', async () => {
    mockApi({ [`GET /parent/students/${S}/dashboard`]: apiError(403, 'NOT_OWNER', 'Not your child') });
    await expect(parentProgressApi.dashboard(S)).rejects.toMatchObject({ status: 403 });
  });

  it('formats month keys and lists recent months', () => {
    expect(formatMonthKey('2026-10', { month: 'short', year: 'numeric' })).toMatch(/2026/);
    expect(formatMonthKey('bad')).toBe('bad');
    const months = recentMonths(3, new Date('2026-01-15T00:00:00Z'));
    expect(months).toEqual([
      { year: 2026, month: 1 },
      { year: 2025, month: 12 },
      { year: 2025, month: 11 },
    ]);
  });
});

describe('lessons read API module', () => {
  it('lists shared lesson cards for a student', async () => {
    const api = mockApi({ [`GET /students/${S}/lesson-cards`]: { body: envelope([{ id: 'lc1', portions: [], teacher: { name: 'T' } }]) } });
    const rows = await lessonsReadApi.listForStudent(S);
    expect(api.calls[0].url).toContain(`/students/${S}/lesson-cards`);
    expect(rows[0].id).toBe('lc1');
  });

  it('reads one lesson card', async () => {
    mockApi({ 'GET /lesson-cards/lc1': { body: envelope({ id: 'lc1', aiSummaryDraft: null, locked: false, mistakes: [] }) } });
    const card = await lessonsReadApi.get('lc1');
    expect(card.aiSummaryDraft).toBeNull();
  });

  it('lists mistakes with only the provided filters', async () => {
    const api = mockApi({ [`GET /students/${S}/mistakes`]: { body: envelope([{ id: 'm1', type: 'TAJWEED_RULE' }]) } });
    await lessonsReadApi.mistakes(S);
    await lessonsReadApi.mistakes(S, { type: 'TAJWEED_RULE', from: '2026-10-01T00:00:00.000Z', limit: 50 });
    expect(api.calls[0].url.endsWith(`/students/${S}/mistakes`)).toBe(true);
    expect(api.calls[1].url).toContain('type=TAJWEED_RULE');
    expect(api.calls[1].url).toContain('limit=50');
    expect(api.calls[1].url).toContain('from=2026-10-01');
    expect(api.calls[1].url).not.toContain('to=');
  });

  it('throws on a missing card', async () => {
    mockApi({ 'GET /lesson-cards/nope': apiError(404, 'NOT_FOUND', 'Lesson card not found') });
    await expect(lessonsReadApi.get('nope')).rejects.toThrow('Lesson card not found');
  });

  it('formats portions and mistake labels', () => {
    expect(formatPortionRange({ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 })).toBe('2:1 – 2:5');
    expect(formatPortionRange({ fromSurah: null, fromAyah: null, toSurah: null, toAyah: null })).toBe('—');
    expect(mistakeLabel('SKIPPED_WORD')).toBe('Skipped word');
    expect(mistakeLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

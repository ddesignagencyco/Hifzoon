/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Hifzoon demo data — populates the platform through the public REST API only,
 * exactly as real users would, so every portal can be clicked through end-to-end.
 *
 *   cd apps/web && npm run demo:data
 *   API_URL=http://localhost:4000/api/v1 WEB_URL=http://localhost:3000 npm run demo:data
 *
 * Safe to re-run: every step looks up what already exists first and prints SKIP
 * instead of creating a duplicate. Steps the API cannot support are SKIPped with the
 * backend gap as the reason. Requires the API seeded with `npm run db:seed`.
 */
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Hifzoon!Dev2026';
const ZONE = 'Europe/London';

const ACCOUNTS = {
  guardian: 'parent@hifzoon.test',
  teacher: 'teacher@hifzoon.test',
  admin: 'admin@hifzoon.test',
  superAdmin: 'superadmin@hifzoon.test',
  supervisor: 'supervisor@hifzoon.test',
  safeguarding: 'safeguarding@hifzoon.test',
  examiner: 'examiner@hifzoon.test',
  trainee: 'teacher.trainee@hifzoon.test',
  student: 'student@hifzoon.test',
} as const;
type Account = keyof typeof ACCOUNTS;

const FAMILY = '00000000-0000-7000-8000-000000000001';
const MARYAM = '00000000-0000-7000-8000-000000000011';
const YUSUF = '00000000-0000-7000-8000-000000000012';
const MARYAM_ENROLMENT = '00000000-0000-7000-8000-000000000101';
const YUSUF_ENROLMENT = '00000000-0000-7000-8000-000000000102';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const EARLY_OPEN = 10 * MIN; // FR-CLS-01: the room opens 10 minutes early and closes 10 minutes late

// ── HTTP ─────────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
    public details?: any,
  ) {
    super(`${status} ${code ?? ''} ${message}`.replace(/\s+/g, ' ').trim());
  }
}

const sessions = new Map<Account, { token: string; userId: string }>();

async function request<T = any>(
  as: Account | null,
  method: string,
  path: string,
  body?: unknown,
  options: { query?: Record<string, string | number | boolean | undefined>; idempotencyKey?: string } = {},
): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (as) headers.Authorization = `Bearer ${(await session(as)).token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const message = Array.isArray(json?.message) ? json.message.join('; ') : (json?.message ?? text);
    throw new ApiError(res.status, json?.code, String(message).slice(0, 300), json?.details);
  }
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}

const get = <T = any>(as: Account | null, path: string, query?: Record<string, string | number | boolean | undefined>) =>
  request<T>(as, 'GET', path, undefined, { query });
const post = <T = any>(as: Account | null, path: string, body: unknown = {}, idempotencyKey?: string) =>
  request<T>(as, 'POST', path, body, { idempotencyKey });
const patch = <T = any>(as: Account | null, path: string, body: unknown) => request<T>(as, 'PATCH', path, body);

async function session(as: Account): Promise<{ token: string; userId: string }> {
  const cached = sessions.get(as);
  if (cached) return cached;
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ACCOUNTS[as], password: PASSWORD }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.code, `login as ${ACCOUNTS[as]} failed: ${json?.message}`);
  const entry = { token: json.data.accessToken as string, userId: json.data.user.id as string };
  sessions.set(as, entry);
  return entry;
}

// ── Reporting ────────────────────────────────────────────────────────────────

type Outcome = 'PASS' | 'SKIP' | 'FAIL';
const results: Array<{ outcome: Outcome; label: string; detail: string }> = [];
const COLOURS: Record<Outcome, string> = { PASS: '\x1b[32m', SKIP: '\x1b[33m', FAIL: '\x1b[31m' };

class Skip extends Error {}
const skip = (reason: string): never => {
  throw new Skip(reason);
};

function report(outcome: Outcome, label: string, detail = ''): void {
  results.push({ outcome, label, detail });
  console.log(`  ${COLOURS[outcome]}${outcome}\x1b[0m  ${label}${detail ? `  — ${detail}` : ''}`);
}

/** Runs one step; the function returns a PASS detail, or throws Skip / an error. */
async function step<T>(label: string, fn: () => Promise<{ detail?: string; value?: T } | string | void>): Promise<T | undefined> {
  try {
    const out = await fn();
    const detail = typeof out === 'string' ? out : (out?.detail ?? '');
    report('PASS', label, detail);
    return typeof out === 'object' && out ? out.value : undefined;
  } catch (error) {
    if (error instanceof Skip) report('SKIP', label, error.message);
    else report('FAIL', label, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

function section(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const iso = (ms: number) => new Date(ms).toISOString();
const isCancelled = (status: string) => status === 'CANCELLED_FAMILY' || status === 'CANCELLED_TEACHER';
const hasStudent = (row: any, studentId: string) => (row.students ?? []).some((s: any) => s.student?.id === studentId);

function londonParts(date: Date): { ymd: string; hhmm: string; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}`, weekday: parts.weekday };
}

const ctx: {
  teacherId: string;
  courseIds: { maryam: string; yusuf: string };
  yusufNowClass?: any;
  maryamNextClass?: any;
  maryamEarlierClass?: any;
  yusufCardId?: string;
  maryamCardId?: string;
  threadId?: string;
  caseId?: string;
  khadijahAppId?: string;
} = { teacherId: '', courseIds: { maryam: '', yusuf: '' } };

async function teacherTimetable(fromMs: number, toMs: number): Promise<any[]> {
  return get<any[]>('teacher', `/scheduling/teachers/${ctx.teacherId}/timetable`, { from: iso(fromMs), to: iso(toMs), tz: ZONE });
}

/** Books a class as admin, trying a few start offsets if the slot is taken (FR-SCH-07). */
async function bookWithRetry(input: {
  studentId: string;
  enrolmentId: string;
  courseId: string;
  starts: number[];
  durationMinutes: number;
}): Promise<any> {
  let lastError: unknown;
  for (const startsAt of input.starts) {
    try {
      return await post('admin', '/scheduling/book', {
        teacherId: ctx.teacherId,
        courseId: input.courseId,
        studentId: input.studentId,
        enrolmentId: input.enrolmentId,
        startsAt: iso(startsAt),
        durationMinutes: input.durationMinutes,
        roomType: 'ONE_TO_ONE',
        type: 'REGULAR',
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof ApiError && error.code === 'DOUBLE_BOOKED')) throw error;
    }
  }
  throw lastError;
}

/** Prefill answers 409 with the card id once a card exists — the only "find card by class" lookup. */
async function existingCardId(classId: string): Promise<string | null> {
  try {
    await get('teacher', `/classes/${classId}/lesson-card/prefill`);
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return error.details?.lessonCardId ?? 'unknown';
    throw error;
  }
}

async function logMistakes(classId: string, studentId: string, mistakes: any[]): Promise<string> {
  const existing = await get<any[]>('teacher', `/classes/${classId}/mistakes`);
  if (existing.length >= mistakes.length) skip(`${existing.length} mistakes already logged on class ${classId}`);
  for (const m of mistakes.slice(existing.length)) {
    await post('teacher', `/classes/${classId}/mistakes`, { studentId, ...m });
  }
  return `${mistakes.length - existing.length} mistakes (${mistakes.map((m) => m.type).join(', ')})`;
}

async function submitCard(classId: string, card: any, summary: string): Promise<{ detail: string; value: string }> {
  const existing = await existingCardId(classId);
  if (existing) {
    const detail = await get('teacher', `/lesson-cards/${existing}`);
    if (!detail.aiSummaryDraft || !detail.summaryApprovedAt) {
      await patch('teacher', `/lesson-cards/${existing}/ai-draft`, { draft: summary });
      await post('teacher', `/lesson-cards/${existing}/ai-draft/approve`);
      return { detail: `card ${existing} existed; summary approved and shared`, value: existing };
    }
    throw Object.assign(new Skip(`lesson card ${existing} already submitted and shared`), { cardId: existing });
  }
  const submitted = await post('teacher', `/classes/${classId}/lesson-card`, card);
  // Approving the written summary is what shares the card with the family now (FR-REC-05).
  await patch('teacher', `/lesson-cards/${submitted.id}/ai-draft`, { draft: summary });
  await post('teacher', `/lesson-cards/${submitted.id}/ai-draft/approve`);
  return { detail: `card ${submitted.id} (${card.portions.map((p: any) => `${p.kind}:${p.grade}`).join(', ')}), summary approved → shared`, value: submitted.id };
}

async function cardForClass(classId: string): Promise<string | undefined> {
  const id = await existingCardId(classId).catch(() => null);
  return id ?? undefined;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`\x1b[1mHifzoon demo data\x1b[0m  →  ${API}`);

  section('0. Sign in and resolve ids');
  for (const account of Object.keys(ACCOUNTS) as Account[]) {
    await step(`sign in as ${ACCOUNTS[account]}`, async () => {
      await session(account);
    });
  }
  if (!sessions.has('guardian') || !sessions.has('teacher') || !sessions.has('admin')) {
    console.log('\nCannot continue without guardian, teacher and admin sessions. Is the API running and seeded?');
    process.exitCode = 1;
    return;
  }
  await step('resolve Ustadh Bilal’s teacher profile and the children’s courses', async () => {
    const [yusuf, maryam] = await Promise.all([
      get<any[]>('guardian', '/courses/enrolments/list', { studentId: YUSUF }),
      get<any[]>('guardian', '/courses/enrolments/list', { studentId: MARYAM }),
    ]);
    const y = yusuf.find((e) => e.id === YUSUF_ENROLMENT);
    const m = maryam.find((e) => e.id === MARYAM_ENROLMENT);
    if (!y?.teacher?.id || !m) throw new Error('Seeded enrolments for Yusuf/Maryam not found — run the seed');
    ctx.teacherId = y.teacher.id;
    ctx.courseIds = { yusuf: y.course.id, maryam: m.course.id };
    return `teacher ${ctx.teacherId} (${y.teacher.user?.name}); Yusuf ${y.course.code}, Maryam ${m.course.code}`;
  });
  if (!ctx.teacherId) {
    process.exitCode = 1;
    return;
  }

  // ── 1. Billing ─────────────────────────────────────────────────────────────
  section('1. Billing — Khan Family');
  let activeSub: any;
  await step('ACTIVE subscription for the Khan Family', async () => {
    const billing = await get('guardian', '/billing/family');
    activeSub = billing.subscriptions.find((s: any) => s.familyId === FAMILY && s.status === 'ACTIVE' && !s.cancelAtPeriodEnd);
    if (activeSub) skip(`subscription ${activeSub.id} (${activeSub.plan?.name}) is already ACTIVE`);
    const plans = await get<any[]>(null, '/billing/plans', { currency: 'GBP' });
    const plan =
      plans.find((p) => /one[- ]?to[- ]?one|1:1|1-1/i.test(`${p.name} ${p.code}`) && /3/.test(`${p.name} ${p.code}`)) ??
      plans.find((p) => !/circle/i.test(`${p.name} ${p.code}`)) ??
      plans[0];
    if (!plan) throw new Error('No billing plans in the catalogue');
    activeSub = await post('guardian', '/billing/subscribe', { familyId: FAMILY, planId: plan.id, currency: 'GBP' }, randomUUID());
    if (activeSub.status !== 'ACTIVE') throw new Error(`subscription came back ${activeSub.status}`);
    return `subscribed to "${plan.name}" → ${activeSub.id} ACTIVE`;
  });
  await step('open invoice issued by admin (so “Pay now” shows)', async () => {
    if (!activeSub) skip('no active subscription to invoice');
    const billing = await get('guardian', '/billing/family');
    const open = billing.invoices.find((i: any) => i.subscriptionId === activeSub.id && i.status === 'OPEN');
    if (open) skip(`invoice ${open.number} (${open.totalMinor / 100} ${open.currency}) is already OPEN`);
    const invoice = await post('admin', '/admin/billing/invoices', { subscriptionId: activeSub.id }, randomUUID());
    return `invoice ${invoice.number ?? invoice.id} ${invoice.status} ${invoice.totalMinor / 100} ${invoice.currency}`;
  });

  // ── 2. Classes ─────────────────────────────────────────────────────────────
  section('2. Classes with Ustadh Bilal');
  const now = Date.now();
  await step('Yusuf — class with the room open right now', async () => {
    const rows = await teacherTimetable(now - 6 * HOUR, now + 2 * HOUR);
    const open = rows.find(
      (r) =>
        hasStudent(r, YUSUF) &&
        !isCancelled(r.status) &&
        new Date(r.startsAt).getTime() - EARLY_OPEN <= now &&
        new Date(r.endsAt).getTime() + EARLY_OPEN - 5 * MIN > now,
    );
    if (open) {
      ctx.yusufNowClass = open;
      skip(`class ${open.id} (${londonParts(new Date(open.startsAt)).hhmm}–${londonParts(new Date(open.endsAt)).hhmm} London) is already open`);
    }
    const base = Math.floor((now - 2 * MIN) / MIN) * MIN;
    ctx.yusufNowClass = await bookWithRetry({
      studentId: YUSUF,
      enrolmentId: YUSUF_ENROLMENT,
      courseId: ctx.courseIds.yusuf,
      starts: [base, base + 5 * MIN, base + 9 * MIN],
      durationMinutes: 45,
    });
    return `booked ${ctx.yusufNowClass.id} ${ctx.yusufNowClass.startsAt} → ${ctx.yusufNowClass.endsAt}`;
  });

  await step('Maryam — next class straight after Yusuf’s (room opens 10 min before)', async () => {
    const rows = await teacherTimetable(now - 2 * HOUR, now + 3 * HOUR);
    const next = rows.find(
      (r) =>
        hasStudent(r, MARYAM) &&
        !isCancelled(r.status) &&
        new Date(r.endsAt).getTime() + EARLY_OPEN - 5 * MIN > now &&
        new Date(r.startsAt).getTime() < now + 2 * HOUR,
    );
    if (next) {
      ctx.maryamNextClass = next;
      skip(`class ${next.id} at ${londonParts(new Date(next.startsAt)).hhmm} London already booked`);
    }
    const after = ctx.yusufNowClass ? new Date(ctx.yusufNowClass.endsAt).getTime() : Math.ceil(now / (15 * MIN)) * 15 * MIN;
    ctx.maryamNextClass = await bookWithRetry({
      studentId: MARYAM,
      enrolmentId: MARYAM_ENROLMENT,
      courseId: ctx.courseIds.maryam,
      starts: [after, after + 15 * MIN, after + 30 * MIN],
      durationMinutes: 30,
    });
    return `booked ${ctx.maryamNextClass.id} ${ctx.maryamNextClass.startsAt}`;
  });

  await step('Maryam — a class earlier today (for her lesson card and QA review)', async () => {
    const { ymd } = londonParts(new Date(now));
    const dayStart = now - 18 * HOUR;
    const rows = await teacherTimetable(dayStart, now - HOUR);
    const earlier = rows.find(
      (r) => hasStudent(r, MARYAM) && !isCancelled(r.status) && londonParts(new Date(r.startsAt)).ymd === ymd,
    );
    if (earlier) {
      ctx.maryamEarlierClass = earlier;
      skip(`class ${earlier.id} at ${londonParts(new Date(earlier.startsAt)).hhmm} London already exists today`);
    }
    const base = Math.floor((now - 3 * HOUR) / (15 * MIN)) * 15 * MIN;
    const starts = [base, base - 30 * MIN, base + 30 * MIN, base - HOUR].filter((t) => londonParts(new Date(t)).ymd === ymd);
    if (starts.length === 0) skip('too early in the London day to place an earlier class');
    ctx.maryamEarlierClass = await bookWithRetry({
      studentId: MARYAM,
      enrolmentId: MARYAM_ENROLMENT,
      courseId: ctx.courseIds.maryam,
      starts,
      durationMinutes: 30,
    });
    return `booked ${ctx.maryamEarlierClass.id} ${ctx.maryamEarlierClass.startsAt}`;
  });

  const schedules = [
    { label: 'Maryam (Qaida) — weekly Mon & Wed 17:00 London, 30 min', studentId: MARYAM, enrolmentId: MARYAM_ENROLMENT, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', days: ['Mon', 'Wed'], time: '17:00', duration: 30 },
    { label: 'Yusuf (Hifz) — weekly Tue, Thu & Sat 18:00 London, 45 min', studentId: YUSUF, enrolmentId: YUSUF_ENROLMENT, rrule: 'FREQ=WEEKLY;BYDAY=TU,TH,SA', days: ['Tue', 'Thu', 'Sat'], time: '18:00', duration: 45 },
  ];
  for (const s of schedules) {
    await step(`recurring schedule: ${s.label}`, async () => {
      const rows = await get<any[]>('guardian', `/scheduling/families/${FAMILY}/timetable`, { from: iso(now), to: iso(now + 21 * DAY), tz: ZONE });
      const matching = rows.filter((r) => {
        const p = londonParts(new Date(r.startsAt));
        return hasStudent(r, s.studentId) && !isCancelled(r.status) && p.hhmm === s.time && s.days.includes(p.weekday);
      });
      if (matching.length >= 2) skip(`${matching.length} upcoming classes at ${s.time} on ${s.days.join('/')} already on the timetable`);
      const created = await post('admin', '/scheduling/schedules', {
        enrolmentId: s.enrolmentId,
        teacherId: ctx.teacherId,
        rrule: s.rrule,
        localStartTime: s.time,
        familyTimeZone: ZONE,
        durationMinutes: s.duration,
        roomType: 'ONE_TO_ONE',
        startsOn: londonParts(new Date(now)).ymd,
      });
      return `schedule ${created.scheduleId}: ${created.sessions?.length ?? 0} classes materialised, ${created.skippedConflicts ?? 0} conflicts skipped`;
    });
  }

  // ── 3. Learning records ────────────────────────────────────────────────────
  section('3. Classroom, mistakes and lesson cards');
  const yClass = ctx.yusufNowClass?.id as string | undefined;
  if (yClass) {
    await step(`teacher room token for Yusuf’s class ${yClass}`, async () => {
      const token = await post('teacher', `/classroom/classes/${yClass}/token`);
      return `role ${token.role}`;
    });
    await step('teacher sets the Mushaf (Madani 15-line, page 562 — Surah Al-Mulk)', async () => {
      const state = await get('teacher', `/classroom/classes/${yClass}/state`);
      if (state.page === 562 && state.layout === 'MADANI_15') skip('already on page 562');
      await post('teacher', `/classroom/classes/${yClass}/layout`, { layout: 'MADANI_15' });
      await post('teacher', `/classroom/classes/${yClass}/page`, { page: 562 });
      await post('teacher', `/classroom/classes/${yClass}/highlight`, { surah: 67, ayah: 1, wordIndex: 0 });
      return 'page 562, highlight 67:1';
    });
    await step('teacher logs Yusuf’s mistakes', async () => {
      if (await cardForClass(yClass)) skip('lesson card already submitted for this class');
      return logMistakes(yClass, YUSUF, [
        { surah: 67, ayah: 3, wordIndex: 4, type: 'TAJWEED_RULE', tajweedRule: 'Ikhfa' },
        { surah: 67, ayah: 5, wordIndex: 2, type: 'LETTER_MAKHRAJ' },
        { surah: 67, ayah: 8, wordIndex: 1, type: 'VOWEL_HARAKAH' },
        { surah: 67, ayah: 10, wordIndex: 6, type: 'SKIPPED_WORD' },
        { surah: 66, ayah: 8, wordIndex: 3, type: 'STOP_WAQF' },
      ]);
    });
    ctx.yusufCardId = await step<string>('teacher submits Yusuf’s lesson card (Sabaq/Sabqi/Manzil) and shares it', async () => {
      try {
        return await submitCard(
          yClass,
          {
            homework: 'Recite Surah Al-Mulk 1–10 five times to a parent before Maghrib; revise Juz 30 (An-Naba to Abasa) once.',
            parentNote: 'Yusuf’s new sabaq was confident. Please listen to his manzil daily — the ending of Al-Tahrim needs more repetition.',
            portions: [
              { kind: 'SABAQ', fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 10, grade: 'GOOD' },
              { kind: 'SABQI', fromSurah: 66, fromAyah: 1, toSurah: 66, toAyah: 12, grade: 'EXCELLENT' },
              { kind: 'MANZIL', fromSurah: 78, toSurah: 80, grade: 'NEEDS_WORK' },
            ],
          },
          'Yusuf memorised Surah Al-Mulk ayahs 1–10 today with good fluency. Watch the Ikhfa in ayah 3 and the makhraj of ‘ain. Revision of Al-Tahrim was excellent; Juz 30 manzil needs daily practice.',
        );
      } catch (error) {
        if (error instanceof Skip) ctx.yusufCardId = (error as any).cardId;
        throw error;
      }
    });
    ctx.yusufCardId ??= await cardForClass(yClass);
  }

  const mClass = ctx.maryamEarlierClass?.id as string | undefined;
  if (mClass) {
    await step('teacher logs Maryam’s mistakes (earlier class)', async () => {
      if (await cardForClass(mClass)) skip('lesson card already submitted for this class');
      return logMistakes(mClass, MARYAM, [
        { surah: 1, ayah: 2, wordIndex: 1, type: 'LETTER_MAKHRAJ' },
        { surah: 1, ayah: 4, wordIndex: 0, type: 'VOWEL_HARAKAH' },
        { surah: 112, ayah: 2, wordIndex: 1, type: 'TAJWEED_RULE', tajweedRule: 'Qalqalah' },
      ]);
    });
    ctx.maryamCardId = await step<string>('teacher submits Maryam’s lesson card and shares it', async () => {
      try {
        return await submitCard(
          mClass,
          {
            homework: 'Practise Qaida lesson 7 (joined letters) for 10 minutes daily; recite Al-Fatiha slowly to a parent.',
            parentNote: 'Maryam is reading joined letters well. She mixes up ح and ه — please practise these at home.',
            portions: [
              { kind: 'SABAQ', fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, grade: 'GOOD' },
              { kind: 'MANZIL', fromSurah: 112, toSurah: 114, grade: 'EXCELLENT' },
              { kind: 'OTHER', grade: 'GOOD' },
            ],
          },
          'Maryam read Al-Fatiha with good attention today and recited the last three surahs beautifully. She is still confusing ح and ه; daily Qaida practice will help.',
        );
      } catch (error) {
        if (error instanceof Skip) ctx.maryamCardId = (error as any).cardId;
        throw error;
      }
    });
    ctx.maryamCardId ??= await cardForClass(mClass);
  }

  // ── 4. Messaging ───────────────────────────────────────────────────────────
  section('4. Messaging — guardian ↔ Ustadh Bilal about Yusuf');
  const conversation: Array<{ from: 'guardian' | 'teacher'; body: string }> = [
    { from: 'guardian', body: 'Assalamu alaikum Ustadh Bilal, Yusuf says Surah Al-Mulk feels harder than the last few surahs. Is there anything we can do at home to help?' },
    { from: 'teacher', body: 'Wa alaikum assalam. Yusuf is doing well — his new sabaq is solid, but his manzil needs more repetition. Ten minutes of revision after Maghrib, reciting to you, would make a big difference.' },
    { from: 'guardian', body: 'JazakAllahu khairan, we will listen to him every evening after Maghrib and let you know how it goes.' },
  ];
  await step('guardian opens a thread with Ustadh Bilal about Yusuf', async () => {
    const thread = await post('guardian', '/parent/threads', { familyId: FAMILY, teacherId: ctx.teacherId, studentId: YUSUF, enrolmentId: YUSUF_ENROLMENT });
    ctx.threadId = thread.id;
    return `thread ${thread.id} (re-opening returns the same thread)`;
  });
  if (ctx.threadId) {
    for (let index = 0; index < conversation.length; index++) {
      const msg = conversation[index];
      await step(`${msg.from} message ${index + 1}/3`, async () => {
        const detail = await get('guardian', `/parent/threads/${ctx.threadId}`, { limit: 200 });
        if (detail.messages.some((m: any) => m.body === msg.body)) skip('already sent');
        const path = msg.from === 'guardian' ? `/parent/threads/${ctx.threadId}/messages` : `/teacher/threads/${ctx.threadId}/messages`;
        await post(msg.from, path, { body: msg.body });
        return `“${msg.body.slice(0, 50)}…”`;
      });
    }
  }

  // ── 5. Notification preferences ────────────────────────────────────────────
  section('5. Notification preferences');
  await step('guardian quiet hours 21:00–07:00 (email + push on, WhatsApp off)', async () => {
    const prefs = await get('guardian', '/notifications/preferences');
    if (String(prefs.quietFrom ?? '').includes('21:00') && String(prefs.quietTo ?? '').includes('07:00')) skip('quiet hours already 21:00–07:00');
    await patch('guardian', '/notifications/preferences', { email: true, push: true, whatsapp: false, quietFrom: '21:00', quietTo: '07:00' });
    return 'saved';
  });

  // ── 6. CRM ─────────────────────────────────────────────────────────────────
  section('6. CRM leads and tasks (admin)');
  const PATH = ['NEW', 'TRIAL_BOOKED', 'TRIAL_DONE', 'WON'];
  const leads = [
    { contactName: 'Fatima Siddiqui', email: 'fatima.siddiqui@example.com', country: 'GB', childAge: 7, courseInterest: 'QAIDA', source: 'website', target: 'NEW', notes: 'Daughter has started Arabic letters at weekend school; wants weekday evening classes.' },
    { contactName: 'Omar Farooq', email: 'omar.farooq@example.com', country: 'US', childAge: 10, courseInterest: 'HIFZ', source: 'facebook', target: 'NEW', notes: 'Asked about weekend slots in Eastern Time.' },
    { contactName: 'Aisha Rahman', email: 'aisha.rahman@example.com', country: 'CA', childAge: 9, courseInterest: 'HIFZ', source: 'referral', target: 'TRIAL_BOOKED', notes: 'Referred by the Khan family. Son has memorised Juz Amma.' },
    { contactName: 'Ibrahim Malik', email: 'ibrahim.malik@example.com', country: 'AE', childAge: 12, courseInterest: 'TAJWEED', source: 'google', target: 'TRIAL_DONE', notes: 'Trial went well; family comparing prices.' },
    { contactName: 'Zainab Hussain', email: 'zainab.hussain@example.com', country: 'GB', childAge: 8, courseInterest: 'QAIDA', source: 'referral', target: 'WON', notes: 'Signed up after trial with a female teacher.' },
    { contactName: 'Hamza Qureshi', email: 'hamza.qureshi@example.com', country: 'AU', childAge: 11, courseInterest: 'ARABIC', source: 'instagram', target: 'LOST', notes: 'Time-zone overlap was difficult.' },
  ];
  const leadIds: Record<string, string> = {};
  for (const lead of leads) {
    await step(`lead ${lead.contactName} (${lead.country}, ${lead.courseInterest}) → ${lead.target}`, async () => {
      const found = await get('admin', '/admin/crm/leads', { search: lead.contactName, limit: 10 });
      let row = found.items.find((l: any) => l.contactName === lead.contactName);
      const created = !row;
      if (!row) {
        const { target: _target, ...body } = lead;
        void _target;
        row = await post('admin', '/admin/crm/leads', body);
      }
      leadIds[lead.contactName] = row.id;
      if (row.status === lead.target) {
        if (!created) skip(`already ${row.status}`);
        return `created ${row.id}`;
      }
      if (row.status === 'WON' || row.status === 'LOST') skip(`lead is closed as ${row.status}; closed leads are immutable`);
      if (lead.target === 'LOST') {
        await patch('admin', `/admin/crm/leads/${row.id}/status`, { status: 'LOST', lostReason: 'Chose a local madrasa with in-person classes; time-zone overlap was difficult.' });
      } else {
        for (const status of PATH.slice(PATH.indexOf(row.status) + 1, PATH.indexOf(lead.target) + 1)) {
          await patch('admin', `/admin/crm/leads/${row.id}/status`, { status });
        }
      }
      return `${created ? 'created and ' : ''}moved to ${lead.target}`;
    });
  }
  const adminId = (await session('admin')).userId;
  const tasks = [
    { lead: 'Omar Farooq', type: 'OTHER', dueAt: now + DAY, note: 'Call Omar Farooq back about weekend trial times (Eastern Time).' },
    { lead: 'Aisha Rahman', type: 'OTHER', dueAt: now + 3 * HOUR, note: 'Send the Rahman family the trial reminder and joining instructions.' },
    { lead: 'Ibrahim Malik', type: 'TRIAL_NOT_CONVERTED', dueAt: now - 2 * DAY, note: 'Follow up with Ibrahim Malik after his trial — not converted yet, offer the sibling discount.' },
  ];
  for (const task of tasks) {
    await step(`task: ${task.note.slice(0, 60)}${task.dueAt < now ? ' (overdue)' : ''}`, async () => {
      for (const status of ['OPEN', 'DONE']) {
        for (let page = 1; page <= 10; page++) {
          const list = await get('admin', '/admin/crm/tasks', { status, page, limit: 100 });
          if (list.items.some((t: any) => t.note === task.note)) skip(`already exists (${status})`);
          if (list.items.length < 100) break;
        }
      }
      const created = await post('admin', '/admin/crm/tasks', {
        leadId: leadIds[task.lead],
        type: task.type,
        assigneeId: adminId,
        dueAt: iso(task.dueAt),
        note: task.note,
      });
      return `task ${created.id} due ${iso(task.dueAt)}`;
    });
  }

  // ── 7. Teacher hiring ──────────────────────────────────────────────────────
  section('7. Teacher hiring');
  const applicants = [
    {
      applicantName: 'Ustadha Khadijah Noor',
      email: 'khadijah.noor@example.com',
      phone: '+44 7700 900123',
      country: 'GB',
      qualifications: { ijazah: 'Hafs ʿan ʿAsim', yearsTeaching: 6, subjects: ['HIFZ', 'QAIDA', 'TAJWEED'], languages: ['en', 'ur'], gender: 'FEMALE', note: 'Teaches girls aged 6–14; available weekday evenings UK time.' },
    },
    {
      applicantName: 'Ustadh Yahya Al-Masri',
      email: 'yahya.almasri@example.com',
      phone: '+20 100 000 0456',
      country: 'EG',
      qualifications: { degree: 'BA Arabic Language, Al-Azhar University', yearsTeaching: 8, subjects: ['ARABIC', 'TAJWEED'], languages: ['ar', 'en'], gender: 'MALE' },
    },
  ];
  for (const applicant of applicants) {
    await step(`application from ${applicant.applicantName}`, async () => {
      const list = await get<any[]>('admin', '/teachers/applications/list');
      const existing = list.find((a) => a.email === applicant.email);
      if (existing) {
        if (applicant.email.startsWith('khadijah')) ctx.khadijahAppId = existing.id;
        skip(`application ${existing.id} already ${existing.status}`);
      }
      const created = await post(null, '/teachers/applications', applicant);
      if (applicant.email.startsWith('khadijah')) ctx.khadijahAppId = created.id;
      return `application ${created.id} ${created.status}`;
    });
  }
  for (const [stepName, notes] of [
    ['RECITATION_REVIEW', 'Beautiful recitation with strong tajweed; minor note on madd lengths.'],
    ['DEMO_CLASS', 'Demo class with a 9-year-old went very well — warm, structured, clear corrections.'],
  ] as const) {
    await step(`admin passes Khadijah’s ${stepName} step`, async () => {
      if (!ctx.khadijahAppId) skip('application not found');
      const detail = await get('admin', `/teachers/applications/${ctx.khadijahAppId}`);
      const row = detail.steps.find((s: any) => s.step === stepName);
      if (row?.status === 'PASSED') skip('already PASSED');
      await post('admin', `/teachers/applications/${ctx.khadijahAppId}/steps`, { step: stepName, status: 'PASSED', notes });
      return 'PASSED';
    });
  }

  // ── 8. QA ──────────────────────────────────────────────────────────────────
  section('8. QA review (supervisor)');
  await step('supervisor reviews one of Bilal’s classes with the standard rubric', async () => {
    const target = ctx.maryamEarlierClass?.id ?? ctx.yusufNowClass?.id;
    if (!target) skip('no taught class available to review');
    try {
      const review = await post('supervisor', `/qa/classes/${target}/review`, {
        scores: { opening: 5, portion: 4, tajweed: 4, pacing: 5, closing: 3 },
        feedback: 'Warm opening and well-paced lesson. Corrections were made in context. Please close with clearer homework so the parent knows the next portion.',
        source: 'MANUAL',
      });
      return `review ${review.id} on class ${target}`;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) skip(`class ${target} already reviewed by this supervisor`);
      throw error;
    }
  });

  // ── 9. Safeguarding ────────────────────────────────────────────────────────
  section('9. Safeguarding case');
  const CASE_SUMMARY =
    'Student shared personal contact details in chat: during a class a student typed a personal phone number into the class chat. The teacher did not respond to it and reported it the same day. Low urgency — remind the family of the online-safety policy.';
  await step('safeguarding lead opens a low-urgency case', async () => {
    const list = await get<any[]>('safeguarding', '/cases', { type: 'SAFEGUARDING' });
    const existing = list.find((c) => c.summary === CASE_SUMMARY);
    if (existing) {
      ctx.caseId = existing.id;
      skip(`case ${existing.id} already ${existing.status}`);
    }
    const created = await post('safeguarding', '/cases', { type: 'SAFEGUARDING', summary: CASE_SUMMARY, slaMinutes: 3 * 24 * 60 });
    ctx.caseId = created.id;
    return `case ${created.id} (SLA 72h)`;
  });
  if (ctx.caseId) {
    await step('add a case note', async () => {
      const detail = await get('safeguarding', `/cases/${ctx.caseId}`);
      if (detail.notes.length > 0) skip(`${detail.notes.length} note(s) already`);
      await post('safeguarding', `/cases/${ctx.caseId}/notes`, {
        note: 'Spoke with the teacher: the number was removed from the chat within minutes and no contact was made. Guardian to be called to go over the online-safety guidance.',
      });
      return 'note added';
    });
    await step('transition OPEN → INVESTIGATING', async () => {
      const detail = await get('safeguarding', `/cases/${ctx.caseId}`);
      if (detail.status !== 'OPEN') skip(`already ${detail.status}`);
      await post('safeguarding', `/cases/${ctx.caseId}/transition`, { status: 'INVESTIGATING' });
      return 'INVESTIGATING';
    });
    await step('assign the case to the safeguarding lead', async () => {
      const me = (await session('safeguarding')).userId;
      const detail = await get('safeguarding', `/cases/${ctx.caseId}`);
      if (detail.ownerId === me || detail.owner?.id === me) skip('already assigned to the lead');
      await post('safeguarding', `/cases/${ctx.caseId}/assign`, { ownerId: me });
      return `owner ${me}`;
    });
  }

  // ── 10. Teacher change ─────────────────────────────────────────────────────
  section('10. Teacher-change request');
  await step('guardian requests a female teacher for Maryam (left OPEN for admin)', async () => {
    const open = await get<any[]>('admin', '/teacher-changes', { status: 'OPEN' });
    const mine = open.find((r) => r.studentId === MARYAM || r.student?.id === MARYAM);
    if (mine) skip(`request ${mine.id} is already OPEN`);
    try {
      const created = await post('guardian', '/teacher-changes', {
        familyId: FAMILY,
        studentId: MARYAM,
        reason: 'As Maryam is getting older we would prefer a female teacher for her. We are happy to keep the same days and times if possible.',
      });
      return `request ${created.id} ${created.status ?? 'OPEN'}`;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) skip('an OPEN request already exists for Maryam');
      throw error;
    }
  });

  // ── 11. CMS ────────────────────────────────────────────────────────────────
  section('11. CMS');
  const SLUG = 'daily-manzil-revision-at-home';
  await step('publish blog post “5 ways to help your child with manzil revision at home”', async () => {
    const posts = await get<any[]>('admin', '/content-admin');
    const existing = posts.find((p) => p.slug === SLUG && p.locale === 'en');
    if (existing?.status === 'PUBLISHED') skip(`post ${existing.id} already PUBLISHED`);
    const saved = await post('admin', '/content-admin', {
      ...(existing ? { id: existing.id } : {}),
      type: 'BLOG',
      slug: SLUG,
      locale: 'en',
      title: '5 ways to help your child with manzil revision at home',
      body: [
        'Memorising new ayahs (sabaq) is exciting, but keeping what has already been memorised (manzil) is what makes a hafiz. Here are five simple habits that make revision at home easier for the whole family.',
        '## 1. Pick a fixed time\nTen minutes after Maghrib works for many families. The same time every day turns revision into a habit rather than a negotiation.',
        '## 2. Be the listener\nYou do not need to be a hafiz to help. Follow along in the Mushaf and gently point out when a word is skipped.',
        '## 3. Little and often\nShort daily revision beats one long weekend session. Use the lesson card to see which portion is due.',
        '## 4. Celebrate consistency\nPraise the effort of showing up every day, not only perfect recitation.',
        '## 5. Talk to the teacher\nIf a surah keeps slipping, send a message from the family portal — teachers can adjust the plan.',
      ].join('\n\n'),
      status: 'PUBLISHED',
      meta: { excerpt: 'Simple daily habits that help children keep what they have memorised.', readingMinutes: 4 },
    });
    return `post ${saved.id} ${saved.status} → ${WEB}/resources/${SLUG}`;
  });

  // ── 12. Payroll ────────────────────────────────────────────────────────────
  section('12. Payroll');
  await step('open + calculate the current month’s payroll period', async () =>
    skip(
      'backend gap — payroll only pays classes with charged=true, which the API sets solely on late family cancellations ' +
        '(taught classes never become charged), and no endpoint assigns a pay rate to a teacher (teacher_profile.pay_rate_id), ' +
        'so the payslip would be empty; a calculated period also cannot be recalculated, so opening one now would block real October payroll.',
    ),
  );

  // ── 13. Student account ────────────────────────────────────────────────────
  section('13. Student account');
  await step('link student@hifzoon.test to a student record', async () =>
    skip(
      'backend gap — no endpoint sets Student.userId (POST /families/:id/students and PATCH /families/students/:id take no user/email), ' +
        'there is no “my student record” lookup, and no route grants a STUDENT access to their own lesson cards or timetable.',
    ),
  );

  // ── Verification ───────────────────────────────────────────────────────────
  section('Verification (read back as each role)');
  await step('guardian: Yusuf’s dashboard has upcoming classes and the lesson card', async () => {
    const dash = await get('guardian', `/parent/students/${YUSUF}/dashboard`);
    const cards = await get<any[]>('guardian', `/students/${YUSUF}/lesson-cards`);
    if (!dash.upcomingClasses?.length) throw new Error('no upcoming classes on the dashboard');
    if (!cards.length) throw new Error('no shared lesson cards yet (the worker shares them within seconds)');
    return `${dash.upcomingClasses.length} upcoming classes, ${cards.length} shared lesson card(s)`;
  });
  await step('guardian: Maryam’s dashboard and lesson cards', async () => {
    const dash = await get('guardian', `/parent/students/${MARYAM}/dashboard`);
    const cards = await get<any[]>('guardian', `/students/${MARYAM}/lesson-cards`);
    return `${dash.upcomingClasses?.length ?? 0} upcoming classes, ${cards.length} shared lesson card(s)`;
  });
  await step('guardian: billing shows an ACTIVE subscription and an OPEN invoice', async () => {
    const billing = await get('guardian', '/billing/family');
    const active = billing.subscriptions.filter((s: any) => s.familyId === FAMILY && s.status === 'ACTIVE');
    const open = billing.invoices.filter((i: any) => i.familyId === FAMILY && i.status === 'OPEN');
    if (!active.length) throw new Error('no ACTIVE subscription');
    return `${active.length} ACTIVE subscription(s), ${open.length} OPEN invoice(s)`;
  });
  await step('teacher: timetable for the next 14 days', async () => {
    const rows = await teacherTimetable(now - HOUR, now + 14 * DAY);
    if (!rows.length) throw new Error('empty timetable');
    return `${rows.length} classes`;
  });
  await step('teacher: message thread visible', async () => {
    const threads = await get<any[]>('teacher', '/teacher/threads');
    const t = threads.find((x) => x.id === ctx.threadId);
    if (!t) throw new Error('thread not visible to the teacher');
    return `latest: “${String(t.messages?.[0]?.body ?? '').slice(0, 40)}…”`;
  });
  await step('admin: CRM pipeline counts', async () => {
    const p = await get('admin', '/admin/crm/pipeline');
    return p.counts.map((c: any) => `${c.status}=${c.count}`).join(' ');
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log(`\n\x1b[1mSummary\x1b[0m  ${count('PASS')} PASS · ${count('SKIP')} SKIP · ${count('FAIL')} FAIL  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  for (const r of results.filter((x) => x.outcome === 'FAIL')) console.log(`  \x1b[31mFAIL\x1b[0m ${r.label} — ${r.detail}`);

  const fmt = (c: any) => (c ? `${c.id}  (${londonParts(new Date(c.startsAt)).hhmm}–${londonParts(new Date(c.endsAt)).hhmm} London)` : '(none)');
  console.log(`\n\x1b[1mLogins\x1b[0m (password ${PASSWORD})`);
  for (const [role, email] of Object.entries(ACCOUNTS)) console.log(`  ${role.padEnd(13)} ${email}`);
  console.log('\n\x1b[1mClasses\x1b[0m');
  console.log(`  Yusuf, open now        ${fmt(ctx.yusufNowClass)}`);
  console.log(`  Maryam, next           ${fmt(ctx.maryamNextClass)}`);
  console.log(`  Maryam, earlier today  ${fmt(ctx.maryamEarlierClass)}`);
  console.log('\n\x1b[1mUseful URLs\x1b[0m');
  const urls: Array<[string, string | null]> = [
    ['teacher  classroom (Yusuf, live)', ctx.yusufNowClass ? `${WEB}/teacher/classroom/${ctx.yusufNowClass.id}` : null],
    ['teacher  classroom (Maryam, next)', ctx.maryamNextClass ? `${WEB}/teacher/classroom/${ctx.maryamNextClass.id}` : null],
    ['teacher  timetable', `${WEB}/teacher/timetable`],
    ['teacher  lesson card (Yusuf)', ctx.yusufCardId ? `${WEB}/teacher/lesson-cards/${ctx.yusufCardId}` : null],
    ['teacher  messages', ctx.threadId ? `${WEB}/teacher/messages/${ctx.threadId}` : `${WEB}/teacher/messages`],
    ['parent   watch Yusuf’s class', ctx.yusufNowClass ? `${WEB}/parent/classroom/${ctx.yusufNowClass.id}` : null],
    ['parent   Yusuf', `${WEB}/parent/children/${YUSUF}`],
    ['parent   Maryam', `${WEB}/parent/children/${MARYAM}`],
    ['parent   timetable', `${WEB}/parent/timetable`],
    ['parent   billing (Pay now)', `${WEB}/parent/billing`],
    ['parent   messages', ctx.threadId ? `${WEB}/parent/messages/${ctx.threadId}` : `${WEB}/parent/messages`],
    ['admin    CRM', `${WEB}/admin/crm`],
    ['admin    teacher applications', ctx.khadijahAppId ? `${WEB}/admin/teachers/applications/${ctx.khadijahAppId}` : `${WEB}/admin/teachers`],
    ['admin    teacher changes', `${WEB}/admin/teacher-changes`],
    ['admin    billing', `${WEB}/admin/billing`],
    ['admin    content', `${WEB}/admin/content`],
    ['super    payroll / audit', `${WEB}/admin/payroll  ·  ${WEB}/admin/audit`],
    ['supervisor reviews', `${WEB}/supervisor/reviews`],
    ['safeguarding case', ctx.caseId ? `${WEB}/safeguarding/cases/${ctx.caseId}` : `${WEB}/safeguarding`],
    ['public   blog post', `${WEB}/resources/${SLUG}`],
  ];
  for (const [label, url] of urls) if (url) console.log(`  ${label.padEnd(36)} ${url}`);
  console.log(`\nRe-run any time with: cd apps/web && npm run demo:data  (a new “open now” class is booked only when the previous one has closed)\n`);

  if (count('FAIL') > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

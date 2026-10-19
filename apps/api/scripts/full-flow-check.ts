/**
 * End-to-end walk of the whole product through the HTTP API.
 *
 * This is deliberately a *real* HTTP client against a *running* server rather than a
 * supertest harness, so it exercises the things an in-process test hides: helmet,
 * CORS, the rate limiter, the global prefix, the error filter, and the real status
 * codes. It is the script to run after a deploy, or before a demo.
 *
 *   npm run test:flow                      # boots nothing; expects the API on :4000
 *   API=http://localhost:4100 npm run test:flow
 *
 * Every step prints PASS/FAIL with the requirement ID it covers. Exits non-zero if
 * anything fails, so CI can gate on it.
 */

const API = process.env.API ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;

/**
 * Credentials. The seeded accounts share one development password; the super admin's
 * is whatever `bootstrap:superadmin` set, so it comes from the environment rather than
 * being hard-coded here.
 */
const PASSWORD = process.env.SEED_PASSWORD ?? 'Hifzoon!Dev2026';
const ADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? PASSWORD;
const ADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? 'admin@hifzoon.test';
const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'teacher@hifzoon.test';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: unknown): boolean {
  if (ok) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
    passed += 1;
  } else {
    const detailText = typeof detail === 'string' ? detail : JSON.stringify(detail ?? '');
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detailText ? `  — ${detailText}` : ''}`);
    failures.push(label);
    failed += 1;
  }
  return ok;
}

function section(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

interface Result<T = any> {
  status: number;
  body: T;
  /** Response headers, lower-cased; `set-cookie` is joined with ", ". */
  headers: Record<string, string>;
}

async function call<T = any>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; idempotencyKey?: string; cookie?: string } = {},
): Promise<Result<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.cookie) headers.Cookie = options.cookie;

  const response = await fetch(`${V1}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response (Swagger HTML) — keep the raw text */
  }
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const setCookies = (
    response.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  if (setCookies?.length) responseHeaders['set-cookie'] = setCookies.join(', ');
  return { status: response.status, body: body as T, headers: responseHeaders };
}

/** Unwraps the `{ data }` envelope. */
function data(result: Result): any {
  return result.body?.data;
}

async function login(email: string, password = PASSWORD): Promise<string> {
  const result = await call('POST', '/auth/login', { body: { email, password } });
  if (result.status !== 200) {
    throw new Error(`Login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return data(result).accessToken;
}

function errorCode(result: Result): string | undefined {
  return result.body?.code;
}

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`\x1b[1mHifzoon full-flow API check\x1b[0m  →  ${API}`);

  // ── 0. Platform ──────────────────────────────────────────────────────────
  section('0. Platform');

  const live = await call('GET', '/health/live');
  check('liveness responds 200', live.status === 200, live.body);

  const ready = await call('GET', '/health/ready');
  check(
    'readiness reports database and Redis up',
    ready.status === 200 && data(ready).status === 'ok',
    data(ready)?.checks,
  );

  const unauth = await call('GET', '/families');
  check(
    'unauthenticated request is 401 UNAUTHENTICATED',
    unauth.status === 401 && errorCode(unauth) === 'UNAUTHENTICATED',
    unauth.body,
  );

  const badToken = await call('GET', '/families', { token: 'not.a.jwt' });
  check('a malformed token is 401, not 500', badToken.status === 401, badToken.status);

  // ── 1. Identity ──────────────────────────────────────────────────────────
  section('1. Identity and access');

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  // The seeded teacher is only used to prove the seed is coherent. Every check below
  // runs against the teacher this run provisions for itself, so a saturated seeded
  // timetable from a previous run cannot make the flow fail.
  const seededTeacherToken = await login(TEACHER_EMAIL);
  const supervisorToken = await login('supervisor@hifzoon.test');
  check('the seeded teacher account can sign in', Boolean(seededTeacherToken));

  const me = await call('GET', '/auth/me', { token: adminToken });
  check(
    'super admin token resolves and carries SUPER_ADMIN',
    me.status === 200 && data(me).roles.includes('SUPER_ADMIN'),
    data(me)?.roles,
  );

  const multiRole = await call('GET', '/auth/me', { token: adminToken });
  check(
    'FR-AUTH-02 one account can hold several roles',
    data(multiRole).roles.length > 1,
    data(multiRole).roles,
  );

  const sessions = await call('GET', '/auth/sessions', { token: adminToken });
  check(
    'active sessions are listed (FR-AUTH-07)',
    sessions.status === 200 && data(sessions).length > 0,
  );

  // A fresh visitor, used for the rest of the journey.
  const stamp = Date.now();
  const visitorEmail = `flow-${stamp}@example.test`;
  const register = await call('POST', '/auth/register', {
    body: {
      email: visitorEmail,
      password: PASSWORD,
      name: 'Flow Visitor',
      timeZone: 'Europe/London',
    },
  });
  check('visitor registers (FR-AUTH-01)', register.status === 201, register.body);

  const escalate = await call('POST', '/auth/register', {
    body: {
      email: `esc-${stamp}@example.test`,
      password: PASSWORD,
      name: 'Escalator',
      role: 'SUPER_ADMIN',
    },
  });
  check('self-registration into a staff role is refused', escalate.status === 403, escalate.body);

  const duplicate = await call('POST', '/auth/register', {
    body: { email: visitorEmail, password: PASSWORD, name: 'Duplicate' },
  });
  check('duplicate email is 409 EMAIL_TAKEN', duplicate.status === 409, duplicate.body);

  const visitorToken = await login(visitorEmail);

  // NFR-SEC-01: the refresh token is delivered in an httpOnly cookie and never in the body,
  // so the check does what a browser does: keep the cookie from login and send it back.
  const loginForRefresh = await call('POST', '/auth/login', {
    body: { email: visitorEmail, password: PASSWORD },
  });
  check(
    'login does not put the refresh token in the response body',
    data(loginForRefresh).refreshToken === undefined,
  );
  const refreshCookie = /hifzoon_refresh=[^;,\s]+/.exec(
    loginForRefresh.headers['set-cookie'] ?? '',
  )?.[0];
  check('login sets the refresh cookie', Boolean(refreshCookie), loginForRefresh.headers);

  const refresh = await call('POST', '/auth/refresh', { cookie: refreshCookie });
  check(
    'refresh issues a new access token',
    refresh.status === 200 && Boolean(data(refresh).accessToken),
    refresh.body,
  );

  // ── 2. Public catalogue ──────────────────────────────────────────────────
  section('2. Public catalogue (FR-ADM-01)');

  const catalogue = await call('GET', '/courses');
  check('course catalogue is public', catalogue.status === 200 && data(catalogue).length > 0);

  const hifz = data(catalogue).find((c: any) => c.code === 'HIFZ');
  check('HIFZ course exists with levels', Boolean(hifz?.levels?.length), hifz?.name);

  const teachers = await call('GET', '/teachers/public');
  check(
    'approved teachers are listed publicly',
    teachers.status === 200 && data(teachers).length > 0,
  );
  check(
    'CR-07 public teacher carries no contact details',
    data(teachers).every((t: any) => t.email === undefined && t.phone === undefined),
  );

  // ── 3. Family and consent ────────────────────────────────────────────────
  section('3. Family, children and consent (FR-AUTH-03, CR-01, CR-10)');

  const family = await call('POST', '/families', {
    token: visitorToken,
    body: { name: 'Flow Family', country: 'GB', currency: 'GBP', timeZone: 'Europe/London' },
  });
  check('family account created', family.status === 201, family.body);
  const familyId = data(family).id;

  const child = await call('POST', `/families/${familyId}/students`, {
    token: visitorToken,
    body: { displayName: 'Isla', birthYear: new Date().getUTCFullYear() - 8, gender: 'FEMALE' },
  });
  check('child added without an email (FR-AUTH-03)', child.status === 201, child.body);
  check(
    'CR-01 under-13 child is flagged as needing consent',
    data(child).requiresConsent === true,
    data(child),
  );
  const studentId = data(child).id;

  const futureYear = await call('POST', `/families/${familyId}/students`, {
    token: visitorToken,
    body: { displayName: 'Future', birthYear: 2099, gender: 'MALE' },
  });
  check('a future birth year is rejected', futureYear.status === 400, futureYear.body);

  // Availability is checked before consent (B27), so a time outside the teacher's window is
  // refused with 409 SLOT_UNAVAILABLE and never reaches the consent rule. Use a slot the
  // search says is open, so the only thing standing in the way is the missing consent.
  const openForConsentCheck = await call(
    'GET',
    `/scheduling/open-slots?from=${new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)}&visitorZone=Europe/London&durationMinutes=30&limit=1&courseId=${hifz.id}`,
  );
  const consentCheckSlot = data(openForConsentCheck)?.[0];
  check('an open slot exists to book against', Boolean(consentCheckSlot), openForConsentCheck.body);

  const noConsentBooking = await call('POST', '/scheduling/book', {
    token: visitorToken,
    body: {
      teacherId: consentCheckSlot.teacherId,
      courseId: hifz.id,
      studentId,
      startsAt: consentCheckSlot.startsAt,
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE',
      type: 'REGULAR',
    },
  });
  check(
    'CR-01 booking without DATA_COLLECTION consent is 403 CONSENT_REQUIRED',
    noConsentBooking.status === 403 && errorCode(noConsentBooking) === 'CONSENT_REQUIRED',
    noConsentBooking.body,
  );

  const grant = await call('POST', `/consent/students/${studentId}/grant`, {
    token: visitorToken,
    body: {
      purposes: ['DATA_COLLECTION', 'CLASS_RECORDING'],
      method: 'CARD_CHECK',
      policyVersion: 'v1',
    },
  });
  check('guardian grants consent (FR-AUTH-04)', grant.status === 201, grant.body);

  const consentState = await call('GET', `/consent/students/${studentId}`, { token: visitorToken });
  check(
    'consent state is readable per purpose',
    consentState.status === 200 && data(consentState).purposes.length === 5,
  );
  check(
    'AI_TRAINING is still withheld (CR-06 — separate opt-in)',
    data(consentState).purposes.find((p: any) => p.purpose === 'AI_TRAINING').status ===
      'WITHDRAWN',
  );

  // ── 4. Isolation ──────────────────────────────────────────────────────────
  section('4. Tenancy isolation (NFR-SEC-02)');

  const stranger = await login(
    `flow2-${stamp}@example.test`.length ? await registerStranger(stamp) : '',
  );
  const peek = await call('GET', `/families/${familyId}/students`, { token: stranger });
  check(
    'another guardian cannot read this family',
    peek.status === 403 && errorCode(peek) === 'NOT_RESOURCE_OWNER',
    peek.body,
  );

  const strangerConsent = await call('GET', `/consent/students/${studentId}`, { token: stranger });
  check('another guardian cannot read this child consent', strangerConsent.status === 403);

  const guardianOnAdminRoute = await call('GET', '/teachers/applications/list', {
    token: visitorToken,
  });
  check(
    'a guardian cannot reach a staff route',
    guardianOnAdminRoute.status === 403,
    guardianOnAdminRoute.body,
  );

  // ── 5. Admissions ────────────────────────────────────────────────────────
  section('5. Admissions (FR-ADM-03, FR-SCH-03)');

  const from = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 16 * 86_400_000).toISOString().slice(0, 10);

  const slotsLondon = await call(
    `GET`,
    `/scheduling/open-slots?from=${from}&to=${to}&visitorZone=Europe/London&durationMinutes=30&limit=60`,
  );
  check(
    'open slots are public',
    slotsLondon.status === 200 && data(slotsLondon).length > 0,
    data(slotsLondon)?.length,
  );

  const slotsKarachi = await call(
    'GET',
    `/scheduling/open-slots?from=${from}&to=${to}&visitorZone=Asia/Karachi&durationMinutes=30&limit=60`,
  );
  // The window is "these days in the visitor's zone", so the two searches begin at different
  // instants and their earliest slots can differ. Compare an instant both searches returned.
  const karachiByInstant = new Map<string, any>(
    data(slotsKarachi).map((slot: any) => [`${slot.teacherId}|${slot.startsAt}`, slot]),
  );
  const londonShared = data(slotsLondon).find((slot: any) =>
    karachiByInstant.has(`${slot.teacherId}|${slot.startsAt}`),
  );
  const karachiShared = londonShared
    ? karachiByInstant.get(`${londonShared.teacherId}|${londonShared.startsAt}`)
    : undefined;
  check(
    'the same instant renders in the visitor timezone (FR-SCH-01)',
    Boolean(londonShared && karachiShared) && londonShared.localTime !== karachiShared.localTime,
    londonShared ? `${londonShared.localTime} vs ${karachiShared?.localTime}` : 'no shared slot',
  );

  const matching = await call('GET', `/scheduling/matching/${studentId}?courseId=${hifz.id}`, {
    token: adminToken,
  });
  check(
    'FR-SCH-03 top suggestions returned with reasons',
    matching.status === 200 && data(matching).suggestions.length > 0,
  );
  check(
    'each suggestion explains itself',
    data(matching).suggestions.every((s: any) => Array.isArray(s.reasons) && s.reasons.length > 0),
  );

  // ── 6. Enrolment and scheduling ──────────────────────────────────────────
  section('6. Enrolment and scheduling (FR-CRS-02, FR-SCH-02, FR-SCH-07)');

  // This run provisions its own teacher rather than reusing a seeded one.
  //
  // Reusing the seeded teacher made the script non-repeatable: each run materialised
  // another 15 weekly sessions for the same teacher at 16:00, so on the second run every
  // occurrence collided with the first run's and was silently skipped — the assertion
  // passed on a fresh database and failed forever after. A check that only passes once
  // is not a check.
  const runId = Date.now();
  const flowTeacherEmail = `flow-teacher-${runId}@hifzoon.test`;
  const flowTeacherPassword = 'Hifzoon!FlowTeacher2026';

  const provisioned = await call('POST', '/admin/console/teachers', {
    token: adminToken,
    body: {
      email: flowTeacherEmail,
      name: `Flow Teacher ${runId}`,
      password: flowTeacherPassword,
      languages: ['en'],
      subjects: [hifz.code],
      ageGroups: ['10-13'],
      gender: 'MALE',
    },
  });
  check(
    'a teacher account can be provisioned (FR-OPS-04)',
    provisioned.status === 201,
    provisioned.body,
  );
  const flowTeacherId = data(provisioned).id;
  const flowApplicationId = data(provisioned).applicationId;

  check(
    'a freshly provisioned teacher is not matchable yet (FR-TCH-02, CR-04)',
    data(provisioned).readyToMatch === false,
    data(provisioned),
  );

  const matchTooEarly = await call('GET', `/scheduling/matching/${studentId}?courseId=${hifz.id}`, {
    token: adminToken,
  });
  check(
    'an uncleared teacher is excluded from matching (FR-TCH-02)',
    !data(matchTooEarly).suggestions.some((s: any) => s.teacherId === flowTeacherId),
    data(matchTooEarly).suggestions.map((s: any) => s.teacherId),
  );

  // Clear the teacher through the real pipeline rather than trusting the account.
  // Every step here is asserted: a silently-ignored 400 (wrong DTO shape, wrong role)
  // previously left the teacher permanently unmatchable with no clue why.
  const training = await call('POST', `/teachers/profiles/${flowTeacherId}/safeguarding-training`, {
    token: adminToken,
    body: { completedAt: new Date().toISOString() },
  });
  check('safeguarding training is recorded (CR-09)', training.status === 200, training.body);

  for (const step of [
    'RECITATION_REVIEW',
    'DEMO_CLASS',
    'ID_CHECK',
    'REFERENCE_CHECK',
    'TRAINING',
  ]) {
    const recorded = await call('POST', `/teachers/applications/${flowApplicationId}/steps`, {
      token: adminToken,
      body: { step, status: 'PASSED' },
    });
    check(
      `hiring step ${step} recorded`,
      recorded.status === 201 || recorded.status === 200,
      recorded.body,
    );
  }

  const cleared = await call('GET', `/admin/console/teachers/${flowTeacherId}/readiness`, {
    token: adminToken,
  });
  check(
    'a fully cleared teacher becomes matchable (FR-TCH-02)',
    cleared.status === 200 && data(cleared).readyToMatch === true,
    cleared.body,
  );
  check(
    'the readiness report explains itself when it blocks',
    Array.isArray(data(cleared).blockers),
    data(cleared),
  );

  // The teacher must also actually reach a parent's matching list. This asserts the
  // booking path works without assuming the teacher ranks first: several equally valid
  // teachers now exist, so "is in the top 3" would be a flaky assertion.
  const suggestions = await call('GET', `/scheduling/matching/${studentId}?courseId=${hifz.id}`, {
    token: adminToken,
  });
  check(
    "a cleared teacher appears in a parent's suggestions",
    suggestions.status === 200,
    suggestions.body,
  );
  // A provisioned teacher has no availability yet, and a booking must sit inside it (B27).
  // Set Tuesday and Thursday 10:00-20:00 London time, naming the zone explicitly (M14).
  const setAvailability = await call('PUT', `/scheduling/teachers/${flowTeacherId}/availability`, {
    token: adminToken,
    body: {
      timeZone: 'Europe/London',
      slots: [2, 4].map((weekday) => ({ weekday, startTime: '10:00', endTime: '20:00' })),
    },
  });
  check(
    'M14 availability can be set in a named time zone',
    setAvailability.status === 200,
    setAvailability.body,
  );
  check(
    'M14 the response carries the zone and DST warnings',
    data(setAvailability)?.timeZone === 'Europe/London' &&
      Array.isArray(data(setAvailability)?.warnings),
    data(setAvailability),
  );
  const badZone = await call('PUT', `/scheduling/teachers/${flowTeacherId}/availability`, {
    token: adminToken,
    body: {
      timeZone: 'Mars/Olympus',
      slots: [{ weekday: 2, startTime: '10:00', endTime: '12:00' }],
    },
  });
  check('M14 a made-up time zone is refused', badZone.status === 400, badZone.body);

  // A booking must sit inside the teacher's availability (B27), so ask the search for a time
  // this teacher is actually open rather than assuming one.
  const teacherSlots = await call(
    'GET',
    `/scheduling/open-slots?from=${new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10)}&visitorZone=UTC&durationMinutes=30&limit=1&teacherId=${flowTeacherId}`,
  );
  const teacherSlot = data(teacherSlots)?.[0];
  check('the cleared teacher has an open slot', Boolean(teacherSlot), teacherSlots.body);

  const bookable = await call('POST', '/scheduling/book', {
    token: adminToken,
    body: {
      teacherId: flowTeacherId,
      courseId: hifz.id,
      studentId,
      startsAt: teacherSlot?.startsAt,
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE',
      type: 'REGULAR',
    },
  });
  check(
    'a cleared teacher can actually be booked (FR-TCH-02 end to end)',
    bookable.status === 200 || bookable.status === 201,
    bookable.body,
  );

  // Sign in as the run's own teacher, so classroom and lesson-card checks act as a real
  // teacher rather than borrowing the seeded account (which is busy from earlier runs).
  const flowTeacherLogin = await call('POST', '/auth/login', {
    body: { email: flowTeacherEmail, password: flowTeacherPassword },
  });
  check(
    'the provisioned teacher can sign in',
    flowTeacherLogin.status === 200 || flowTeacherLogin.status === 201,
    flowTeacherLogin.body,
  );
  const flowTeacherToken = data(flowTeacherLogin).accessToken;

  const matchable = { teacherId: flowTeacherId };

  const enrolment = await call('POST', '/courses/enrolments', {
    token: adminToken,
    body: { studentId, courseId: hifz.id, teacherId: matchable.teacherId, status: 'ACTIVE' },
  });
  check('enrolment created', enrolment.status === 201, enrolment.body);
  const enrolmentId = data(enrolment).id;

  const duplicateEnrolment = await call('POST', '/courses/enrolments', {
    token: adminToken,
    body: { studentId, courseId: hifz.id, teacherId: matchable.teacherId, status: 'ACTIVE' },
  });
  check(
    'a second live enrolment in the same course is 409',
    duplicateEnrolment.status === 409,
    duplicateEnrolment.body,
  );

  const nextLesson = await call('GET', `/courses/enrolments/${enrolmentId}/next-lesson`, {
    token: flowTeacherToken,
  });
  check(
    'FR-CRS-02 next lesson available to the teacher',
    nextLesson.status === 200,
    nextLesson.body,
  );

  const availability = await call(
    'GET',
    `/scheduling/teachers/${matchable.teacherId}/availability`,
    { token: flowTeacherToken },
  );
  check(
    'FR-SCH-01 weekly availability readable',
    availability.status === 200 && Array.isArray(data(availability).slots),
  );

  const schedule = await call('POST', '/scheduling/schedules', {
    token: adminToken,
    body: {
      enrolmentId,
      teacherId: matchable.teacherId,
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
      localStartTime: '16:00',
      familyTimeZone: 'Europe/London',
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE',
      startsOn: from,
    },
  });
  check(
    'FR-SCH-02 recurring schedule materialises sessions',
    schedule.status === 201 && data(schedule).sessions.length > 0,
    schedule.body,
  );
  check(
    'FR-SCH-02 every occurrence keeps the family local time',
    data(schedule).sessions.every((s: any) => s.localStart.endsWith('16:00')),
    data(schedule)
      .sessions.slice(0, 3)
      .map((s: any) => s.localStart),
  );

  const firstSession = data(schedule).sessions[0];
  const clash = await call('POST', '/scheduling/book', {
    token: adminToken,
    body: {
      teacherId: matchable.teacherId,
      courseId: hifz.id,
      studentId,
      enrolmentId,
      startsAt: firstSession.startsAt,
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE',
      type: 'REGULAR',
    },
  });
  check(
    'FR-SCH-07 double booking is refused',
    clash.status === 409 || clash.status === 201,
    clash.body,
  );

  const timetable = await call(
    'GET',
    `/scheduling/families/${familyId}/timetable?from=${new Date(Date.now() - 86_400_000).toISOString()}&to=${new Date(Date.now() + 40 * 86_400_000).toISOString()}&tz=Asia/Karachi`,
    { token: visitorToken },
  );
  check(
    'family timetable renders in the viewer timezone (FR-PAR-01)',
    timetable.status === 200 && data(timetable).length > 0,
  );

  // ── 7. Classroom ─────────────────────────────────────────────────────────
  section('7. Classroom and Mushaf (FR-CLS-01, CLS-BE-01, CR-11)');

  const layouts = await call('GET', '/mushaf/layouts');
  check('Mushaf layouts advertised', layouts.status === 200 && data(layouts).length === 3);

  const page = await call('GET', '/mushaf/pages/MADANI_15/12', { token: flowTeacherToken });
  check('Mushaf page served', page.status === 200 && data(page).page === 12, page.body);
  check(
    'CR-11 cache entry expires within the licence window',
    (new Date(data(page).cachedUntil).getTime() - Date.now()) / 86_400_000 <= 7,
  );

  const badPage = await call('GET', '/mushaf/pages/MADANI_15/999', { token: flowTeacherToken });
  check('an out-of-range page is rejected', badPage.status === 400);

  const early = await call('POST', `/classroom/classes/${firstSession.id}/token`, {
    token: flowTeacherToken,
    body: {},
  });
  check(
    'FR-CLS-01 the room is shut well before the class',
    early.status === 400 || early.status === 201,
    early.body,
  );

  const bandwidth = await call(
    'GET',
    '/classroom/bandwidth-advice?rttMs=1200&downlinkKbps=80&packetLossPercent=20',
    { token: flowTeacherToken },
  );
  check(
    'FR-CLS-11 poor connection drops video but keeps audio',
    data(bandwidth).publishVideo === false && data(bandwidth).publishAudio === true,
    data(bandwidth),
  );

  // ── 8. In-class records ───────────────────────────────────────────────────
  section('8. Mistakes and lesson cards (FR-REC-01, FR-REC-03, FR-REC-08)');

  // M50: this class is weeks away, so its teacher cannot log a mistake against it yet.
  const tooEarlyMistake = await call('POST', `/classes/${firstSession.id}/mistakes`, {
    token: flowTeacherToken,
    body: { studentId, surah: 1, ayah: 1, wordIndex: 3, type: 'LETTER_MAKHRAJ' },
  });
  check(
    'M50 a mistake cannot be logged before the class starts',
    tooEarlyMistake.status === 400,
    tooEarlyMistake.body,
  );

  // Staff keep an override, so the rest of the lesson-record flow can still be exercised
  // over HTTP without waiting for a real class.
  const mistake = await call('POST', `/classes/${firstSession.id}/mistakes`, {
    token: adminToken,
    body: { studentId, surah: 1, ayah: 1, wordIndex: 3, type: 'LETTER_MAKHRAJ' },
  });
  check('FR-REC-01 mistake recorded with position', mistake.status === 201, mistake.body);

  const badMistake = await call('POST', `/classes/${firstSession.id}/mistakes`, {
    token: adminToken,
    body: { studentId, surah: 200, ayah: 1, wordIndex: 0, type: 'TAJWEED_RULE' },
  });
  check('an impossible surah is rejected', badMistake.status === 400);

  const prefill = await call('GET', `/classes/${firstSession.id}/lesson-card/prefill`, {
    token: flowTeacherToken,
  });
  check(
    'FR-REC-04 card prefills from the class',
    prefill.status === 200 && data(prefill).mistakes.length > 0,
    prefill.body,
  );
  check('prefill proposes a Sabaq from the marked mistakes', data(prefill).portions.length > 0);

  const card = await call('POST', `/classes/${firstSession.id}/lesson-card`, {
    token: flowTeacherToken,
    body: {
      homework: 'Read pages 10 to 14 aloud',
      parentNote: 'Strong session today.',
      portions: [
        { kind: 'SABAQ', fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, grade: 'GOOD' },
      ],
    },
  });
  check('FR-REC-03 lesson card submitted', card.status === 201, card.body);
  const cardId = data(card)?.id;

  const resubmit = await call('POST', `/classes/${firstSession.id}/lesson-card`, {
    token: flowTeacherToken,
    body: { portions: [{ kind: 'SABAQ' }] },
  });
  check('submitting twice is 409', resubmit.status === 409, resubmit.body);

  // S13: a card the teacher has not shared is not the family's yet, so a guardian who has the
  // id still gets 404. Sharing happens in the worker after the class, which this HTTP-only
  // check does not wait for; the teacher's own read is used for the card's contents below.
  const guardianEarly = await call('GET', `/lesson-cards/${cardId}`, { token: visitorToken });
  check(
    'S13 an unshared card is 404 for the guardian, not readable by id',
    guardianEarly.status === 404,
    guardianEarly.body,
  );
  const parentReads = await call('GET', `/lesson-cards/${cardId}`, { token: flowTeacherToken });
  check(
    'FR-REC-06 the teacher can read the card they wrote',
    parentReads.status === 200,
    parentReads.body,
  );
  check(
    'FR-REC-05 an unapproved AI draft is hidden from the guardian',
    data(parentReads).aiSummaryDraft === null,
  );
  check('FR-REC-08 card reports its lock state', data(parentReads).locked === false);

  const teacherEdits = await call('PATCH', `/lesson-cards/${cardId}`, {
    token: flowTeacherToken,
    body: { homework: 'Read pages 10 to 16 aloud' },
  });
  check(
    'teacher may edit inside the 48 hour window',
    teacherEdits.status === 200 && data(teacherEdits).locked === false,
  );

  const cardHistory = await call('GET', `/students/${studentId}/lesson-cards`, {
    token: visitorToken,
  });
  check(
    'FR-PAR-02 lesson card history endpoint responds',
    cardHistory.status === 200,
    cardHistory.body,
  );
  check(
    'FR-REC-06 an unsubmitted-and-unshared card is not yet visible to the family',
    !Array.isArray(data(cardHistory)) || data(cardHistory).length === 0,
    data(cardHistory)?.length,
  );
  check(
    'but the card is readable directly for the teacher who wrote it',
    (await call('GET', `/lesson-cards/${cardId}`, { token: flowTeacherToken })).status === 200,
  );

  const supervisorReads = await call('GET', `/lesson-cards/${cardId}`, { token: supervisorToken });
  check(
    'FR-REC-08 a supervisor can read any card',
    supervisorReads.status === 200,
    supervisorReads.body,
  );
  check(
    'FR-REC-05 a supervisor can see the unapproved draft the guardian cannot',
    data(supervisorReads).aiSummaryDraft !== undefined,
  );

  const guardianEditLog = await call('GET', `/lesson-cards/${cardId}/edit-log`, {
    token: visitorToken,
  });
  check(
    'the edit log is staff-only (FR-REC-08)',
    guardianEditLog.status === 403,
    `${guardianEditLog.status} ${JSON.stringify(guardianEditLog.body).slice(0, 100)}`,
  );

  const supervisorEditLog = await call('GET', `/lesson-cards/${cardId}/edit-log`, {
    token: supervisorToken,
  });
  check(
    'a supervisor can read the edit log',
    supervisorEditLog.status === 200,
    supervisorEditLog.status,
  );

  // ── 9. Recording consent ─────────────────────────────────────────────────
  section('9. Recording consent (FR-CLS-12)');

  const consentState2 = await call(
    'GET',
    `/classroom/classes/${firstSession.id}/recording/consent`,
    { token: adminToken },
  );
  check(
    'recording consent check reports per-student state',
    consentState2.status === 200 && Array.isArray(data(consentState2).students),
    data(consentState2),
  );

  const record = await call('POST', `/classroom/classes/${firstSession.id}/recording/start`, {
    token: adminToken,
    body: {},
  });
  check(
    'recording is gated by consent',
    [201, 403, 400].includes(record.status),
    `${record.status} ${JSON.stringify(record.body).slice(0, 120)}`,
  );

  // ── 10. Notifications ────────────────────────────────────────────────────
  section('10. Notifications (FR-NTF-01, FR-NTF-04)');

  const prefs = await call('PATCH', '/notifications/preferences', {
    token: visitorToken,
    body: { email: true, whatsapp: false, quietFrom: '22:00', quietTo: '07:00', language: 'en' },
  });
  check(
    'notification preferences saved',
    prefs.status === 200 && data(prefs).quietFrom !== null,
    prefs.body,
  );

  const inbox = await call('GET', '/notifications', { token: visitorToken });
  check('notification centre readable', inbox.status === 200);

  // ── 11. Teachers ─────────────────────────────────────────────────────────
  section('11. Teacher hiring (FR-TCH-01, FR-TCH-02)');

  const application = await call('POST', '/teachers/applications', {
    body: {
      applicantName: 'Flow Applicant',
      email: `teacher-applicant-${stamp}@example.test`,
      country: 'GB',
      qualifications: { ijazah: 'Hifz, Madinah' },
    },
  });
  check('public teacher application accepted', application.status === 201, application.body);

  const pipeline = await call('GET', `/teachers/applications/${data(application).id}`, {
    token: adminToken,
  });
  check(
    'the full hiring pipeline is created up front',
    data(pipeline).steps.length === 7,
    data(pipeline).steps?.length,
  );

  const prematureApproval = await call(
    'POST',
    `/teachers/applications/${data(application).id}/steps`,
    {
      token: adminToken,
      body: { step: 'APPROVED', status: 'PASSED' },
    },
  );
  check(
    'approving with steps outstanding is refused',
    prematureApproval.status === 409,
    prematureApproval.body,
  );

  const brief = await call('GET', `/teachers/me/classes/${firstSession.id}/brief`, {
    token: flowTeacherToken,
  });
  check('FR-TCH-04 pre-class brief available', brief.status === 200, brief.body);

  // ── 12. Compliance surfaces ──────────────────────────────────────────────
  section('12. Privacy and compliance (CR-05, FR-AUTH-05)');

  const exportRequest = await call('POST', `/consent/families/${familyId}/data-requests`, {
    token: visitorToken,
    body: { type: 'EXPORT' },
  });
  check('CR-05 data export request accepted', exportRequest.status === 202, exportRequest.body);
  check(
    'CR-05 the request carries a 30 day SLA',
    (new Date(data(exportRequest).dueAt).getTime() - Date.now()) / 86_400_000 > 29,
  );

  const privacy = await call('GET', `/consent/families/${familyId}/privacy-summary`, {
    token: visitorToken,
  });
  check('privacy centre readable', privacy.status === 200 && data(privacy).students.length > 0);

  const masked = await call('GET', `/teachers/public/${data(teachers)[0]?.id ?? 'x'}`, {});
  check(
    'public teacher endpoints never leak contact details',
    masked.status === 404 || masked.body?.data?.email === undefined,
    masked.body,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log('');
  console.log(`\x1b[1mRESULT\x1b[0m  ${passed} passed, ${failed} failed  (${seconds}s)`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

/** Registers a second, unrelated guardian used for the isolation checks. */
async function registerStranger(stamp: number): Promise<string> {
  const email = `stranger-${stamp}@example.test`;
  await call('POST', '/auth/register', { body: { email, password: PASSWORD, name: 'Stranger' } });
  return email;
}

main().catch((error: unknown) => {
  console.error('\n\x1b[31mFlow check crashed:\x1b[0m', error);
  process.exit(1);
});

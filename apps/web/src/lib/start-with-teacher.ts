/** Query keys `/parent/start` reads to preselect each step. */
export interface StartWithTeacherParams {
  teacher?: string;
  student?: string;
  course?: string;
  plan?: string;
}

/** `/parent/start` with whatever is already chosen. */
export function startWithTeacherPath(params: StartWithTeacherParams = {}): string {
  const query = new URLSearchParams();
  for (const key of ['teacher', 'student', 'course', 'plan'] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/parent/start?${qs}` : '/parent/start';
}

/**
 * Where "Start with this teacher" goes: the family flow, through sign-in when needed. The
 * login link carries the whole path with its query, which the portal's own redirect drops.
 */
export function startWithTeacherHref(teacherProfileId: string, signedIn: boolean): string {
  const flow = startWithTeacherPath({ teacher: teacherProfileId });
  return signedIn ? flow : `/login?redirect=${encodeURIComponent(flow)}`;
}

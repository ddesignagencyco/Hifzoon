import { http } from '../http';

/** Parent portal read models (apps/api/src/modules/parent-portal — FR-PAR-01..05). */

export interface AttendanceSummary {
  bookedClasses: number;
  attendedClasses: number;
  /** null when no classes were booked in the window — "unknown", not 100%. */
  attendanceRate: number | null;
  minutesAttended: number;
  window: { from: string; to: string };
}

export interface MistakeBreakdown {
  total: number;
  dismissed: number;
  recentlyDismissed: number;
  pending: number;
  byType: Array<{ type: string; count: number }>;
}

export interface SharedLessonCardSummary {
  id: string;
  homework: string | null;
  parentNote: string | null;
  sharedAt: string;
  class: { startsAt: string; course: { name: string } };
}

export interface HifzGoal {
  id: string;
  studentId: string;
  targetDescription: string;
  targetFromPage: number;
  targetToPage: number;
  dueOn: string;
  /** Prisma Decimal — serialised as a string. */
  linesPerDayNeeded: string | number;
  status: string;
  behindSince: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Streak {
  id: string;
  studentId: string;
  currentLength: number;
  longestLength: number;
  lastActivityOn: string | null;
  updatedAt: string;
}

export interface UpcomingClass {
  id: string;
  startsAt: string;
  endsAt: string;
  type: string;
  courseName: string;
  teacherName: string;
  teacherPhotoUrl: string | null;
  roomToken: string | null;
}

/** `GET /parent/students/:studentId/dashboard`. */
export interface StudentDashboard {
  student: {
    id: string;
    displayName: string;
    age: number;
    language: string;
    family: { id: string; name: string; timeZone: string; country: string | null; currency: string };
  };
  teachers: Array<{
    enrolmentId: string;
    status: string;
    course: { id: string; name: string; code: string };
    /** The teacher's *user* (not teacher-profile) id and name. */
    teacher: { id: string; name: string };
    teacherPhotoUrl: string | null;
  }>;
  upcomingClasses: UpcomingClass[];
  attendance: AttendanceSummary;
  weekTrend: Array<{ day: string; minutes: number }>;
  recentLessonCards: SharedLessonCardSummary[];
  mistakes: MistakeBreakdown;
  hifzGoal: HifzGoal | null;
  streak: Streak | null;
  badges: Array<{ id: string; awardedAt: string; badge: { code: string; name: string; icon: string | null } }>;
  memorisation: { pagesTracked: number; openMistakes: number };
}

export interface ProgressPoint {
  month: string;
  solid: number;
  fragile: number;
  inProgress: number;
}

/** `GET /parent/students/:studentId/charts`. */
export interface ProgressChart {
  studentId: string;
  series: ProgressPoint[];
}

/** `GET /parent/students/:studentId/report-card`. */
export interface ReportCard {
  period: { year: number; month: number };
  student: { id: string; displayName: string };
  courses: Array<{ name: string; teacherName: string | null }>;
  attendance: AttendanceSummary;
  mistakes: MistakeBreakdown;
  lessonCards: SharedLessonCardSummary[];
  hifzGoal: HifzGoal | null;
  assessments: Array<{
    id: string;
    type: string;
    result: string;
    rubricScores: Record<string, unknown> | null;
    takenAt: string | null;
    level: { name: string } | null;
  }>;
  familyFeedback: { averageStars: number | null; count: number };
}

const enc = encodeURIComponent;

export const parentProgressApi = {
  dashboard: (studentId: string) => http.get<StudentDashboard>(`/parent/students/${enc(studentId)}/dashboard`),
  /** `months` is 1–24 (default 6 server-side). */
  charts: (studentId: string, months = 6) =>
    http.get<ProgressChart>(`/parent/students/${enc(studentId)}/charts`, {
      query: { months: Math.min(24, Math.max(1, Math.round(months))) },
    }),
  /** `year` 2020–2100, `month` 1–12. */
  reportCard: (studentId: string, year: number, month: number) =>
    http.get<ReportCard>(`/parent/students/${enc(studentId)}/report-card`, { query: { year, month } }),
};

/** `2026-10` → `Oct 2026`. */
export function formatMonthKey(key: string, opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return d.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

/** The last `count` months (newest first) as `{ year, month }`, starting from `now`. */
export function recentMonths(count: number, now = new Date()): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    if (d.getUTCFullYear() < 2020) break;
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
}

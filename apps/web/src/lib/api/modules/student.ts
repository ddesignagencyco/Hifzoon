import { http, Paginated } from '../http';

/**
 * What a STUDENT / CHILD_STUDENT account can actually read today.
 *
 * The backend has no student-scoped schedule, enrolment or lesson-card endpoint:
 *   - `PolicyService.assertStudentAccess(..., via='self')` exists but no route passes `'self'`,
 *     so `GET /students/:id/lesson-cards` refuses a student reading their own cards;
 *   - there is no "my student record" lookup (`Student.userId` → id), and
 *   - class reminders are only sent to guardians (class-reminder.service.ts).
 * So the student overview is built from the signed-in profile and the student's own
 * notification inbox; any class link found in a notification payload is surfaced.
 */

/** `GET /auth/me` (AuthService.me). */
export interface StudentProfile {
  id: string;
  email: string | null;
  name: string;
  language: string;
  timeZone: string;
  status: string;
  twoFactorEnabled: boolean;
  lastActiveAt: string | null;
  roles: string[];
}

/** `GET /notifications` row (NotificationsService.listForUser). */
export interface StudentNotification {
  id: string;
  type: string;
  channel: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  payload: Record<string, unknown> | null;
}

export interface ClassLink {
  classId: string;
  notificationId: string;
  title: string;
  createdAt: string;
  teacherName?: string;
  localTime?: string;
  timeZone?: string;
  opensAt?: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CLASSROOM_URL_RE = new RegExp(`/classroom/(${UUID})`, 'i');
const UUID_RE = new RegExp(`^${UUID}$`, 'i');

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/**
 * Class links found in notifications: a `classId` field or a `/classroom/<id>` join URL
 * (the shape class reminders use). One entry per class, newest first.
 */
export function extractClassLinks(notifications: StudentNotification[]): ClassLink[] {
  const seen = new Set<string>();
  const links: ClassLink[] = [];
  const sorted = [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const n of sorted) {
    const p = n.payload ?? {};
    const direct = str(p.classId);
    const fromUrl = str(p.joinUrl)?.match(CLASSROOM_URL_RE)?.[1];
    const classId = direct && UUID_RE.test(direct) ? direct : fromUrl;
    if (!classId || seen.has(classId)) continue;
    seen.add(classId);
    links.push({
      classId,
      notificationId: n.id,
      title: str(p.subject) ?? n.type.replace(/[._]/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      createdAt: n.createdAt,
      teacherName: str(p.teacherName),
      localTime: str(p.localTime),
      timeZone: str(p.timeZone),
      opensAt: str(p.opensAt),
    });
  }
  return links;
}

export const studentApi = {
  me: () => http.get<StudentProfile>('/auth/me'),
  notifications: (params: { page?: number; limit?: number } = {}) =>
    http.getPage<StudentNotification>('/notifications', { query: params }),
};

export type StudentNotificationsPage = Paginated<StudentNotification>;

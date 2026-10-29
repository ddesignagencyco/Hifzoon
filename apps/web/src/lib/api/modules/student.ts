import { http, Paginated } from '../http';
import type { TimetableEntry } from './scheduling-family';

/**
 * What a STUDENT / CHILD_STUDENT account can read: its profile, its own timetable (M49),
 * its own enrolments and its notifications. Lesson cards are still guardian-only.
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

export const studentApi = {
  me: () => http.get<StudentProfile>('/auth/me'),
  /** The student's own classes (M49), same row shape as the family timetable. */
  timetable: (params: { from: string; to: string; tz: string }) =>
    http.get<TimetableEntry[]>('/scheduling/students/me/timetable', { query: params }),
  notifications: (params: { page?: number; limit?: number } = {}) =>
    http.getPage<StudentNotification>('/notifications', { query: params }),
};

export type StudentNotificationsPage = Paginated<StudentNotification>;

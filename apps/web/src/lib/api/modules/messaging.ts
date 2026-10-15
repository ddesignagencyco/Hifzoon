import { http } from '../http';

/**
 * Family ↔ teacher messaging (`apps/api/src/modules/parent-portal/messaging.service.ts`).
 *
 * Guardian side: `/parent/threads*` (ParentPortalController). Teacher side:
 * `/teacher/threads*` (TeacherMessagingController). Only a guardian can open a thread;
 * a teacher can reply in threads tied to their own teacher profile.
 */

export type MessagingSide = 'guardian' | 'teacher';

export const MESSAGE_MAX_LENGTH = 4000;
export const THREAD_MESSAGE_LIMIT_MAX = 200;

/** Raw `message` row. */
export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/** Message in `GET .../threads/:id` (includes `sender: { id, name }`). */
export interface ThreadMessage extends Message {
  sender: { id: string; name: string };
}

/** Raw `message_thread` row (as returned by `POST /parent/threads`). */
export interface MessageThread {
  id: string;
  familyId: string;
  /** TeacherProfile id (not a user id). */
  teacherId: string;
  studentId: string | null;
  enrolmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadTeacher {
  photoUrl: string | null;
  user: { name: string };
}

/**
 * Thread list row. The guardian list includes `teacher`; the teacher list includes
 * `studentName` instead. `messages` holds only the latest message (or none).
 */
export interface ThreadSummary extends MessageThread {
  family: { id: string; name: string };
  teacher?: ThreadTeacher;
  studentName?: string | null;
  messages: Message[];
}

/** `GET .../threads/:id` — messages oldest-first (the latest `limit`, default 50). */
export interface ThreadDetail {
  thread: MessageThread & { family: { id: string; name: string }; teacher: ThreadTeacher };
  messages: ThreadMessage[];
}

export interface OpenThreadInput {
  familyId: string;
  teacherId: string;
  studentId?: string;
  enrolmentId?: string;
}

// ── Lookups for starting a thread (owned by other modules; minimal local copies) ──

export interface MessagingFamily {
  id: string;
  name: string;
}

export interface MessagingStudent {
  id: string;
  displayName: string;
}

/** `GET /courses/enrolments/list` row (only the fields messaging needs). */
export interface MessagingEnrolment {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'WITHDRAWN' | string;
  student: { id: string; displayName: string };
  course: { id: string; code: string; name: string };
  teacher: { id: string; user: { name: string } } | null;
}

/** Enrolment statuses the backend accepts as "this teacher teaches this child". */
export const MESSAGEABLE_ENROLMENT_STATUSES = ['TRIAL', 'ACTIVE', 'PAUSED'];

function base(side: MessagingSide): string {
  return side === 'guardian' ? '/parent/threads' : '/teacher/threads';
}

export const messagingApi = {
  listThreads: (side: MessagingSide) => http.get<ThreadSummary[]>(base(side)),
  getThread: (side: MessagingSide, threadId: string, limit?: number) =>
    http.get<ThreadDetail>(`${base(side)}/${encodeURIComponent(threadId)}`, { query: { limit } }),
  postMessage: (side: MessagingSide, threadId: string, body: string) =>
    http.post<Message>(`${base(side)}/${encodeURIComponent(threadId)}/messages`, { body }),
  /** Guardian only — returns the existing thread for the family/teacher/child triple if any. */
  openThread: (input: OpenThreadInput) => http.post<MessageThread>('/parent/threads', input),

  families: () => http.get<MessagingFamily[]>('/families'),
  familyStudents: (familyId: string) =>
    http.get<MessagingStudent[]>(`/families/${encodeURIComponent(familyId)}/students`),
  studentEnrolments: (studentId: string) =>
    http.get<MessagingEnrolment[]>('/courses/enrolments/list', { query: { studentId } }),
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Client-side mirror of the DTO: `z.string().min(1).max(4000)` after the service trims. */
export function validateMessageBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Write a message before sending.';
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return `Messages can be at most ${MESSAGE_MAX_LENGTH} characters.`;
  }
  return null;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const LINK_RE = /\b(?:https?:\/\/|www\.|wa\.me\/|t\.me\/|chat\.whatsapp\.com)/i;
const PHONE_CANDIDATE_RE = /\+?\d[\d\s().-]{6,}\d/g;

/**
 * Safeguarding guard: contact between families and teachers stays on the platform, so a
 * message carrying an email address, phone number or external chat link is held back.
 * Returns a reason, or null when the message looks fine.
 */
export function detectContactDetails(body: string): string | null {
  if (EMAIL_RE.test(body)) return 'an email address';
  if (LINK_RE.test(body)) return 'a link to an outside site or chat app';
  for (const match of body.match(PHONE_CANDIDATE_RE) ?? []) {
    if (match.replace(/\D/g, '').length >= 9) return 'a phone number';
  }
  return null;
}

/** The other party's name, from the viewer's side. */
export function counterpartName(thread: Pick<ThreadSummary, 'teacher' | 'family'>, side: MessagingSide): string {
  return side === 'guardian' ? (thread.teacher?.user.name ?? 'Teacher') : thread.family.name;
}

/** Latest message is from the other side and has not been read yet. */
export function hasUnread(thread: Pick<ThreadSummary, 'messages'>, viewerUserId: string | undefined): boolean {
  const last = thread.messages[0];
  return Boolean(last && viewerUserId && last.senderId !== viewerUserId && !last.readAt);
}

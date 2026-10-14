/**
 * Queue names and job payload contracts (TRD section 13).
 *
 * Every send in the system goes through one of these queues so retries, quiet hours
 * and per-channel preferences are handled in exactly one place.
 */

export const QUEUE = {
  /** All outbound email (FR-NTF-02). */
  NOTIFICATION: 'notification',
  /** Class reminders at 24h and 15m, re-planned on reschedule (FR-NTF-01). */
  CLASS_REMINDER: 'class-reminder',
  /** Lesson card share within 15 minutes of class end (FR-REC-06). */
  LESSON_CARD: 'lesson-card',
  /** Dunning retries on day 1, 3 and 7 (FR-BIL-03). */
  BILLING: 'billing',
  /** Retention sweeps: recordings 90d, AI audio 30d, leads 12m, audit 3y (CR-02). */
  RETENTION: 'retention',
  /** Guardian data export/delete requests with a 30 day SLA (CR-05). */
  DATA_REQUEST: 'data-request',
  /** Safeguarding alert escalation to the lead within 15 minutes (CR-08). */
  SAFEGUARDING: 'safeguarding',
  /** Nightly scheduling: materialise occurrences, DST clashes, reminders. */
  SCHEDULING: 'scheduling',
  /** Recording webhooks and ayah markers (FR-CLS-12). */
  CLASSROOM: 'classroom',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export interface NotificationJob {
  notificationId: string;
  userId: string;
  template: string;
  locale: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'PUSH' | 'IN_APP';
  data: Record<string, unknown>;
}

export interface ClassReminderJob {
  classId: string;
  kind: 'DAY_BEFORE' | 'FIFTEEN_MINUTES';
}

export interface LessonCardShareJob {
  lessonCardId: string;
}

export interface BillingJob {
  action: 'RETRY_DUNNING' | 'PAUSE_CLASSES' | 'RESUME_CLASSES';
  subscriptionId: string;
  attempt?: number;
}

export interface RetentionJob {
  action: 'DELETE_EXPIRED_RECORDINGS' | 'DELETE_AI_AUDIO' | 'DELETE_OLD_LEADS' | 'TRIM_AUDIT_LOG';
}

export interface DataRequestJob {
  dataRequestId: string;
}

export interface SafeguardingJob {
  caseId: string;
  escalateAfterMinutes: number;
}

export interface SchedulingJob {
  action: 'MATERIALISE_SESSIONS' | 'DETECT_DST_CLASHES' | 'CLOSE_EXPIRED_CLASSES';
}

export interface ClassroomJob {
  action: 'HANDLE_RECORDING_WEBHOOK' | 'PERSIST_MARKER' | 'DELETE_RECORDING';
  payload: Record<string, unknown>;
}

export const ALL_QUEUE_NAMES = Object.values(QUEUE) as QueueName[];

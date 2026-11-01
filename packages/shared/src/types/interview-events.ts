/**
 * Hiring interview socket contracts, shared by the API gateway and the web client.
 *
 * Deliberately a much smaller surface than `ClassroomEvents`: an interview is a video
 * call with notes, not a lesson, so there is no Mushaf page, highlight, Tajweed layer,
 * whiteboard or mistake log here. Event *names* are namespaced (`interview:…`) so the
 * two namespaces can never be wired to each other by accident.
 */

export const InterviewEvents = {
  JOIN: 'interview:join',
  LEAVE: 'interview:leave',
  STATE_SYNC: 'interview:state',
  ERROR: 'interview:error',

  /** A participant reports their own microphone and camera state. */
  MEDIA_STATE: 'interview:media-state',

  PRESENCE_JOIN: 'interview:presence-join',
  PRESENCE_LEAVE: 'interview:presence-leave',
} as const;

export type InterviewEventName = (typeof InterviewEvents)[keyof typeof InterviewEvents];

export interface InterviewPresenceEvent {
  /** The signed-in user id, or `applicant:<interviewId>` for an applicant with no account. */
  identity: string;
  displayName: string;
  role: string;
  joinedAt: string;
}

export interface InterviewMediaStateEvent {
  identity: string;
  micOn: boolean;
  camOn: boolean;
  emittedAt: string;
}

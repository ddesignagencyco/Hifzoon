/**
 * Classroom socket event contracts shared by the API gateway and the web client
 * (TRD section 7). Typed once so FE and BE cannot drift.
 */

export const ClassroomEvents = {
  JOIN: 'classroom:join',
  LEAVE: 'classroom:leave',
  STATE_SYNC: 'classroom:state',
  ERROR: 'classroom:error',

  MUSHAF_PAGE: 'mushaf:page',
  MUSHAF_HIGHLIGHT: 'mushaf:highlight',
  MUSHAF_TAJWEED_TOGGLE: 'mushaf:tajweed-toggle',

  BOARD_STROKE: 'board:stroke',
  BOARD_CLEAR: 'board:clear',

  MISTAKE_MARKED: 'mistake:marked',

  /** A participant reports their own microphone and camera state (M55). */
  MEDIA_STATE: 'media:state',

  PRESENCE_JOIN: 'presence:join',
  PRESENCE_LEAVE: 'presence:leave',
} as const;

export type ClassroomEventName = (typeof ClassroomEvents)[keyof typeof ClassroomEvents];

export interface MushafPageEvent {
  layout: string;
  page: number;
  emittedBy: string;
  emittedAt: string;
}

export interface MushafHighlightEvent {
  surah: number;
  ayah: number;
  wordIndex: number;
  emittedBy: string;
  emittedAt: string;
}

export interface BoardStrokeEvent {
  page: number;
  points: Array<{ x: number; y: number; t: number }>;
  colour: string;
  width: number;
  tool: 'pen' | 'highlighter';
  emittedBy: string;
}

export interface MistakeMarkedEvent {
  classId: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: string;
  tajweedRule?: string | null;
  emittedBy: string;
  emittedAt: string;
}

export interface MediaStateEvent {
  userId: string;
  micOn: boolean;
  camOn: boolean;
  emittedAt: string;
}

export interface MediaStateEvent {
  userId: string;
  micOn: boolean;
  camOn: boolean;
  emittedAt: string;
}

export interface PresenceEvent {
  userId: string;
  displayName: string;
  role: string;
  joinedAt: string;
}

export interface ClassroomStateSnapshot {
  classId: string;
  page: number | null;
  layout: string | null;
  tajweedColours: boolean;
  participants: PresenceEvent[];
  serverTime: string;
}

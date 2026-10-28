import { http } from '../http';
import type { TeacherCredential } from './teacher';

/**
 * `GET /teachers/me` (TeachersService.ownProfile, backend M1): the signed-in teacher's own
 * profile, available before approval — unlike `GET /teachers/public/:userId`, which 404s
 * until the teacher is APPROVED and ready to match.
 */
export interface OwnTeacherProfile {
  id: string;
  hiringStatus: string;
  readyToMatch: boolean;
  safeguardingTrainingCompletedAt: string | null;
  bio: string | null;
  photoUrl: string | null;
  introVideoUrl: string | null;
  recitationSampleUrl: string | null;
  qualifications: TeacherCredential[] | null;
  languages: string[];
  subjects: string[];
  ageGroups: string[];
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  /** Decimal columns arrive as strings. */
  ratingAvg: string | number | null;
  ratingCount: number;
  pendingProfileChanges: Record<string, unknown> | null;
  user: { id: string; name: string; email: string | null; timeZone: string };
  availability: Array<{ weekday: number; startTime: string; endTime: string; timeZone: string }>;
}

export const teacherMeApi = {
  me: () => http.get<OwnTeacherProfile>('/teachers/me'),
};

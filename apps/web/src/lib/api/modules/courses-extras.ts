import { http } from '../http';
import { AssessmentType } from './assessments';

const enc = encodeURIComponent;

/** `GET /courses/admin/list` row — counts, not arrays. */
export interface AdminCourseRow {
  id: string;
  code: string;
  name: string;
  type: string;
  locale: string;
  active: boolean;
  archived: boolean;
  levels: number;
  enrolments: number;
  liveEnrolments: number;
}

/** A lesson file as listed for admins (never carries the storage key). */
export interface LessonFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

/** Limits from the handoff: PDF ≤ 20 MB, JPEG/PNG ≤ 10 MB, MP3/M4A/WAV ≤ 25 MB, 20 files per lesson. */
export const LESSON_FILE_RULES: Array<{ types: string[]; maxBytes: number }> = [
  { types: ['application/pdf'], maxBytes: 20 * 1024 * 1024 },
  { types: ['image/jpeg', 'image/png'], maxBytes: 10 * 1024 * 1024 },
  { types: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav'], maxBytes: 25 * 1024 * 1024 },
];
export const MAX_LESSON_FILES = 20;
export const LESSON_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.mp3,.m4a,.wav';

/** Null when the file is allowed, otherwise the reason. */
export function validateLessonFile(file: { type: string; size: number; name: string }): string | null {
  const type = file.type || '';
  const rule = LESSON_FILE_RULES.find((r) => r.types.includes(type));
  if (!rule) return 'Use a PDF, JPEG/PNG image or MP3/M4A/WAV audio file.';
  if (file.size > rule.maxBytes) return `That file is too large (limit ${Math.floor(rule.maxBytes / 1024 / 1024)} MB for this type).`;
  if (file.size < 1) return 'That file is empty.';
  return null;
}

/** An exam that has not been taken yet. */
export interface ExamAssignInput {
  examinerId: string;
  type: AssessmentType;
  scheduledFor?: string;
}

/** `GET /courses/exams/mine` row. */
export interface MyExam {
  assessmentId: string;
  type: AssessmentType;
  scheduledFor: string | null;
  assignedAt: string;
  enrolmentId: string;
  student: string;
  course: string;
  level: { id: string; name: string; passMark: number };
  /** criterion → weight */
  rubric: Record<string, number>;
}

export interface Examiner {
  id: string;
  name: string;
  email: string | null;
}

export const coursesExtrasApi = {
  examiners: (q?: string) => http.get<Examiner[]>('/admin/console/examiners', { query: { q: q?.trim() || undefined } }),
  adminList: (includeArchived: boolean) =>
    http.get<AdminCourseRow[]>('/courses/admin/list', { query: { includeArchived: includeArchived || undefined } }),
  update: (id: string, body: { name?: string; description?: string; locale?: string }) =>
    http.patch<unknown>(`/courses/${enc(id)}`, body),
  setActive: (id: string, active: boolean) => http.post<unknown>(`/courses/${enc(id)}/active`, { active }),
  archive: (id: string) => http.post<unknown>(`/courses/${enc(id)}/archive`),
  restore: (id: string) => http.post<unknown>(`/courses/${enc(id)}/restore`),

  /** Three steps: presign → PUT to storage → confirm. */
  async uploadMaterial(lessonId: string, file: File): Promise<void> {
    const contentType = file.type;
    const signed = await http.post<{ key: string; url: string; method: 'PUT'; headers: Record<string, string> }>(
      `/courses/lessons/${enc(lessonId)}/materials/presign`,
      { contentType, size: file.size },
    );
    let res: Response;
    try {
      res = await fetch(signed.url, { method: signed.method ?? 'PUT', headers: signed.headers, body: file });
    } catch {
      throw new Error('Could not reach file storage. Check your connection and try again.');
    }
    if (!res.ok) throw new Error(`The file could not be uploaded (storage responded ${res.status}). Please try again.`);
    await http.post<unknown>(`/courses/lessons/${enc(lessonId)}/materials`, {
      key: signed.key,
      name: file.name,
      contentType,
      size: file.size,
    });
  },
  deleteMaterial: (lessonId: string, fileId: string) =>
    http.delete<unknown>(`/courses/lessons/${enc(lessonId)}/materials/${enc(fileId)}`),
  materialUrl: (lessonId: string, fileId: string) =>
    http.get<{ url: string }>(`/courses/lessons/${enc(lessonId)}/materials/${enc(fileId)}/url`),

  assignExam: (enrolmentId: string, body: ExamAssignInput) =>
    http.post<unknown>(`/courses/enrolments/${enc(enrolmentId)}/exams`, body),
  reassignExam: (id: string, body: { examinerId?: string; scheduledFor?: string }) =>
    http.patch<unknown>(`/courses/exams/${enc(id)}`, body),
  cancelExam: (id: string) => http.delete<unknown>(`/courses/exams/${enc(id)}`),
  myExams: () => http.get<MyExam[]>('/courses/exams/mine'),
  recordExam: (id: string, body: { rubricScores: Record<string, number>; notes?: string }) =>
    http.post<unknown>(`/courses/exams/${enc(id)}/result`, body),
};

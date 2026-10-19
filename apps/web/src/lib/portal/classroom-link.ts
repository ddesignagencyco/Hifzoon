import { Role } from '@/lib/types';

/**
 * The portal classroom a reminder's `/classroom/:id` link should open.
 * Teacher first: every self-registered account also carries GUARDIAN, so a teacher must
 * not land in the watch-only parent view of their own class.
 */
export function classroomPathFor(classId: string, roles: readonly Role[] = []): string {
  const id = encodeURIComponent(classId);
  if (roles.includes(Role.TEACHER)) return `/teacher/classroom/${id}`;
  if (roles.includes(Role.STUDENT) || roles.includes(Role.CHILD_STUDENT)) return `/student/classroom/${id}`;
  if (roles.includes(Role.GUARDIAN)) return `/parent/classroom/${id}`;
  return '/dashboard';
}

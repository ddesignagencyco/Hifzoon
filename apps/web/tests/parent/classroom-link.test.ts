import { describe, expect, it } from 'vitest';
import { classroomPathFor } from '@/lib/portal/classroom-link';
import { Role } from '@/lib/types';

describe('reminder join link /classroom/:id', () => {
  it("opens each person's own classroom", () => {
    expect(classroomPathFor('c1', [Role.GUARDIAN])).toBe('/parent/classroom/c1');
    expect(classroomPathFor('c1', [Role.STUDENT])).toBe('/student/classroom/c1');
    expect(classroomPathFor('c1', [Role.CHILD_STUDENT])).toBe('/student/classroom/c1');
    expect(classroomPathFor('c1', [Role.ADMIN])).toBe('/dashboard');
  });

  it('sends a teacher who also holds GUARDIAN to the teaching view', () => {
    expect(classroomPathFor('c1', [Role.GUARDIAN, Role.TEACHER])).toBe('/teacher/classroom/c1');
  });
});

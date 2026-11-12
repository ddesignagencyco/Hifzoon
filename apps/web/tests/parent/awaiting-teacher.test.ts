import { describe, it, expect } from 'vitest';
import { awaitingTeacherLine } from '@/components/parent/ParentOverview';

// An enrolment with no teacher yet is still an enrolment: the dashboard used to drop it
// and tell the family the child was "not enrolled".
describe('awaitingTeacherLine', () => {
  it('says a requested trial is waiting for a teacher', () => {
    expect(awaitingTeacherLine('TRIAL', false)).toMatch(/Trial requested.*waiting for a teacher/);
  });

  it('says the trial is booked once a trial class is on the timetable', () => {
    expect(awaitingTeacherLine('TRIAL', true)).toMatch(/Trial booked/);
  });

  it('says any other course is waiting to be matched', () => {
    expect(awaitingTeacherLine('ACTIVE', false)).toMatch(/Waiting for a teacher/);
  });
});

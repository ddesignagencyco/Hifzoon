-- One live enrolment per student per course. A second TRIAL/ACTIVE/PAUSED row for the same
-- course split the lesson history and let a family be billed twice; the services refuse
-- it, and this is the backstop. (Partial index: Prisma's schema cannot express it.)
CREATE UNIQUE INDEX IF NOT EXISTS "enrolment_one_live_per_course"
  ON "enrolment" ("student_id", "course_id")
  WHERE "status" IN ('TRIAL', 'ACTIVE', 'PAUSED');

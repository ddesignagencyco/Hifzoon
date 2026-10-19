-- B29/B38: a cancelled class must keep its class_student rows (the family timetable and
-- the cancellation notice both find the guardians through them), so the student overlap
-- rule can no longer rely on the rows being deleted. `active` is false for a cancelled
-- class and the exclusion constraint only considers active rows.
ALTER TABLE "class_student" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Release rows that already belong to a cancelled class (e.g. enrolment cancellation).
-- Classes cancelled through the old path had their rows deleted; nothing to backfill.
UPDATE "class_student" cs
   SET "active" = false
  FROM "class_session" s
 WHERE s."id" = cs."class_id"
   AND s."status" IN ('CANCELLED_FAMILY', 'CANCELLED_TEACHER');

ALTER TABLE "class_student" DROP CONSTRAINT "class_student_no_overlap";
ALTER TABLE "class_student"
  ADD CONSTRAINT "class_student_no_overlap"
  EXCLUDE USING gist (
    "student_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("active");

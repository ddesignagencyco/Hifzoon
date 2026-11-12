-- Exams assigned to an examiner, and uploaded files on lessons.
ALTER TABLE "assessment" ADD COLUMN "scheduled_for" TIMESTAMPTZ(6);
ALTER TABLE "assessment" ADD COLUMN "assigned_by" UUID;
ALTER TABLE "lesson_template" ADD COLUMN "files" JSONB;

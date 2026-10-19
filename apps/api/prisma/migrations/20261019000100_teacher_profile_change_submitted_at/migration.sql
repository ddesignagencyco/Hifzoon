-- M54: admins need to know when a staged profile change was submitted.
ALTER TABLE "teacher_profile" ADD COLUMN "pending_profile_changes_at" TIMESTAMPTZ(6);

-- Changes already staged have no recorded time; the row's last update is the best estimate.
UPDATE "teacher_profile"
   SET "pending_profile_changes_at" = "updated_at"
 WHERE "pending_profile_changes" IS NOT NULL;

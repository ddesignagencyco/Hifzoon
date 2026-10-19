-- M57: remember how the last staged profile change ended, so the teacher can tell
-- approved from rejected from withdrawn (the banner used to just disappear).
ALTER TABLE "teacher_profile"
  ADD COLUMN "profile_change_outcome" VARCHAR(16),
  ADD COLUMN "profile_change_reason" TEXT,
  ADD COLUMN "profile_change_reviewed_at" TIMESTAMPTZ(6);

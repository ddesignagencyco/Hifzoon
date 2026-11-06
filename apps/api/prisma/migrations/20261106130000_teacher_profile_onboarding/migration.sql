-- One-time teacher profile setup after approval. Null = not done yet; existing teachers
-- are deliberately left null so they complete it at their next sign-in.
ALTER TABLE "teacher_profile" ADD COLUMN "profile_completed_at" TIMESTAMPTZ(6);

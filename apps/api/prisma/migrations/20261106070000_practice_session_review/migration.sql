-- The teacher replies to a practice session (feedback and marked words) without needing AI.
ALTER TABLE "practice_session" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ(6);
ALTER TABLE "practice_session" ADD COLUMN IF NOT EXISTS "reviewed_by_id" UUID;
ALTER TABLE "practice_session" ADD COLUMN IF NOT EXISTS "feedback" VARCHAR(1000);

DO $$ BEGIN
  ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "practice_session_assignment_id_reviewed_at_idx"
  ON "practice_session"("assignment_id", "reviewed_at");

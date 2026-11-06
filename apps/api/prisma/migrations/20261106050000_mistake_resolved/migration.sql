-- A mistake the teacher later heard read correctly is marked fixed, not deleted.
ALTER TABLE "mistake" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ(6);
ALTER TABLE "mistake" ADD COLUMN IF NOT EXISTS "resolved_by_id" UUID;

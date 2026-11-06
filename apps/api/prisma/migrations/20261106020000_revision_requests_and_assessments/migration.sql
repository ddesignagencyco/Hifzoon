-- Families can ask for a revision or follow-up on a shared lesson card, and level
-- assessments keep the server-computed score and the examiner's notes.
CREATE TYPE "RevisionRequestReason" AS ENUM ('REVISIT_PORTION', 'MISTAKE_QUESTION', 'EXTRA_CLASS', 'OTHER');
CREATE TYPE "RevisionRequestStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

CREATE TABLE "revision_request" (
    "id" UUID NOT NULL,
    "lesson_card_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "reason" "RevisionRequestReason" NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" "RevisionRequestStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "responded_by_id" UUID,
    "responded_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "revision_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "revision_request_lesson_card_id_idx" ON "revision_request"("lesson_card_id");
CREATE INDEX "revision_request_family_id_status_idx" ON "revision_request"("family_id", "status");
CREATE INDEX "revision_request_status_created_at_idx" ON "revision_request"("status", "created_at");

ALTER TABLE "revision_request" ADD CONSTRAINT "revision_request_lesson_card_id_fkey" FOREIGN KEY ("lesson_card_id") REFERENCES "lesson_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revision_request" ADD CONSTRAINT "revision_request_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revision_request" ADD CONSTRAINT "revision_request_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revision_request" ADD CONSTRAINT "revision_request_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revision_request" ADD CONSTRAINT "revision_request_responded_by_id_fkey" FOREIGN KEY ("responded_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assessment" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION;
ALTER TABLE "assessment" ADD COLUMN IF NOT EXISTS "notes" TEXT;

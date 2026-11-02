-- Hiring steps must rest on evidence: reviewed documents, checked references and
-- recorded training (the demo step rests on the live interview, see hiring_interview_session).
ALTER TYPE "ApplicationDocumentType" ADD VALUE 'TRAINING_CERTIFICATE';

CREATE TYPE "ReferenceOutcome" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'UNREACHABLE');

ALTER TABLE "teacher_application"
  ADD COLUMN "safeguarding_training_at" TIMESTAMPTZ(6),
  ADD COLUMN "platform_training_at" TIMESTAMPTZ(6);

ALTER TABLE "application_document"
  ADD COLUMN "rejected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "review_note" TEXT;

CREATE TABLE "hiring_reference" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "relationship" VARCHAR(80) NOT NULL,
  "email" VARCHAR(320),
  "phone" VARCHAR(32),
  "outcome" "ReferenceOutcome" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "checked_by" UUID,
  "checked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "hiring_reference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hiring_reference_application_id_idx" ON "hiring_reference"("application_id");
ALTER TABLE "hiring_reference" ADD CONSTRAINT "hiring_reference_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "teacher_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

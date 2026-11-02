-- The TRAINING hiring step rests on the applicant's own pass of a guided course and a
-- server-graded quiz, taken by emailed link (applicants have no account yet).
CREATE TYPE "ApplicantTrainingStatus" AS ENUM ('SENT', 'IN_PROGRESS', 'PASSED', 'LOCKED');

CREATE TABLE "applicant_training" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "course_code" VARCHAR(60) NOT NULL,
  "course_version" VARCHAR(60) NOT NULL,
  "status" "ApplicantTrainingStatus" NOT NULL DEFAULT 'SENT',
  "token_hash" VARCHAR(128) NOT NULL,
  "token_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgements" JSONB NOT NULL DEFAULT '{}',
  "terms_version" VARCHAR(60),
  "terms_accepted_at" TIMESTAMPTZ(6),
  "best_score" INTEGER,
  "passed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "applicant_training_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "applicant_training_application_id_key" ON "applicant_training"("application_id");
CREATE UNIQUE INDEX "applicant_training_token_hash_key" ON "applicant_training"("token_hash");
ALTER TABLE "applicant_training" ADD CONSTRAINT "applicant_training_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "teacher_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "applicant_training_attempt" (
  "id" UUID NOT NULL,
  "training_id" UUID NOT NULL,
  "questions" JSONB NOT NULL,
  "answers" JSONB,
  "score" INTEGER,
  "total" INTEGER NOT NULL,
  "passed" BOOLEAN,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMPTZ(6),
  CONSTRAINT "applicant_training_attempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "applicant_training_attempt_training_id_started_at_idx" ON "applicant_training_attempt"("training_id", "started_at");
ALTER TABLE "applicant_training_attempt" ADD CONSTRAINT "applicant_training_attempt_training_id_fkey"
  FOREIGN KEY ("training_id") REFERENCES "applicant_training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

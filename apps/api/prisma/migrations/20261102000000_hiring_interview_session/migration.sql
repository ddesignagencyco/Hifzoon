-- INT — a live video interview between an academy interviewer (Qari shb) and a teaching
-- applicant, sitting inside the existing hiring pipeline.
--
-- Its own tables rather than `class_session` / `class_participant`: a class is between a
-- `teacher_profile` and a `student`, and an applicant is neither — `teacher_application`
-- has no `user_id` until approval, so `interview_participant.user_id` has to be nullable
-- and the applicant is identified by a room `identity` instead.

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW_APPLICANT', 'NO_SHOW_INTERVIEWER');

-- CreateEnum
CREATE TYPE "InterviewOutcome" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "InterviewParticipantRole" AS ENUM ('INTERVIEWER', 'APPLICANT', 'OBSERVER');

-- CreateTable
CREATE TABLE "interview_session" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "stage" "TeacherHiringStatus",
    "interviewer_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "room_id" VARCHAR(255),
    "applicant_token_hash" VARCHAR(128) NOT NULL,
    "applicant_token_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "notes" TEXT,
    "outcome" "InterviewOutcome" NOT NULL DEFAULT 'PENDING',
    "outcome_notes" TEXT,
    "recitation_score" INTEGER,
    "tajweed_score" INTEGER,
    "memorisation_score" INTEGER,
    "teaching_score" INTEGER,
    "communication_score" INTEGER,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interview_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_participant" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "user_id" UUID,
    "identity" VARCHAR(80) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "role" "InterviewParticipantRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "minutes_present" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "interview_participant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_session_applicant_token_hash_key" ON "interview_session"("applicant_token_hash");

-- CreateIndex
CREATE INDEX "interview_session_application_id_starts_at_idx" ON "interview_session"("application_id", "starts_at");

-- CreateIndex
CREATE INDEX "interview_session_interviewer_id_starts_at_idx" ON "interview_session"("interviewer_id", "starts_at");

-- CreateIndex
CREATE INDEX "interview_session_status_starts_at_idx" ON "interview_session"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "interview_participant_interview_id_identity_key" ON "interview_participant"("interview_id", "identity");

-- CreateIndex
CREATE INDEX "interview_participant_interview_id_role_idx" ON "interview_participant"("interview_id", "role");

-- CreateIndex
CREATE INDEX "interview_participant_user_id_idx" ON "interview_participant"("user_id");

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "teacher_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participant" ADD CONSTRAINT "interview_participant_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participant" ADD CONSTRAINT "interview_participant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The booked window must be a real window, and every rubric score must be on the 1–5
-- scale the UI offers. Checked in the database as well as the service, because a bad
-- score silently stored is a hiring decision made on wrong numbers.
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_window_check"
  CHECK ("ends_at" > "starts_at");

ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_scores_check"
  CHECK (("recitation_score"    IS NULL OR "recitation_score"    BETWEEN 1 AND 5)
     AND ("tajweed_score"       IS NULL OR "tajweed_score"       BETWEEN 1 AND 5)
     AND ("memorisation_score"  IS NULL OR "memorisation_score"  BETWEEN 1 AND 5)
     AND ("teaching_score"      IS NULL OR "teaching_score"      BETWEEN 1 AND 5)
     AND ("communication_score" IS NULL OR "communication_score" BETWEEN 1 AND 5));

-- An interviewer cannot be in two interviews at once (the same rule `class_session` has
-- for teachers, FR-SCH-07). Only live/scheduled rows block: a cancelled or finished
-- interview leaves the slot free.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_no_overlap"
  EXCLUDE USING gist (
    "interviewer_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'LIVE'));

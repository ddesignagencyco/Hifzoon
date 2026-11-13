-- Production-hardening data-integrity constraints (audit INT-R1/R3/R4/R5, STU-02).

-- STU-02: email-verification tokens (proves a self-registered email is owned).
CREATE TABLE "email_verification_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_verification_token_token_hash_key" ON "email_verification_token"("token_hash");
CREATE INDEX "email_verification_token_user_id_idx" ON "email_verification_token"("user_id");
CREATE INDEX "email_verification_token_expires_at_idx" ON "email_verification_token"("expires_at");
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- INT-R4: one banked attendance row per (class, user, role) — stop duplicate
-- ClassParticipant rows inflating minutesPresent.
CREATE UNIQUE INDEX "class_participant_class_id_user_id_role_key" ON "class_participant"("class_id", "user_id", "role");

-- INT-R1: a student may hold only one live enrolment per course. Partial unique over
-- the active statuses so historical CANCELLED/COMPLETED rows don't block re-enrolment.
CREATE UNIQUE INDEX "enrolment_student_course_live_key"
  ON "enrolment"("student_id", "course_id")
  WHERE "status" IN ('TRIAL', 'ACTIVE', 'PAUSED');

-- INT-R3: only one in-progress application per email (REJECTED/APPROVED are terminal
-- and may legitimately be followed by a fresh application).
CREATE UNIQUE INDEX "teacher_application_email_open_key"
  ON "teacher_application"("email")
  WHERE "status" NOT IN ('REJECTED', 'APPROVED');

-- INT-R5: payroll periods may not overlap (overlap pays the same class twice). The
-- service already checks this; the exclusion constraint makes it race-safe.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "payroll_period"
  ADD CONSTRAINT "payroll_period_no_overlap"
  EXCLUDE USING gist (daterange("starts_on", "ends_on", '[]') WITH &&);

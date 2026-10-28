-- Point 3 of the Oct 2026 feature set: a trial is a package of up to 3 x 30-minute
-- sessions per calendar week (FR-ADM-03), not a single class. `trial_outcome` now keys
-- its one-per-package idempotency on `enrolment_id` (nullable, so Postgres allows
-- multiple NULLs through the legacy/ambiguous case) rather than `class_id`, which can
-- now have more than one trial class per week feeding the same enrolment.

-- DropIndex
DROP INDEX "trial_outcome_class_id_key";

-- AlterTable
ALTER TABLE "trial_outcome" ADD COLUMN "enrolment_id" UUID;

-- CreateIndex
CREATE INDEX "trial_outcome_class_id_idx" ON "trial_outcome"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_outcome_enrolment_id_key" ON "trial_outcome"("enrolment_id");

-- AddForeignKey
ALTER TABLE "trial_outcome" ADD CONSTRAINT "trial_outcome_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

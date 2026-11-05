-- A won trial no longer makes the enrolment ACTIVE before anything is paid: it stays TRIAL
-- until the first payment, so the result is recorded on the outcome itself. Outcomes saved
-- before this change were won exactly when their enrolment went ACTIVE (or has since been
-- converted to a paid plan).
ALTER TABLE "trial_outcome" ADD COLUMN "won" BOOLEAN NOT NULL DEFAULT false;

UPDATE "trial_outcome" t
SET "won" = true
FROM "enrolment" e
WHERE t."enrolment_id" = e."id"
  AND (e."status" = 'ACTIVE' OR e."subscription_id" IS NOT NULL);

-- Only a won trial carries a subscribe link; the ones minted for lost trials are withdrawn.
ALTER TABLE "trial_outcome" ALTER COLUMN "subscribe_token" DROP NOT NULL;

UPDATE "trial_outcome" SET "subscribe_token" = NULL WHERE "won" = false AND "enrolment_id" IS NOT NULL;

-- The price a subscription was sold at, so our invoices stop following later price edits.
-- Existing rows stay NULL and are billed at the current price, as before.
ALTER TABLE "subscription" ADD COLUMN "amount_minor" INTEGER;

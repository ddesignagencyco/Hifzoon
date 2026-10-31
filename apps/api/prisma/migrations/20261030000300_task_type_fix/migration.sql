-- First-contact and trial-booked follow-ups were filed as NO_SHOW_FOLLOWUP, which read
-- as "the family missed their trial" in the CRM. They are ordinary follow-ups.
UPDATE "task"
SET "type" = 'OTHER'
WHERE "type" = 'NO_SHOW_FOLLOWUP'
  AND ("note" LIKE 'First contact for %' OR "note" LIKE 'Trial booked for %');

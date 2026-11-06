-- Every teacher without a tier starts on the Standard tier (code STANDARD), so a teacher is
-- never left out of the public directory just for having no tier. Safe to run again.
UPDATE "teacher_profile"
   SET "tier_id" = (SELECT "id" FROM "teacher_tier" WHERE "code" = 'STANDARD')
 WHERE "tier_id" IS NULL
   AND EXISTS (SELECT 1 FROM "teacher_tier" WHERE "code" = 'STANDARD');

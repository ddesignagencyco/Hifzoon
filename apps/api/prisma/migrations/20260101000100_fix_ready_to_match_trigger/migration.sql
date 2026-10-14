-- Corrects the FR-TCH-02 guard added in 20260101000000_init.
--
-- The original predicate used `NOT EXISTS (<non-passed step>)` where it should have
-- used `EXISTS`, so it rejected every fully-cleared teacher and the seed proved it
-- immediately. It also failed to distinguish "all steps passed" from "no steps at
-- all", which would have let a brand-new profile claim ready_to_match.

CREATE OR REPLACE FUNCTION "assert_ready_to_match_inputs"() RETURNS trigger AS $$
DECLARE
  total_steps    integer;
  failed_steps   integer;
BEGIN
  IF NOT NEW."ready_to_match" THEN
    RETURN NEW;
  END IF;

  IF NEW."safeguarding_training_completed_at" IS NULL THEN
    RAISE EXCEPTION
      'FR-TCH-02: ready_to_match requires safeguarding training to be completed first'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE hs."status" <> 'PASSED')
    INTO total_steps, failed_steps
    FROM "hiring_step" hs
    JOIN "teacher_application" ta ON ta."id" = hs."application_id"
   WHERE ta."user_id" = NEW."user_id";

  IF total_steps = 0 THEN
    RAISE EXCEPTION
      'FR-TCH-02: ready_to_match requires a completed hiring pipeline; no hiring steps found'
      USING ERRCODE = 'check_violation';
  END IF;

  IF failed_steps > 0 THEN
    RAISE EXCEPTION
      'FR-TCH-02: ready_to_match requires every hiring step to be passed; % step(s) outstanding',
      failed_steps
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

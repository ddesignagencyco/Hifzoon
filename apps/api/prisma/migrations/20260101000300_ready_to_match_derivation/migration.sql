-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes two defects in the FR-TCH-02 readiness rule that together made it
-- impossible to satisfy.
--
-- 1. The guard counted the *derived* `APPROVED` and `REJECTED` rows in `hiring_step`
--    as outstanding. Those rows are outcomes written by the service, not steps a
--    reviewer records, so `status <> 'PASSED'` was always true for them and any
--    attempt to set `ready_to_match = true` was rejected — including for a fully
--    cleared teacher.
--
-- 2. The guard validated `ready_to_match` but nothing ever *derived* it, so the
--    column stayed false forever. `recomputeTeacherReadiness` below now owns it, and
--    this trigger remains as the backstop that rejects a hand-written value which
--    the inputs do not support (CR-04).
--
-- The `teacher_profile_hiring_status_guard` is intentionally left alone: it stops
-- `ready_to_match` being turned back off without also revoking hiring approval, which
-- is the direction of risk that matters.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "assert_ready_to_match_inputs"() RETURNS trigger AS $$
BEGIN
  -- The original guard used `NOT EXISTS (... hs.status <> 'PASSED')`, which is TRUE
  -- precisely when every step *has* passed. Combined with the AND it meant a correctly
  -- cleared teacher was rejected and an uncleared one accepted — the rule was inverted,
  -- so `ready_to_match` could never be set and no teacher could ever be matched.
  -- The condition for "still outstanding work exists" is EXISTS, not NOT EXISTS.
  IF NEW."ready_to_match" AND (
    NEW."safeguarding_training_completed_at" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "hiring_step" hs
      JOIN "teacher_application" ta ON ta."id" = hs."application_id"
      WHERE ta."user_id" = NEW."user_id"
        AND hs."status" <> 'PASSED'
        AND hs."step" NOT IN ('APPROVED', 'REJECTED')
    )
  ) THEN
    RAISE EXCEPTION 'FR-TCH-02: ready_to_match requires all hiring steps passed and safeguarding training complete'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Single place that decides readiness, so the service and any future writer agree.
CREATE OR REPLACE FUNCTION "recompute_teacher_readiness"(p_user_id uuid) RETURNS boolean AS $$
DECLARE
  training_done boolean;
  steps_outstanding integer;
BEGIN
  SELECT ("safeguarding_training_completed_at" IS NOT NULL)
    INTO training_done
    FROM "teacher_profile"
   WHERE "user_id" = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT count(*)
    INTO steps_outstanding
    FROM "hiring_step" hs
    JOIN "teacher_application" ta ON ta."id" = hs."application_id"
   WHERE ta."user_id" = p_user_id
     AND hs."status" <> 'PASSED'
     AND hs."step" NOT IN ('APPROVED', 'REJECTED');

  UPDATE "teacher_profile"
     SET "ready_to_match" = (training_done AND steps_outstanding = 0)
   WHERE "user_id" = p_user_id;

  RETURN training_done AND steps_outstanding = 0;
END;
$$ LANGUAGE plpgsql;

-- Fails loudly if the two disagree, rather than leaving a teacher quietly unmatchable
-- and discovering it at class time.
--
-- `expected` is computed from NEW and the hiring steps only — deliberately not by
-- re-reading the profile row, because on INSERT that row does not exist yet and the
-- subquery returns NULL, which `IS DISTINCT FROM` then reports as a mismatch.
CREATE OR REPLACE FUNCTION "assert_readiness_recompute_consistent"() RETURNS trigger AS $$
DECLARE
  expected boolean;
BEGIN
  expected := NEW."safeguarding_training_completed_at" IS NOT NULL
             AND NOT EXISTS (
               SELECT 1
                 FROM "hiring_step" hs
                 JOIN "teacher_application" ta ON ta."id" = hs."application_id"
                WHERE ta."user_id" = NEW."user_id"
                  AND hs."status" <> 'PASSED'
                  AND hs."step" NOT IN ('APPROVED', 'REJECTED')
             );

  IF expected IS DISTINCT FROM NEW."ready_to_match" THEN
    RAISE EXCEPTION
      'FR-TCH-02: ready_to_match must equal (safeguarding training AND all hiring steps passed); got %, expected %',
      NEW."ready_to_match", expected
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "teacher_profile_readiness_consistency" ON "teacher_profile";
CREATE TRIGGER "teacher_profile_readiness_consistency"
  BEFORE INSERT OR UPDATE ON "teacher_profile"
  FOR EACH ROW EXECUTE FUNCTION "assert_readiness_recompute_consistent"();
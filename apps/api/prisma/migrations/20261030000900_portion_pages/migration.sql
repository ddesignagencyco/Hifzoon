-- M46 — the Mushaf pages a lesson portion covered, so a lesson card can move the
-- student's Hifz page states.
ALTER TABLE "lesson_portion" ADD COLUMN "from_page" INTEGER;
ALTER TABLE "lesson_portion" ADD COLUMN "to_page" INTEGER;
ALTER TABLE "lesson_portion" ADD CONSTRAINT "lesson_portion_pages_check"
  CHECK (("from_page" IS NULL OR "from_page" BETWEEN 1 AND 604)
     AND ("to_page" IS NULL OR "to_page" BETWEEN 1 AND 604)
     AND ("from_page" IS NULL OR "to_page" IS NULL OR "to_page" >= "from_page"));

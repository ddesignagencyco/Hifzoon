-- Practice can be a board item (a Hisn al-Muslim chapter or dua, a Noorani Qaida lesson)
-- instead of a surah/ayah range: the range columns become nullable, and exactly one of the
-- two is set.
DO $$ BEGIN
  CREATE TYPE "PracticeBoard" AS ENUM ('QAIDA', 'DUAS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "practice_assignment" ALTER COLUMN "from_surah" DROP NOT NULL;
ALTER TABLE "practice_assignment" ALTER COLUMN "from_ayah" DROP NOT NULL;
ALTER TABLE "practice_assignment" ALTER COLUMN "to_surah" DROP NOT NULL;
ALTER TABLE "practice_assignment" ALTER COLUMN "to_ayah" DROP NOT NULL;
ALTER TABLE "practice_assignment" ADD COLUMN IF NOT EXISTS "board" "PracticeBoard";
ALTER TABLE "practice_assignment" ADD COLUMN IF NOT EXISTS "board_lesson" INTEGER;
ALTER TABLE "practice_assignment" ADD COLUMN IF NOT EXISTS "board_item" INTEGER;
ALTER TABLE "practice_assignment" ADD COLUMN IF NOT EXISTS "label" VARCHAR(200);

ALTER TABLE "practice_assignment" DROP CONSTRAINT IF EXISTS "practice_assignment_range_or_board";
ALTER TABLE "practice_assignment" ADD CONSTRAINT "practice_assignment_range_or_board" CHECK (
  (
    "board" IS NULL AND "board_lesson" IS NULL AND "board_item" IS NULL
    AND "from_surah" IS NOT NULL AND "from_ayah" IS NOT NULL
    AND "to_surah" IS NOT NULL AND "to_ayah" IS NOT NULL
  ) OR (
    "board" IS NOT NULL AND "board_lesson" IS NOT NULL
    AND "from_surah" IS NULL AND "from_ayah" IS NULL
    AND "to_surah" IS NULL AND "to_ayah" IS NULL
  )
);

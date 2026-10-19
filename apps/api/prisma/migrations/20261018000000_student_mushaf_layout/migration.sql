-- M8 — a per-child Mushaf layout.
--
-- Page numbers are layout-specific: "page 42" is a different part of the Quran in the
-- 13-line Indo-Pak than in the 15-line Madani. Until this column existed the layout lived
-- only on the class session, so a child taught from two layouts could not be described
-- outside a lesson, and the portal had nowhere to show which one a child follows.
--
-- NOT NULL with a default: every existing child is taught from the 15-line Madani, which
-- is what an absent value has always meant.
ALTER TABLE "student"
    ADD COLUMN "mushaf_layout" "MushafLayout" NOT NULL DEFAULT 'MADANI_15';
-- Point 2 of the Oct 2026 feature set: marketing wants to see leads by geographic area.
-- Adds optional location fields to `lead` for area roll-ups (M-GEO-01).

-- AlterTable
ALTER TABLE "lead" ADD COLUMN "region" VARCHAR(120),
ADD COLUMN "city" VARCHAR(120),
ADD COLUMN "postcode" VARCHAR(20),
ADD COLUMN "lat" DECIMAL(9,6),
ADD COLUMN "lng" DECIMAL(9,6);

-- CreateIndex
CREATE INDEX "lead_country_region_idx" ON "lead"("country", "region");

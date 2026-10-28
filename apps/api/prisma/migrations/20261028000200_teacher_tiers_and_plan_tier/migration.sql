-- Points 4 and 5 of the Oct 2026 feature set: admin-maintained teacher qualification
-- tiers (with a public badge), and a `Plan` promising a tier instead of a price on the
-- public listing. Checkout keeps reading `plan_price` unchanged.

-- CreateTable
CREATE TABLE "teacher_tier" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "badge_icon" VARCHAR(120),
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_tier_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "teacher_profile" ADD COLUMN "tier_id" UUID;

-- AlterTable
ALTER TABLE "plan" ADD COLUMN "tier_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "teacher_tier_code_key" ON "teacher_tier"("code");

-- CreateIndex
CREATE INDEX "teacher_profile_tier_id_idx" ON "teacher_profile"("tier_id");

-- CreateIndex
CREATE INDEX "plan_tier_id_idx" ON "plan"("tier_id");

-- AddForeignKey
ALTER TABLE "teacher_profile" ADD CONSTRAINT "teacher_profile_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "teacher_tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "teacher_tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

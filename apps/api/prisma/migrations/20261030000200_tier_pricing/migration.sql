-- Tier pricing (FR-TCH-10, FR-OPS-05): a plan's price can depend on the teacher's tier.
-- Without a tier row the plan's standard price (`plan_price`) applies. A subscription
-- remembers the tier it is charged for.

-- CreateTable
CREATE TABLE "plan_tier_price" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "tier_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_tier_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_tier_price_plan_id_tier_id_currency_key" ON "plan_tier_price"("plan_id", "tier_id", "currency");

-- AddForeignKey
ALTER TABLE "plan_tier_price" ADD CONSTRAINT "plan_tier_price_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_tier_price" ADD CONSTRAINT "plan_tier_price_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "teacher_tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN "tier_id" UUID;

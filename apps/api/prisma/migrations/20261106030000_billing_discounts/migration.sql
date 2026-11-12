-- Prepaid plans: a percentage off the monthly price × months. `plan_price` stays the monthly
-- price for every plan; existing plans get 0, so nothing already sold changes.
ALTER TABLE "plan" ADD COLUMN "period_discount_percent" INTEGER NOT NULL DEFAULT 0;

-- How a subscription's locked price was reached (period, sibling, promo), for the invoice view.
ALTER TABLE "subscription" ADD COLUMN "discount_breakdown" JSONB;

-- Stripe's refund id, so a refund webhook is deduplicated on it rather than on amounts.
ALTER TABLE "refund" ADD COLUMN "provider_refund_id" VARCHAR(255);
CREATE UNIQUE INDEX "refund_provider_refund_id_key" ON "refund"("provider_refund_id");

CREATE TABLE "promo_code" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "percent_off" INTEGER,
    "amount_off_minor" INTEGER,
    "currency" "Currency",
    "max_redemptions" INTEGER,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "applies_to_plan_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promo_code_pkey" PRIMARY KEY ("id"),
    -- One kind of discount per code: a percentage, or an amount in one currency.
    CONSTRAINT "promo_code_one_discount" CHECK (
        ("percent_off" IS NOT NULL AND "amount_off_minor" IS NULL AND "currency" IS NULL)
        OR ("percent_off" IS NULL AND "amount_off_minor" IS NOT NULL AND "currency" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "promo_code_code_key" ON "promo_code"("code");

CREATE TABLE "promo_redemption" (
    "id" UUID NOT NULL,
    "promo_code_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "discount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promo_redemption_subscription_id_key" ON "promo_redemption"("subscription_id");
CREATE UNIQUE INDEX "promo_redemption_promo_code_id_family_id_key" ON "promo_redemption"("promo_code_id", "family_id");
CREATE INDEX "promo_redemption_family_id_idx" ON "promo_redemption"("family_id");

ALTER TABLE "promo_redemption" ADD CONSTRAINT "promo_redemption_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_code"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promo_redemption" ADD CONSTRAINT "promo_redemption_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promo_redemption" ADD CONSTRAINT "promo_redemption_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `plan_price` now means the monthly price on every plan. Subscriptions on a prepaid plan
-- that never had their price locked would otherwise be re-priced at monthly × months, so
-- they are locked at the price they have been billed until now.
UPDATE "subscription" s
SET "amount_minor" = COALESCE(
  (SELECT tp."amount_minor" FROM "plan_tier_price" tp
    WHERE tp."plan_id" = s."plan_id" AND tp."tier_id" = s."tier_id" AND tp."currency" = s."currency"),
  (SELECT pp."amount_minor" FROM "plan_price" pp
    WHERE pp."plan_id" = s."plan_id" AND pp."currency" = s."currency")
)
FROM "plan" p
WHERE s."plan_id" = p."id"
  AND s."amount_minor" IS NULL
  AND p."billing_period" <> 'MONTHLY';

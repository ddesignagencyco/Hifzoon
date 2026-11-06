-- USD only (owner decision, Nov 2026): every price is set in USD and every family is billed
-- in USD; Stripe Adaptive Pricing shows the family their local currency at checkout.
--
-- Safe to run more than once. Subscriptions, invoices, payments and refunds sold in another
-- currency are history and keep their own currency. Payroll (pay_rate) is teacher pay and
-- is not touched.

-- 1. Prices in other currencies are no longer used.
DELETE FROM "plan_tier_price" WHERE "currency" <> 'USD';
DELETE FROM "plan_price" WHERE "currency" <> 'USD';

-- 2. New prices default to USD, and only USD can be stored.
ALTER TABLE "plan_price" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "plan_tier_price" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "plan_price" DROP CONSTRAINT IF EXISTS "plan_price_currency_usd";
ALTER TABLE "plan_price" ADD CONSTRAINT "plan_price_currency_usd" CHECK ("currency" = 'USD');
ALTER TABLE "plan_tier_price" DROP CONSTRAINT IF EXISTS "plan_tier_price_currency_usd";
ALTER TABLE "plan_tier_price" ADD CONSTRAINT "plan_tier_price_currency_usd" CHECK ("currency" = 'USD');

-- 3. Every family is billed in USD. The column stays (default USD) for older rows and reports.
UPDATE "family" SET "currency" = 'USD' WHERE "currency" <> 'USD';

-- 4. A checkout that was started but never paid has no invoices or provider subscription;
--    it is restarted in USD, so it is not left labelled with a currency nothing is priced in.
UPDATE "subscription"
   SET "currency" = 'USD', "amount_minor" = NULL, "discount_breakdown" = NULL
 WHERE "status" = 'INCOMPLETE'
   AND "currency" <> 'USD'
   AND "provider_subscription_id" IS NULL
   AND NOT EXISTS (SELECT 1 FROM "invoice" i WHERE i."subscription_id" = "subscription"."id");

-- 5. An amount-off promo code in another currency can no longer match any new subscription;
--    it is switched off rather than relabelled (10 GBP off is not 10 USD off).
UPDATE "promo_code" SET "active" = false
 WHERE "amount_off_minor" IS NOT NULL AND "currency" <> 'USD' AND "active";

-- 6. The unused academy-wide currency setting now says what is true.
UPDATE "app_setting" SET "value" = '"USD"'::jsonb WHERE "key" = 'billing.currency';

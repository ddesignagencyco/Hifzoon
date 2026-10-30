-- Recurring billing moves to the payment provider (FR-BIL-01/02/03): the family enters a
-- card once in the provider's hosted checkout after the trial, and the provider charges
-- every period. A subscription is INCOMPLETE until that first payment, carries the setup
-- to apply when it lands, and provider-issued invoices are mirrored by their provider id.

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'INCOMPLETE' BEFORE 'TRIALING';

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN "setup" JSONB;

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN "provider_invoice_id" VARCHAR(255),
ADD COLUMN "hosted_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoice_provider_invoice_id_key" ON "invoice"("provider_invoice_id");

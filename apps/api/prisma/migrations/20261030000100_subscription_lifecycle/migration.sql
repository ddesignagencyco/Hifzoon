-- Subscription lifecycle: downgrades wait for the paid period to end, provider state is
-- applied in order, and each provider webhook event is applied once.

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN "pending_plan_id" UUID,
ADD COLUMN "pending_plan_from" TIMESTAMPTZ(6),
ADD COLUMN "provider_synced_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "processed_webhook_event" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_event_provider_event_id_key" ON "processed_webhook_event"("provider", "event_id");

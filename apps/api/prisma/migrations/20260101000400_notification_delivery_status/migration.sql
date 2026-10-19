-- WhatsApp delivery reconciliation (FR-NTF-03, IR-SW-05).
--
-- The send path now records the id the provider returned, and the inbound
-- `/webhooks/whatsapp` addresses messages by it. Two new statuses are needed because
-- a 200 from the WhatsApp API only means "accepted for delivery" — confirmed delivery
-- and read receipts arrive asynchronously, minutes later, and are the only evidence
-- that a parent actually got the message about their child's class.

-- New enum values. Each in its own statement: PostgreSQL cannot use a value added in
-- the same transaction until the transaction commits, and an index built over them
-- immediately afterwards would fail.
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'READ';

ALTER TABLE "notification"
  ADD COLUMN IF NOT EXISTS "provider_message_id" VARCHAR(255);

-- Non-unique on purpose. A provider message id is globally unique in practice, but
-- nothing in our own schema guarantees it, and a duplicate would break delivery
-- reporting for both rows. The index exists because the webhook looks messages up by
-- exactly this column on every inbound event; without it that is a sequential scan of
-- a table that grows by every notification ever sent.
CREATE INDEX IF NOT EXISTS "notification_provider_message_id_idx"
  ON "notification"("provider_message_id");
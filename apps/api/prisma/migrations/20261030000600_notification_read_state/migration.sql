-- M59 — read state for the notification centre.
ALTER TABLE "notification" ADD COLUMN "read_at" TIMESTAMPTZ(6);
CREATE INDEX "notification_user_id_read_at_idx" ON "notification"("user_id", "read_at");

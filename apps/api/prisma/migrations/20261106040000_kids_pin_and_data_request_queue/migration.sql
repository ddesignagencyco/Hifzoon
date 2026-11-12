-- Kids PIN sign-in: a per-child lockout after repeated wrong PINs.
ALTER TABLE "kids_credential" ADD COLUMN "failed_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "kids_credential" ADD COLUMN "locked_until" TIMESTAMPTZ(6);

-- Data request queue: the reason an admin refused a request, and when admins were last
-- warned that its deadline is close (the daily check warns once per request per day).
ALTER TABLE "data_request" ADD COLUMN "rejection_reason" TEXT;
ALTER TABLE "data_request" ADD COLUMN "sla_notified_at" TIMESTAMPTZ(6);

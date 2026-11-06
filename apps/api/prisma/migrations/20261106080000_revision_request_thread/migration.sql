-- Revision requests are posted into the family-teacher message thread.
ALTER TABLE "revision_request" ADD COLUMN "thread_id" UUID;

CREATE INDEX "revision_request_thread_id_status_idx" ON "revision_request"("thread_id", "status");

-- Idempotency keys for manually issued invoices and refunds.
ALTER TABLE "invoice" ADD COLUMN "idempotency_key" VARCHAR(255);
ALTER TABLE "refund" ADD COLUMN "idempotency_key" VARCHAR(255);
CREATE UNIQUE INDEX "invoice_idempotency_key_key" ON "invoice"("idempotency_key");
CREATE UNIQUE INDEX "refund_idempotency_key_key" ON "refund"("idempotency_key");

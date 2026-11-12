-- Manual payroll deductions (with a reason) and idempotent class-credit issuing.
ALTER TYPE "PayrollLineKind" ADD VALUE IF NOT EXISTS 'DEDUCTION_MANUAL';
ALTER TABLE "class_credit" ADD COLUMN "idempotency_key" VARCHAR(255);
CREATE UNIQUE INDEX "class_credit_idempotency_key_key" ON "class_credit"("idempotency_key");

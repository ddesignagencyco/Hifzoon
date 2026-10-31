-- M28 — case severity. Safeguarding cases start HIGH, complaints MEDIUM.
CREATE TYPE "CaseSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
ALTER TABLE "case_record" ADD COLUMN "severity" "CaseSeverity" NOT NULL DEFAULT 'MEDIUM';
UPDATE "case_record" SET "severity" = 'HIGH' WHERE "type" = 'SAFEGUARDING';
CREATE INDEX "case_record_severity_idx" ON "case_record"("severity");

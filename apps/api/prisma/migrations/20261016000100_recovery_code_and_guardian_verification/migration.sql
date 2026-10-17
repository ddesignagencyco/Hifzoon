-- Adds the two tables that exist in schema.prisma but never received a migration:
--   recovery_code        — one-time 2FA backup codes (FR-AUTH-01)
--   guardian_verification — short-lived codes proving a secondary guardian belongs to a family
--
-- Both were created after the initial migration and were missed, so the endpoints
-- that touch them failed with Prisma P2021 ("The table public.<name> does not exist").

-- CreateTable
CREATE TABLE "recovery_code" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_verification" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "primary_user_id" UUID NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_code_user_id_used_at_idx" ON "recovery_code"("user_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_code_user_id_code_hash_key" ON "recovery_code"("user_id", "code_hash");

-- CreateIndex
CREATE INDEX "guardian_verification_family_id_target_user_id_idx" ON "guardian_verification"("family_id", "target_user_id");

-- CreateIndex
CREATE INDEX "guardian_verification_expires_at_idx" ON "guardian_verification"("expires_at");

-- AddForeignKey
ALTER TABLE "recovery_code" ADD CONSTRAINT "recovery_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Overrides of the default role-permission matrix. Only changes are stored.
CREATE TABLE "permission_override" (
    "role" "Role" NOT NULL,
    "permission" VARCHAR(80) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_override_pkey" PRIMARY KEY ("role","permission")
);

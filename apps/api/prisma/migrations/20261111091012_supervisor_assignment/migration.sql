-- FR-QA: which teachers a supervisor oversees. A supervisor's reach (QA, lesson cards,
-- complaint cases, student and class access) is limited to these teachers.

-- CreateTable
CREATE TABLE "supervisor_assignment" (
    "id" UUID NOT NULL,
    "supervisor_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supervisor_assignment_teacher_id_idx" ON "supervisor_assignment"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_assignment_supervisor_id_teacher_id_key" ON "supervisor_assignment"("supervisor_id", "teacher_id");

-- AddForeignKey
ALTER TABLE "supervisor_assignment" ADD CONSTRAINT "supervisor_assignment_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignment" ADD CONSTRAINT "supervisor_assignment_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep today's behaviour on day one: every existing supervisor oversees every existing
-- teacher. Admins then trim the list. Without this, supervisors would see nothing the
-- moment scoping is switched on.
INSERT INTO "supervisor_assignment" ("id", "supervisor_id", "teacher_id")
SELECT gen_random_uuid(), ur."user_id", tp."id"
FROM "user_role" ur
CROSS JOIN "teacher_profile" tp
WHERE ur."role" = 'SUPERVISOR'
ON CONFLICT DO NOTHING;

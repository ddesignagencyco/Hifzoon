-- Point 1 of the Oct 2026 feature set: a teacher sets availability and leave (off days)
-- once per month. `teacher_leave` is the declared off-day; `teacher_availability_month`
-- is pure submission-tracking state so the UI can show which months are already set.

-- CreateTable
CREATE TABLE "teacher_leave" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_availability_month" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_availability_month_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_leave_teacher_id_date_idx" ON "teacher_leave"("teacher_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_leave_teacher_id_date_key" ON "teacher_leave"("teacher_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_availability_month_teacher_id_month_key" ON "teacher_availability_month"("teacher_id", "month");

-- AddForeignKey
ALTER TABLE "teacher_leave" ADD CONSTRAINT "teacher_leave_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_availability_month" ADD CONSTRAINT "teacher_availability_month_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

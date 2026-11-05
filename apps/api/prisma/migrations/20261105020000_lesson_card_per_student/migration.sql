-- A circle class has several students, and each needs their own lesson card.
DROP INDEX IF EXISTS "lesson_card_class_id_key";
CREATE UNIQUE INDEX "lesson_card_class_id_student_id_key" ON "lesson_card"("class_id", "student_id");

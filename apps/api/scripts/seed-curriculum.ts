/**
 * Replaces the placeholder lesson plan ("Beginner — lesson 1", empty Duas levels) with a real
 * starter curriculum for Qaida, Nazra, Hifz and Duas. The content lives in
 * src/modules/courses/curriculum-seed.ts.
 *
 * TEACHERS SHOULD REVIEW THE RESULT. It is a first draft; refine it under Admin → Courses.
 *
 * Safe to run anywhere, including production, and as often as you like:
 *   - only lessons whose title still ends in "— lesson <n>" are renamed (title, objectives,
 *     materials; teacher notes are kept);
 *   - lessons are added only to levels that are empty or still entirely placeholders;
 *   - levels are matched by course type and their original name, so a renamed level is skipped;
 *   - nothing is deleted and no position changes, so every enrolment keeps its lesson;
 *   - the seed's placeholder material ({ workbook: "Noorani Qaida page 1" }) is cleared from
 *     lessons that carry a planned title; any other material is kept.
 * A second run prints "no changes".
 *
 *   docker compose exec -T api npx ts-node --transpile-only scripts/seed-curriculum.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

import { curriculumPlan, type DuaChapter, planLevel } from '../src/modules/courses/curriculum-seed';

const DRY_RUN = process.argv.includes('--dry-run');

/** The one material value prisma/seed.ts put on every placeholder lesson. */
function isPlaceholderMaterials(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    entries.length === 1 && entries[0][0] === 'workbook' && entries[0][1] === 'Noorani Qaida page 1'
  );
}
const prisma = new PrismaClient();

async function main() {
  const file = join(__dirname, '..', 'src', 'content', 'duas', 'hisn-al-muslim.json');
  const chapters = (JSON.parse(readFileSync(file, 'utf8')) as { categories: DuaChapter[] })
    .categories;
  const { plan, missing } = curriculumPlan(chapters);
  for (const title of missing)
    console.warn(`! Hisn al-Muslim has no chapter titled "${title}"; skipped`);

  let renamed = 0;
  let created = 0;
  let cleared = 0;
  console.log(DRY_RUN ? 'Dry run: nothing will be written.\n' : '');

  for (const [type, levels] of Object.entries(plan)) {
    const courses = await prisma.course.findMany({
      where: { type: type as never, locale: 'en' },
      select: {
        id: true,
        code: true,
        levels: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            lessonTemplates: { select: { id: true, position: true, title: true, materials: true } },
          },
        },
      },
    });
    for (const course of courses) {
      for (const level of course.levels) {
        const planned = levels[level.name.trim().toLowerCase()];
        if (!planned) {
          console.log(
            `- ${course.code} / ${level.name}: no planned lessons for this level name; left alone`,
          );
          continue;
        }
        // The original seed gave every lesson of every course the same placeholder material.
        // Clear exactly that value (nothing an admin typed) from lessons the plan defines.
        const plannedTitles = new Set(planned.map((l) => l.title));
        const stale = level.lessonTemplates.filter(
          (l) => plannedTitles.has(l.title) && isPlaceholderMaterials(l.materials),
        );
        if (stale.length) {
          console.log(
            `* ${course.code} / ${level.name}: clear placeholder materials on ${stale.length} lesson(s)`,
          );
          if (!DRY_RUN) {
            for (const l of stale) {
              const planMaterials = planned.find((p) => p.title === l.title)?.materials;
              const result = await prisma.lessonTemplate.updateMany({
                where: { id: l.id, title: l.title },
                data: { materials: planMaterials ?? Prisma.DbNull },
              });
              cleared += result.count;
            }
          }
        }

        const { changes, leftAlone } = planLevel(level.lessonTemplates, planned);
        if (changes.length === 0) {
          console.log(`- ${course.code} / ${level.name}: no changes`);
          continue;
        }
        console.log(`* ${course.code} / ${level.name}:`);
        for (const change of changes) {
          console.log(
            change.kind === 'rename'
              ? `    rename lesson ${change.position}: "${change.from}" -> "${change.lesson.title}"`
              : `    add    lesson ${change.position}: "${change.lesson.title}"`,
          );
        }
        if (leftAlone)
          console.log(`    (${leftAlone} placeholder lesson(s) beyond the plan left as they are)`);
        if (DRY_RUN) continue;

        await prisma.$transaction(
          async (tx) => {
            for (const change of changes) {
              const data = {
                title: change.lesson.title,
                objectives: change.lesson.objectives ?? undefined,
                // No planned materials: drop the seed's placeholder rather than keep it.
                materials: change.lesson.materials ?? Prisma.DbNull,
              };
              if (change.kind === 'rename') {
                // Re-checked inside the transaction: never overwrite a title edited meanwhile.
                const result = await tx.lessonTemplate.updateMany({
                  where: { id: change.id, title: change.from },
                  data,
                });
                renamed += result.count;
              } else {
                await tx.lessonTemplate.create({
                  data: { levelId: level.id, position: change.position, ...data },
                });
                created += 1;
              }
            }
            // A slow or busy database (e.g. a small production instance) must not abort a level half-way.
          },
          { timeout: 60_000, maxWait: 20_000 },
        );
      }
    }
  }

  console.log(
    DRY_RUN
      ? '\nDry run finished.'
      : renamed + created + cleared === 0
        ? '\nDone: no changes.'
        : `\nDone: ${renamed} lesson(s) renamed, ${created} lesson(s) added, placeholder materials cleared on ${cleared}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { curriculumPlan, type DuaChapter, planLevel, PLACEHOLDER_TITLE } from './curriculum-seed';

const chapters = (
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'content', 'duas', 'hisn-al-muslim.json'), 'utf8'),
  ) as { categories: DuaChapter[] }
).categories;

const planned = [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }];

describe('curriculum seed plan', () => {
  it('matches every planned dua lesson to a real Hisn al-Muslim chapter', () => {
    const { plan, missing } = curriculumPlan(chapters);
    expect(missing).toEqual([]);
    expect(Object.keys(plan.DUAS)).toEqual(['daily duas', 'duas of salah', 'occasions & travel']);
    expect(plan.DUAS['daily duas'][0].title).toBe('Supplications for when you wake up');
  });

  it('spreads the 17 Qaida lessons over the four levels in order', () => {
    const { plan } = curriculumPlan(chapters);
    const all = Object.values(plan.QAIDA)
      .flat()
      .map((l) => l.title);
    expect(all).toHaveLength(17);
    expect(all[0]).toBe('Qaida 1: Huroof mufradat (single letters)');
    expect(all[16]).toBe('Qaida 17: Letters written but not read');
  });

  it('never produces a title that looks like a placeholder', () => {
    const { plan } = curriculumPlan(chapters);
    const titles = Object.values(plan).flatMap((levels) =>
      Object.values(levels)
        .flat()
        .map((l) => l.title),
    );
    expect(titles.filter((t) => PLACEHOLDER_TITLE.test(t))).toEqual([]);
  });
});

describe('planLevel', () => {
  it('renames placeholders and adds the rest when the level is all placeholders', () => {
    const { changes } = planLevel(
      [
        { id: 'x', position: 1, title: 'Beginner — lesson 1' },
        { id: 'y', position: 2, title: 'Beginner — lesson 2' },
      ],
      planned,
    );
    expect(changes.map((c) => [c.kind, c.position, c.lesson.title])).toEqual([
      ['rename', 1, 'One'],
      ['rename', 2, 'Two'],
      ['create', 3, 'Three'],
    ]);
  });

  it('fills an empty level', () => {
    expect(planLevel([], planned).changes.map((c) => c.kind)).toEqual([
      'create',
      'create',
      'create',
    ]);
  });

  it("keeps the owner's edits and does not grow a level the owner has touched", () => {
    const { changes } = planLevel(
      [
        { id: 'x', position: 1, title: 'My own lesson' },
        { id: 'y', position: 2, title: 'Beginner — lesson 2' },
      ],
      planned,
    );
    expect(changes).toEqual([
      { kind: 'rename', id: 'y', position: 2, from: 'Beginner — lesson 2', lesson: planned[1] },
    ]);
  });

  it('is idempotent: a seeded level plans no changes', () => {
    const seeded = planned.map((l, i) => ({ id: `s${i}`, position: i + 1, title: l.title }));
    expect(planLevel(seeded, planned).changes).toEqual([]);
  });
});

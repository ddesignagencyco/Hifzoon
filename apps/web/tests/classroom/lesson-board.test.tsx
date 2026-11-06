// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LessonBoard } from '@/components/classroom/LessonBoard';
import { chooseOption, optionLabels } from '../helpers/render';
import { duasApi, type DuaCollection } from '@/lib/api/modules/duas';
import {
  QAIDA_LESSONS,
  QAIDA_LETTERS,
  boardForCourse,
  boardLessonTitle,
  describeBoardItem,
} from '@/lib/data/lesson-boards';

afterEach(cleanup);

/** A two-chapter stand-in for GET /content/duas (the real data is Hisn al-Muslim). */
const DUAS: DuaCollection = {
  source: {
    name: 'Hisn al-Muslim',
    author: 'al-Qahtani',
    url: 'https://www.hisnmuslim.com/api/husn.json',
    languages: ['ar', 'en'],
    importedAt: '2026-11-06',
  },
  categories: [
    {
      id: 1,
      title: 'Supplications for when you wake up',
      titleAr: 'أذكار الاستيقاظ من النوم',
      duas: [
        {
          id: 1,
          title: 'Supplications for when you wake up (1)',
          arabic: 'الْحَمْدُ للَّهِ الَّذِي أَحْيَانَا',
          transliteration: 'Alhamdu lillahil-lathee ahyana',
          translation: { en: 'All praise is for Allah who gave us life' },
          repeat: 1,
          reference: 'Hisn al-Muslim 1',
        },
        {
          id: 2,
          title: 'Supplications for when you wake up (2)',
          arabic: 'لاَ إِلَهَ إِلاَّ اللَّهُ',
          transliteration: 'La ilaha illal-lah',
          translation: { en: 'None has the right to be worshipped except Allah' },
          repeat: 1,
          reference: 'Hisn al-Muslim 2',
        },
      ],
    },
    {
      id: 2,
      title: 'Invocation when getting dressed',
      titleAr: 'دعاء لبس الثوب',
      duas: [
        {
          id: 5,
          title: 'Invocation when getting dressed',
          arabic: 'الْحَمْدُ لِلَّهِ الَّذِي كَسَانِي هَذَا',
          transliteration: 'Alhamdu lillahil-lathee kasanee hatha',
          translation: { en: 'All Praise is for Allah who has clothed me with this garment' },
          repeat: 3,
          reference: 'Hisn al-Muslim 5',
        },
      ],
    },
  ],
};

function renderBoard(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('Qaida board', () => {
  it('picks the board from the course: Qaida and Duas have their own, the rest use the Mushaf', () => {
    expect(boardForCourse('QAIDA')).toBe('QAIDA');
    expect(boardForCourse('DUAS')).toBe('DUAS');
    expect(boardForCourse('HIFZ')).toBeNull();
    expect(boardForCourse(undefined)).toBeNull();
  });

  it('has the 17 Noorani Qaida lessons, each with an aim and items', () => {
    expect(QAIDA_LESSONS).toHaveLength(17);
    expect(QAIDA_LESSONS[0].items).toEqual(QAIDA_LETTERS);
    expect(QAIDA_LETTERS).toHaveLength(29);
    for (const l of QAIDA_LESSONS) {
      expect(l.title).toBeTruthy();
      expect(l.aim).toBeTruthy();
      expect(l.items.length).toBeGreaterThan(0);
      expect(l.items.length).toBeLessThanOrEqual(90);
      if (l.refs) expect(l.refs).toHaveLength(l.items.length);
      for (const item of l.items) expect(item).toMatch(/^[؀-ۿ ]+$/);
    }
  });

  it('builds the harakat drill from every letter with fatha, kasra and damma', () => {
    const harakat = QAIDA_LESSONS[3].items;
    expect(harakat.slice(0, 3)).toEqual(['بَ', 'بِ', 'بُ']);
    expect(harakat).toHaveLength(28 * 3);
    expect(QAIDA_LESSONS[7].items.slice(0, 3)).toEqual(['بَا', 'بِيْ', 'بُوْ']);
    const nfc = (list: string[]) => list.map((t) => t.normalize('NFC'));
    expect(nfc(QAIDA_LESSONS[10].items.slice(0, 3))).toEqual(nfc(['اَبَّ', 'اِبِّ', 'اُبُّ']));
  });

  it('lets the teacher open a Qaida item for the class', async () => {
    const onSelect = vi.fn();
    renderBoard(
      <LessonBoard
        board="QAIDA"
        position={null}
        isTeacher
        onSelect={onSelect}
        meaningLanguage="en"
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Item 3' }));
    expect(onSelect).toHaveBeenCalledWith({ board: 'QAIDA', lesson: 1, item: 2 });
    expect(screen.getByText(QAIDA_LESSONS[0].items[2])).toBeTruthy();
  });

  it('moves between the 17 lessons with the dropdown and next/previous', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderBoard(
      <LessonBoard
        board="QAIDA"
        position={{ board: 'QAIDA', lesson: 5, item: null }}
        isTeacher
        onSelect={onSelect}
        meaningLanguage="en"
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Qaida lessons' });
    expect(await optionLabels(select)).toHaveLength(17);
    expect(screen.getByText(/^5\. /)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next lesson' }));
    expect(onSelect).toHaveBeenLastCalledWith({ board: 'QAIDA', lesson: 6, item: null });
    await user.click(screen.getByRole('button', { name: 'Previous lesson' }));
    expect(onSelect).toHaveBeenLastCalledWith({ board: 'QAIDA', lesson: 4, item: null });
    await chooseOption(select, /^17\. /);
    expect(onSelect).toHaveBeenLastCalledWith({ board: 'QAIDA', lesson: 17, item: null });
  });

  it('shows the surah:ayah under word items', () => {
    renderBoard(
      <LessonBoard
        board="QAIDA"
        position={{ board: 'QAIDA', lesson: 14, item: null }}
        isTeacher={false}
        onSelect={() => {}}
        meaningLanguage="en"
      />,
    );
    expect(screen.getByText('قَدَّمْتُ')).toBeTruthy();
    expect(screen.getByText('89:24')).toBeTruthy();
  });
});

describe('Duas board (Hisn al-Muslim from the API)', () => {
  beforeEach(() => {
    vi.spyOn(duasApi, 'list').mockResolvedValue(DUAS);
  });

  it('shows students the dua the teacher opened, without letting them change it', async () => {
    const onSelect = vi.fn();
    renderBoard(
      <LessonBoard
        board="DUAS"
        position={{ board: 'DUAS', lesson: 1, item: 1 }}
        isTeacher={false}
        onSelect={onSelect}
        meaningLanguage="en"
      />,
    );
    const dua = DUAS.categories[0].duas[1];
    expect((await screen.findAllByText(dua.arabic)).length).toBeGreaterThan(0);
    expect(screen.getByText(dua.translation.en!)).toBeTruthy();
    expect(screen.getByText(dua.transliteration)).toBeTruthy();
    expect(screen.getByText('Hisn al-Muslim 2')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    for (const button of screen.getAllByRole('button'))
      expect((button as HTMLButtonElement).disabled).toBe(true);
    for (const box of screen.queryAllByRole('combobox')) expect((box as HTMLInputElement).disabled).toBe(true);
  });

  it('syncs the chapter (1-based) and the dua index when the teacher picks one', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderBoard(
      <LessonBoard
        board="DUAS"
        position={null}
        isTeacher
        onSelect={onSelect}
        meaningLanguage="en"
      />,
    );
    const select = await screen.findByRole('combobox', { name: 'Dua chapters' });
    expect(await optionLabels(select)).toEqual([
      '1. Supplications for when you wake up',
      '2. Invocation when getting dressed',
    ]);
    await user.click(screen.getByRole('button', { name: /^2\./ }));
    expect(onSelect).toHaveBeenLastCalledWith({ board: 'DUAS', lesson: 1, item: 1 });
    await user.click(screen.getByRole('button', { name: 'Next lesson' }));
    expect(onSelect).toHaveBeenLastCalledWith({ board: 'DUAS', lesson: 2, item: null });
  });

  it('finds a dua by name across chapters', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderBoard(
      <LessonBoard
        board="DUAS"
        position={null}
        isTeacher
        onSelect={onSelect}
        meaningLanguage="en"
      />,
    );
    await user.type(await screen.findByRole('searchbox', { name: 'Search duas' }), 'dressed');
    const results = screen.getByRole('listbox', { name: 'Matching duas' });
    await user.click(
      within(results).getByRole('option', { name: /Invocation when getting dressed/ }),
    );
    expect(onSelect).toHaveBeenLastCalledWith({ board: 'DUAS', lesson: 2, item: 0 });
  });

  it('says so and shows English when Urdu is chosen, as the source has no Urdu', async () => {
    renderBoard(
      <LessonBoard
        board="DUAS"
        position={{ board: 'DUAS', lesson: 2, item: 0 }}
        isTeacher={false}
        onSelect={() => {}}
        meaningLanguage="ur"
      />,
    );
    const meaning = await screen.findByText(DUAS.categories[1].duas[0].translation.en!);
    expect(meaning.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(/no Urdu meanings/)).toBeTruthy();
    expect(screen.getByText(/say 3 times/)).toBeTruthy();
  });

  it('offers a retry when the duas cannot be loaded', async () => {
    vi.spyOn(duasApi, 'list').mockRejectedValue(new Error('down'));
    renderBoard(
      <LessonBoard
        board="DUAS"
        position={null}
        isTeacher
        onSelect={() => {}}
        meaningLanguage="en"
      />,
    );
    await waitFor(() => expect(screen.getByText('The duas could not be loaded.')).toBeTruthy());
  });
});

describe('board titles for the classroom header and the lesson card', () => {
  it('describes the Qaida item on screen', () => {
    expect(describeBoardItem({ board: 'QAIDA', lesson: 1, item: 2 }, undefined)).toBe(
      `${QAIDA_LESSONS[0].title}: ت`,
    );
    expect(describeBoardItem({ board: 'QAIDA', lesson: 4, item: null }, undefined)).toBe(
      QAIDA_LESSONS[3].title,
    );
    expect(describeBoardItem({ board: 'QAIDA', lesson: 99, item: null }, undefined)).toBeNull();
    expect(describeBoardItem(null, undefined)).toBeNull();
  });

  it('describes the dua on screen from the API chapters', () => {
    expect(describeBoardItem({ board: 'DUAS', lesson: 1, item: 1 }, DUAS.categories)).toBe(
      'Supplications for when you wake up (2)',
    );
    expect(describeBoardItem({ board: 'DUAS', lesson: 2, item: null }, DUAS.categories)).toBe(
      'Invocation when getting dressed',
    );
    expect(describeBoardItem({ board: 'DUAS', lesson: 1, item: 0 }, undefined)).toBeNull();
  });

  it('gives lesson titles for the lesson card prefill', () => {
    expect(boardLessonTitle('QAIDA', 17, undefined)).toBe('Letters written but not read');
    expect(boardLessonTitle('DUAS', 2, DUAS.categories)).toBe('Invocation when getting dressed');
    expect(boardLessonTitle('DUAS', 3, DUAS.categories)).toBeUndefined();
  });
});

describe('shared word and mistake marks on the board', () => {
  beforeEach(() => {
    vi.spyOn(duasApi, 'list').mockResolvedValue(DUAS);
  });

  it('the family board highlights the dua word the teacher points at, and underlines logged ones', async () => {
    renderBoard(
      <LessonBoard
        board="DUAS"
        position={{ board: 'DUAS', lesson: 1, item: 0 }}
        isTeacher={false}
        onSelect={vi.fn()}
        meaningLanguage="en"
        selectedWord={4}
        marks={[
          { lesson: 1, item: 0, word: 2, fixed: false },
          { lesson: 1, item: 0, word: 1, fixed: true },
          { lesson: 1, item: 1, word: 4, fixed: false },
        ]}
      />,
    );
    const current = await screen.findByText('أَحْيَانَا');
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('للَّهِ').getAttribute('data-mark')).toBe('open');
    expect(screen.getByText('للَّهِ').className).toContain('decoration-red');
    expect(screen.getByText('الْحَمْدُ').getAttribute('data-mark')).toBe('fixed');
    // A mark on another dua of the chapter is not drawn on this one.
    expect(current.getAttribute('data-mark')).toBeNull();
  });

  it('the teacher board marks words too, and an earlier open mistake is drawn lighter', async () => {
    renderBoard(
      <LessonBoard
        board="DUAS"
        position={{ board: 'DUAS', lesson: 1, item: 0 }}
        isTeacher
        onSelect={vi.fn()}
        meaningLanguage="en"
        onPickWord={vi.fn()}
        marks={[{ lesson: 1, item: 0, word: 4, fixed: false, earlier: true }]}
      />,
    );
    const word = await screen.findByRole('button', { name: /^Word 4: أَحْيَانَا/ });
    expect(word.getAttribute('data-mark')).toBe('earlier');
    expect(word.getAttribute('aria-label')).toContain('open mistake from an earlier class');
  });

  it('a Qaida tile with a mistake is underlined', () => {
    renderBoard(
      <LessonBoard
        board="QAIDA"
        position={{ board: 'QAIDA', lesson: 1, item: 2 }}
        isTeacher={false}
        onSelect={vi.fn()}
        meaningLanguage={null}
        marks={[{ lesson: 1, item: 4, word: null, fixed: false }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Item 5, mistake logged' }).getAttribute('data-mark')).toBe('open');
    expect(screen.getByRole('button', { name: 'Item 3' }).getAttribute('aria-pressed')).toBe('true');
  });
});

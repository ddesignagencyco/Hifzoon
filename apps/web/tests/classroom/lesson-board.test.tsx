// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonBoard } from '@/components/classroom/LessonBoard';
import { DUA_LESSONS, QAIDA_LESSONS, boardForCourse } from '@/lib/data/lesson-boards';

afterEach(cleanup);

describe('Qaida and Duas boards in the classroom', () => {
  it('picks the board from the course: Qaida and Duas have their own, the rest use the Mushaf', () => {
    expect(boardForCourse('QAIDA')).toBe('QAIDA');
    expect(boardForCourse('DUAS')).toBe('DUAS');
    expect(boardForCourse('HIFZ')).toBeNull();
    expect(boardForCourse(undefined)).toBeNull();
  });

  it('lets the teacher open a Qaida item for the class', async () => {
    const onSelect = vi.fn();
    render(<LessonBoard board="QAIDA" position={null} isTeacher onSelect={onSelect} meaningLanguage="en" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Item 3' }));
    expect(onSelect).toHaveBeenCalledWith({ board: 'QAIDA', lesson: 1, item: 2 });
    expect(screen.getByText(QAIDA_LESSONS[0].items[2])).toBeTruthy();
  });

  it('shows students what the teacher opened, without letting them change it', () => {
    const onSelect = vi.fn();
    render(
      <LessonBoard board="DUAS" position={{ board: 'DUAS', lesson: 1, item: 3 }} isTeacher={false} onSelect={onSelect} meaningLanguage="en" />,
    );
    const dua = DUA_LESSONS[0].items[3];
    expect(screen.getAllByText(dua.arabic).length).toBeGreaterThan(0);
    expect(screen.getByText(dua.meaning.en)).toBeTruthy();
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('gives a dua’s meaning in Urdu when Urdu is chosen', () => {
    render(<LessonBoard board="DUAS" position={null} isTeacher={false} onSelect={() => {}} meaningLanguage="ur" />);
    const meaning = screen.getByText(DUA_LESSONS[0].items[0].meaning.ur);
    expect(meaning.getAttribute('dir')).toBe('rtl');
  });
});

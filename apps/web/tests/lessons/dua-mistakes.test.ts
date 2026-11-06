import { describe, expect, it } from 'vitest';
import { findDua } from '@/components/practice/MistakesToPractise';
import type { DuaItem } from '@/lib/api/modules/duas';

const dua = (id: number, title: string): DuaItem => ({
  id,
  title,
  arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا',
  transliteration: '',
  translation: { en: 'All praise is for Allah' },
  repeat: 1,
  reference: `Hisn al-Muslim ${id}`,
});
const categories = [{ duas: [dua(1, 'Supplications for when you wake up (1)'), dua(2, 'Supplications for when you wake up (2)')] }];

describe('findDua: the dua a Duas mistake was logged on', () => {
  it('finds the dua by its title, with no word when the whole dua was marked', () => {
    expect(findDua('Supplications for when you wake up (2)', categories)).toEqual({ dua: categories[0].duas[1], word: null });
  });

  it('reads the tapped word number from the item reference', () => {
    expect(findDua('Supplications for when you wake up (1) · word 3 (الَّذِي)', categories)).toEqual({
      dua: categories[0].duas[0],
      word: 3,
    });
  });

  it('gives null for a chapter, a Qaida item or no collection', () => {
    expect(findDua('Supplications for when you wake up', categories)).toBeNull();
    expect(findDua('Lesson 1: ا', categories)).toBeNull();
    expect(findDua('Supplications for when you wake up (1)', undefined)).toBeNull();
  });
});

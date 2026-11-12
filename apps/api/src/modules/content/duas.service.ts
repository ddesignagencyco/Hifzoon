import { Injectable } from '@nestjs/common';

import hisnAlMuslim from '../../content/duas/hisn-al-muslim.json';

/** One dua (dhikr) of Hisn al-Muslim, as GET /content/duas returns it. */
export interface DuaItem {
  /** The number of the entry in Hisn al-Muslim (1–267). */
  id: number;
  /** A label for lists: the chapter title, numbered when the chapter has several entries. */
  title: string;
  arabic: string;
  /** Latin reading; empty when the source gives none (Quranic passages and narrations). */
  transliteration: string;
  /** Meaning per language code. The source publishes English only. */
  translation: Partial<Record<'en' | 'ur', string>>;
  /** How many times it is said. */
  repeat: number;
  /** Where it is in the book, plus the ayahs when it is Quran. */
  reference: string;
}

export interface DuaCategory {
  /** The chapter number in Hisn al-Muslim (1–132). */
  id: number;
  title: string;
  titleAr: string;
  duas: DuaItem[];
}

export interface DuaCollection {
  source: { name: string; author: string; url: string; languages: string[]; importedAt: string };
  categories: DuaCategory[];
}

interface ImportedFile {
  source: DuaCollection['source'];
  categories: Array<{
    id: number;
    title: { en: string; ar: string };
    duas: Array<Omit<DuaItem, 'title'>>;
  }>;
}

/**
 * Serves Hisn al-Muslim from the file `scripts/import-hisn-al-muslim.ts` writes, so classes
 * never wait on (or leak to) a third party. Built once, then the same object is returned.
 */
@Injectable()
export class DuasService {
  private collection: DuaCollection | null = null;

  constructor(private readonly file: ImportedFile = hisnAlMuslim) {}

  list(): DuaCollection {
    if (!this.collection) this.collection = DuasService.build(this.file);
    return this.collection;
  }

  static build(file: ImportedFile): DuaCollection {
    return {
      source: file.source,
      categories: [...file.categories]
        .sort((a, b) => a.id - b.id)
        .map((c) => ({
          id: c.id,
          title: c.title.en,
          titleAr: c.title.ar,
          duas: c.duas.map((d, i) => ({
            ...d,
            title: c.duas.length > 1 ? `${c.title.en} (${i + 1})` : c.title.en,
          })),
        })),
    };
  }
}

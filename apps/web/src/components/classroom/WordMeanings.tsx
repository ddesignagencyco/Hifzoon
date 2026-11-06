'use client';

import React, { useState } from 'react';
import { Languages } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { WORD_TRANSLATION_LANGUAGES } from '@/lib/api/modules/quran-public';

const STORAGE_KEY = 'hifzoon.classroom.word-meanings';
const OFF = 'off';

/**
 * Each person in the class picks their own language for word meanings; it is not shared like
 * the page. Remembered on this device; until chosen, it follows the account's language when
 * meanings exist for it, and is English otherwise.
 */
export function useWordMeaningLanguage(): [string | null, (code: string | null) => void] {
  const { currentUser } = useAuth();
  const [stored, setStored] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY),
  );
  const fromAccount = WORD_TRANSLATION_LANGUAGES.some((l) => l.code === currentUser?.language) ? currentUser!.language : 'en';
  const value = stored === null ? fromAccount : stored === OFF ? null : stored;
  const set = (code: string | null) => {
    const next = code ?? OFF;
    window.localStorage.setItem(STORAGE_KEY, next);
    setStored(next);
  };
  return [value, set];
}

/** The board lessons (Duas) are written in English and Urdu only. */
export const BOARD_MEANING_LANGUAGES = ['en', 'ur'] as const;

export function WordMeaningPicker({
  value,
  onChange,
  only,
}: {
  value: string | null;
  onChange: (code: string | null) => void;
  /** Offer only these languages (a board whose content has no other translations). */
  only?: readonly string[];
}) {
  const languages = only ? WORD_TRANSLATION_LANGUAGES.filter((l) => only.includes(l.code)) : WORD_TRANSLATION_LANGUAGES;
  return (
    <label className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 font-medium text-ink-2">
      <Languages className="h-3.5 w-3.5 text-green-700" aria-hidden />
      <span className="sr-only sm:not-sr-only">Word meanings</span>
      <select
        value={value ?? OFF}
        onChange={(e) => onChange(e.target.value === OFF ? null : e.target.value)}
        className="cursor-pointer bg-transparent font-semibold text-ink focus:outline-none"
        aria-label="Show word meanings in"
      >
        <option value={OFF}>Off</option>
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

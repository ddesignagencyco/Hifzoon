'use client';

import React, { useState } from 'react';
import { PenLine } from 'lucide-react';
import { Alert, Field, Select, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMarkMistake } from '@/hooks/useClassroomMistakes';
import {
  FieldErrors,
  MISTAKE_TYPE_LABELS,
  MISTAKE_TYPES,
  MistakeDraft,
  MistakeType,
  TAJWEED_RULE_MAX,
  validateMistakeDraft,
} from '@/lib/api/modules/lessons';
import type { WordPosition } from '@/components/mushaf/MushafViewer';

export interface ClassStudent {
  studentId: string;
  displayName: string;
}

function draftFrom(selection: WordPosition | null, studentId: string): MistakeDraft {
  return {
    studentId,
    surah: selection ? String(selection.surah) : '',
    ayah: selection ? String(selection.ayah) : '',
    wordIndex: selection ? String(selection.wordIndex) : '',
    type: '',
    tajweedRule: '',
  };
}

/**
 * Teacher's in-class mistake logger (FR-REC-01). Selecting a word in the Mushaf fills
 * the position; the teacher picks the student and one of the six mistake types.
 */
export function MistakeLogger({
  classId,
  students,
  selection,
  onLogged,
}: {
  classId: string;
  students: ClassStudent[];
  selection: WordPosition | null;
  onLogged?: () => void;
}) {
  const mark = useMarkMistake(classId);
  const toast = useToast();
  const defaultStudent = students.length === 1 ? students[0].studentId : '';
  const [draft, setDraft] = useState<MistakeDraft>(() => draftFrom(selection, defaultStudent));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastSelection, setLastSelection] = useState(selection);

  // A new word selected in the Mushaf moves the position (adjusting state during render).
  if (lastSelection !== selection) {
    setLastSelection(selection);
    if (selection) {
      setDraft((d) => ({
        ...d,
        surah: String(selection.surah),
        ayah: String(selection.ayah),
        wordIndex: String(selection.wordIndex),
      }));
      setErrors((e) => ({ ...e, surah: '', ayah: '', wordIndex: '' }));
    }
  }
  if (!draft.studentId && defaultStudent) {
    setDraft((d) => ({ ...d, studentId: defaultStudent }));
  }

  const set = <K extends keyof MistakeDraft>(key: K, value: MistakeDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: found, payload } = validateMistakeDraft(draft);
    setErrors(found);
    if (!payload) {
      toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');
      return;
    }
    mark.mutate(payload, {
      onSuccess: () => {
        toast.success(`${MISTAKE_TYPE_LABELS[payload.type]} logged at ${payload.surah}:${payload.ayah}`);
        setDraft((d) => ({ ...d, type: '', tajweedRule: '' }));
        onLogged?.();
      },
      onError: (err) => toast.error(err),
    });
  };

  if (students.length === 0) {
    return (
      <Alert tone="neutral" title="No students enrolled">
        Mistakes are recorded against a student in this class, and none are enrolled.
      </Alert>
    );
  }

  const id = (f: string) => `mistake-${f}`;
  return (
    <form onSubmit={submit} noValidate aria-label="Log a mistake" className="space-y-3">
      {!selection && (
        <p className="text-xs text-muted">Tip: select a word (or ayah) on the Mushaf to fill in the position.</p>
      )}
      {students.length > 1 && (
        <Field label="Student" htmlFor={id('student')} error={errors.studentId} required>
          <Select
            id={id('student')}
            value={draft.studentId}
            onChange={(e) => set('studentId', e.target.value)}
            aria-invalid={!!errors.studentId}
          >
            <option value="">Choose a student…</option>
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.displayName}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {students.length === 1 && <p className="text-xs text-ink-2">Student: <span className="font-semibold">{students[0].displayName}</span></p>}

      <div className="grid grid-cols-3 gap-2">
        <Field label="Surah" htmlFor={id('surah')} error={errors.surah} required>
          <TextInput id={id('surah')} type="number" inputMode="numeric" min={1} max={114} value={draft.surah} onChange={(e) => set('surah', e.target.value)} aria-invalid={!!errors.surah} />
        </Field>
        <Field label="Ayah" htmlFor={id('ayah')} error={errors.ayah} required>
          <TextInput id={id('ayah')} type="number" inputMode="numeric" min={1} value={draft.ayah} onChange={(e) => set('ayah', e.target.value)} aria-invalid={!!errors.ayah} />
        </Field>
        <Field label="Word" htmlFor={id('word')} error={errors.wordIndex} required>
          <TextInput id={id('word')} type="number" inputMode="numeric" min={0} value={draft.wordIndex} onChange={(e) => set('wordIndex', e.target.value)} aria-invalid={!!errors.wordIndex} />
        </Field>
      </div>

      <Field label="Mistake type" htmlFor={id('type')} error={errors.type} required>
        <Select id={id('type')} value={draft.type} onChange={(e) => set('type', e.target.value as MistakeType | '')} aria-invalid={!!errors.type}>
          <option value="">Choose a type…</option>
          {MISTAKE_TYPES.map((t) => (
            <option key={t} value={t}>
              {MISTAKE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Tajweed rule (optional)"
        htmlFor={id('rule')}
        error={errors.tajweedRule}
        hint={`e.g. Ghunnah, Qalqalah — up to ${TAJWEED_RULE_MAX} characters`}
      >
        <TextInput id={id('rule')} value={draft.tajweedRule} maxLength={TAJWEED_RULE_MAX + 20} onChange={(e) => set('tajweedRule', e.target.value)} aria-invalid={!!errors.tajweedRule} />
      </Field>

      <UiButton type="submit" loading={mark.isPending} icon={<PenLine className="w-4 h-4" aria-hidden />} className="w-full">
        Log mistake
      </UiButton>
    </form>
  );
}

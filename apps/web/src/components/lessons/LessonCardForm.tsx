'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, Select, TextArea, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  EDIT_REASON_MAX,
  FieldErrors,
  GRADE_LABELS,
  GRADES,
  Grade,
  LESSON_TEXT_MAX,
  LessonCardDraft,
  PORTION_KIND_LABELS,
  PORTION_KINDS,
  PortionDraft,
  PortionKind,
  SubmitLessonCardInput,
  emptyPortion,
  validateLessonCardDraft,
} from '@/lib/api/modules/lessons';

export interface LessonCardFormResult extends SubmitLessonCardInput {
  reason?: string;
}

/**
 * Sabaq / Sabqi / Manzil portions, grades, homework and parent note — validated to
 * SubmitLessonCardDto before submit. Used for composing and for editing a card.
 */
export function LessonCardForm({
  initial,
  onSubmit,
  pending,
  submitLabel,
  reasonMode = 'hidden',
  onCancel,
  idPrefix = 'lesson-card',
}: {
  initial: LessonCardDraft;
  onSubmit: (result: LessonCardFormResult) => void;
  pending: boolean;
  submitLabel: string;
  /** Supervisor edits after the lock must state a reason (FR-REC-08). */
  reasonMode?: 'hidden' | 'optional' | 'required';
  onCancel?: () => void;
  idPrefix?: string;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<LessonCardDraft>(initial);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const id = (f: string) => `${idPrefix}-${f}`;

  const updatePortion = (index: number, patch: Partial<PortionDraft>) => {
    setDraft((d) => ({ ...d, portions: d.portions.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));
  };
  const addPortion = (kind: PortionKind) => setDraft((d) => ({ ...d, portions: [...d.portions, emptyPortion(kind)] }));
  const removePortion = (index: number) =>
    setDraft((d) => ({ ...d, portions: d.portions.filter((_, i) => i !== index) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: found, payload } = validateLessonCardDraft(draft);
    const trimmedReason = reason.trim();
    if (reasonMode === 'required' && !trimmedReason) found.reason = 'Give a reason for editing a locked card';
    if (trimmedReason.length > EDIT_REASON_MAX) found.reason = `Keep the reason under ${EDIT_REASON_MAX} characters`;
    setErrors(found);
    if (!payload || Object.keys(found).length > 0) {
      toast.error(found.portions ?? 'Please fix the highlighted fields');
      return;
    }
    onSubmit({ ...payload, ...(reasonMode !== 'hidden' && trimmedReason ? { reason: trimmedReason } : {}) });
  };

  const presentKinds = new Set(draft.portions.map((p) => p.kind));

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label="Lesson card">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink mb-1">Portions</legend>
        {draft.portions.length === 0 && <p className="text-xs text-muted">No portions yet — add at least one.</p>}
        {draft.portions.map((p, i) => {
          const err = (f: string) => errors[`portions.${i}.${f}`];
          return (
            <div key={i} className="rounded-xl border border-line bg-cream/60 p-3 space-y-3" role="group" aria-label={`Portion ${i + 1}`}>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Type" htmlFor={id(`kind-${i}`)} error={err('kind')} required>
                  <Select id={id(`kind-${i}`)} value={p.kind} onChange={(e) => updatePortion(i, { kind: e.target.value as PortionKind | '' })} aria-invalid={!!err('kind')}>
                    <option value="">Choose…</option>
                    {PORTION_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PORTION_KIND_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Grade" htmlFor={id(`grade-${i}`)} error={err('grade')}>
                  <Select id={id(`grade-${i}`)} value={p.grade} onChange={(e) => updatePortion(i, { grade: e.target.value as Grade | '' })}>
                    <option value="">Not graded</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {GRADE_LABELS[g]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(
                  [
                    ['fromSurah', 'From surah', 114],
                    ['fromAyah', 'From ayah', undefined],
                    ['toSurah', 'To surah', 114],
                    ['toAyah', 'To ayah', undefined],
                  ] as const
                ).map(([field, label, max]) => (
                  <Field key={field} label={label} htmlFor={id(`${field}-${i}`)} error={err(field)}>
                    <TextInput
                      id={id(`${field}-${i}`)}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={max}
                      value={p[field]}
                      onChange={(e) => updatePortion(i, { [field]: e.target.value } as Partial<PortionDraft>)}
                      aria-invalid={!!err(field)}
                    />
                  </Field>
                ))}
              </div>
              {/* M46 — page numbers move the student's Hifz page map; surah/ayah alone do not. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(
                  [
                    ['fromPage', 'From page'],
                    ['toPage', 'To page'],
                  ] as const
                ).map(([field, label]) => (
                  <Field key={field} label={label} htmlFor={id(`${field}-${i}`)} error={err(field)} hint={field === 'fromPage' ? 'Madani Mushaf, 1–604' : undefined}>
                    <TextInput
                      id={id(`${field}-${i}`)}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={604}
                      value={p[field] ?? ''}
                      onChange={(e) => updatePortion(i, { [field]: e.target.value } as Partial<PortionDraft>)}
                      aria-invalid={!!err(field)}
                    />
                  </Field>
                ))}
              </div>
              <div className="flex justify-end">
                <UiButton size="sm" variant="ghost" onClick={() => removePortion(i)} icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />} aria-label={`Remove portion ${i + 1}`}>
                  Remove
                </UiButton>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          {(['SABAQ', 'SABQI', 'MANZIL', 'OTHER'] as const).map((k) => (
            <UiButton
              key={k}
              size="sm"
              variant={presentKinds.has(k) ? 'ghost' : 'secondary'}
              onClick={() => addPortion(k)}
              icon={<Plus className="w-3.5 h-3.5" aria-hidden />}
            >
              {k === 'OTHER' ? 'Other' : PORTION_KIND_LABELS[k].split(' ')[0]}
            </UiButton>
          ))}
        </div>
      </fieldset>

      <Field label="Homework" htmlFor={id('homework')} error={errors.homework} hint={`${draft.homework.length}/${LESSON_TEXT_MAX}`}>
        <TextArea id={id('homework')} rows={3} value={draft.homework} onChange={(e) => setDraft((d) => ({ ...d, homework: e.target.value }))} aria-invalid={!!errors.homework} />
      </Field>
      <Field label="Note for the family" htmlFor={id('note')} error={errors.parentNote} hint={`${draft.parentNote.length}/${LESSON_TEXT_MAX}`}>
        <TextArea id={id('note')} rows={3} value={draft.parentNote} onChange={(e) => setDraft((d) => ({ ...d, parentNote: e.target.value }))} aria-invalid={!!errors.parentNote} />
      </Field>
      {reasonMode !== 'hidden' && (
        <Field label="Reason for this edit" htmlFor={id('reason')} error={errors.reason} required={reasonMode === 'required'} hint="Recorded in the edit log the family can be shown.">
          <TextArea id={id('reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason} />
        </Field>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <UiButton variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </UiButton>
        )}
        <UiButton type="submit" loading={pending}>
          {submitLabel}
        </UiButton>
      </div>
    </form>
  );
}

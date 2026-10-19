'use client';

import React, { useState } from 'react';
import { Field, TextArea, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  BIO_MAX,
  PROFILE_CHANGE_FIELDS,
  ProfileChangeField,
  ProfileChanges,
  validateProfileChanges,
} from '@/lib/api/modules/teacher';

export type ProfileFormValues = Record<ProfileChangeField, string>;

const LABELS: Record<ProfileChangeField, { label: string; hint: string }> = {
  bio: { label: 'Bio', hint: 'Shown on your public profile. Families read this before booking a trial.' },
  photoUrl: { label: 'Photo link', hint: 'A full https:// link to a professional headshot.' },
  introVideoUrl: { label: 'Introduction video link', hint: 'A full https:// link to a short introduction video.' },
  recitationSampleUrl: { label: 'Recitation sample link', hint: 'A full https:// link to an audio sample of your recitation.' },
};

/** Only the fields that differ from `initial` (trimmed), i.e. the `changes` sent to the API. */
export function diffProfile(initial: ProfileFormValues, values: ProfileFormValues): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const key of PROFILE_CHANGE_FIELDS) {
    const next = values[key].trim();
    if (next !== initial[key].trim()) changes[key] = next;
  }
  return changes;
}

/**
 * Proposes profile changes (FR-TCH-05). Edits are staged for admin approval, and only the
 * fields the approval step applies are offered.
 */
export function ProfileForm({
  initial,
  submitting = false,
  onSubmit,
}: {
  initial: ProfileFormValues;
  submitting?: boolean;
  onSubmit: (changes: ProfileChanges) => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ProfileChangeField, string>>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const changes = diffProfile(initial, values);
    if (Object.keys(changes).length === 0) {
      setErrors({});
      toast.error('Nothing has changed yet.');
      return;
    }
    const found = validateProfileChanges(changes);
    setErrors(found);
    const first = Object.values(found).find(Boolean);
    if (first) {
      toast.error(first);
      return;
    }
    onSubmit(changes);
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Edit profile" className="space-y-4">
      {PROFILE_CHANGE_FIELDS.map((key) => {
        const id = `profile-${key}`;
        const common = {
          id,
          value: values[key],
          'aria-invalid': Boolean(errors[key]),
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues((v) => ({ ...v, [key]: e.target.value })),
        };
        return (
          <Field
            key={key}
            label={LABELS[key].label}
            htmlFor={id}
            error={errors[key]}
            hint={key === 'bio' ? `${LABELS[key].hint} ${values.bio.length}/${BIO_MAX}` : LABELS[key].hint}
          >
            {key === 'bio' ? (
              <TextArea {...common} rows={6} maxLength={BIO_MAX} />
            ) : (
              <TextInput {...common} type="url" inputMode="url" placeholder="https://" />
            )}
          </Field>
        );
      })}
      <div className="flex flex-wrap justify-end gap-2">
        <UiButton
          variant="secondary"
          disabled={submitting}
          onClick={() => {
            setValues(initial);
            setErrors({});
          }}
        >
          Reset
        </UiButton>
        <UiButton type="submit" loading={submitting}>
          Submit for approval
        </UiButton>
      </div>
    </form>
  );
}

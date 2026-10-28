'use client';

import React, { useState } from 'react';
import { Checkbox, Field, Select, TextArea, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  BIO_MAX,
  PROFILE_LIST_FIELDS,
  PROFILE_LIST_LIMITS,
  PROFILE_TEXT_FIELDS,
  ProfileChangeField,
  ProfileChanges,
  ProfileListField,
  ProfileTextField,
  QUALIFICATIONS_MAX,
  TEACHER_CREDENTIAL_TYPES,
  TeacherCredential,
  validateProfileChanges,
} from '@/lib/api/modules/teacher';

export type ProfileFormValues = Record<ProfileTextField, string> &
  Record<ProfileListField, string[]> & { qualifications: TeacherCredential[] };

const sameCredentials = (a: TeacherCredential[], b: TeacherCredential[]) =>
  a.length === b.length && a.every((c, i) => JSON.stringify(c) === JSON.stringify(b[i]));

const BLANK_CREDENTIAL: TeacherCredential = {
  type: 'CERTIFICATE',
  title: '',
  issuer: '',
  documentUrl: '',
  verified: false,
};

export interface ProfileOption {
  value: string;
  label: string;
  description?: string;
}

const TEXT_LABELS: Record<ProfileTextField, { label: string; hint: string }> = {
  bio: { label: 'Bio', hint: 'Shown on your public profile. Families read this before booking a trial.' },
  photoUrl: { label: 'Photo link', hint: 'A full https:// link to a professional headshot.' },
  introVideoUrl: { label: 'Introduction video link', hint: 'A full https:// link to a short introduction video.' },
  recitationSampleUrl: { label: 'Recitation sample link', hint: 'A full https:// link to an audio sample of your recitation.' },
};

const LIST_LABELS: Record<ProfileListField, { label: string; hint: string }> = {
  languages: { label: 'Teaching languages', hint: 'Languages you can teach in.' },
  subjects: { label: 'Subjects', hint: 'Courses you can teach.' },
  ageGroups: { label: 'Age groups', hint: 'Ages you are comfortable teaching.' },
};

/** ISO 639-1 codes offered for teaching languages (the API stores the code). */
export const LANGUAGE_CODES = ['en', 'ur', 'ar', 'fr', 'bn', 'hi', 'tr', 'ms', 'id', 'so', 'de', 'es'] as const;

/**
 * The API stores age groups as free text; these are the values the academy already uses
 * (seed data and the admin "Provision teacher" form), so filters and cards stay consistent.
 */
export const AGE_GROUP_SUGGESTIONS = ['4-6', '6-9', '10-13', '14+'] as const;

export function languageLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    return name && name !== code ? name : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));

/**
 * Only the fields that differ from `initial`, i.e. the `changes` sent to the API.
 * A cleared link is sent as `null` (the API refuses an empty string); lists compare as sets.
 */
export function diffProfile(initial: ProfileFormValues, values: ProfileFormValues): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const key of PROFILE_TEXT_FIELDS) {
    const next = values[key].trim();
    if (next === initial[key].trim()) continue;
    changes[key] = key !== 'bio' && next === '' ? null : next;
  }
  for (const key of PROFILE_LIST_FIELDS) {
    if (!sameSet(initial[key], values[key])) changes[key] = [...values[key]];
  }
  if (!sameCredentials(initial.qualifications, values.qualifications)) {
    changes.qualifications = values.qualifications.map((c) => ({ ...c, title: c.title.trim(), issuer: c.issuer.trim() }));
  }
  return changes;
}

/** Offered options plus anything already on the profile that the list does not include. */
function withCurrent(options: ProfileOption[], current: string[], label: (v: string) => string = (v) => v): ProfileOption[] {
  const extra = current.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: label(v) }));
  return [...options, ...extra];
}

/**
 * Proposes profile changes (FR-TCH-05). Edits are staged for admin approval; the fields
 * offered are the ones `PATCH /teachers/me/profile` accepts and approval applies.
 */
export function ProfileForm({
  initial,
  subjectOptions = [],
  subjectsLoading = false,
  submitting = false,
  onSubmit,
}: {
  initial: ProfileFormValues;
  /** Course codes from the public catalogue (`GET /courses`). */
  subjectOptions?: ProfileOption[];
  subjectsLoading?: boolean;
  submitting?: boolean;
  onSubmit: (changes: ProfileChanges) => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ProfileChangeField, string>>>({});

  const options: Record<ProfileListField, ProfileOption[]> = {
    languages: withCurrent(
      LANGUAGE_CODES.map((code) => ({ value: code, label: languageLabel(code) })),
      initial.languages,
      languageLabel,
    ),
    subjects: withCurrent(subjectOptions, initial.subjects),
    ageGroups: withCurrent(
      AGE_GROUP_SUGGESTIONS.map((g) => ({ value: g, label: g })),
      initial.ageGroups,
    ),
  };

  const toggle = (key: ProfileListField, value: string, on: boolean) =>
    setValues((v) => ({ ...v, [key]: on ? [...v[key].filter((x) => x !== value), value] : v[key].filter((x) => x !== value) }));

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
      {PROFILE_TEXT_FIELDS.map((key) => {
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
            label={TEXT_LABELS[key].label}
            htmlFor={id}
            error={errors[key]}
            hint={key === 'bio' ? `${TEXT_LABELS[key].hint} ${values.bio.length}/${BIO_MAX}` : TEXT_LABELS[key].hint}
          >
            {key === 'bio' ? (
              <TextArea {...common} rows={6} maxLength={BIO_MAX} />
            ) : (
              <TextInput {...common} type="url" inputMode="url" placeholder="https://" />
            )}
          </Field>
        );
      })}

      {PROFILE_LIST_FIELDS.map((key) => {
        const error = errors[key];
        const hintId = `profile-${key}-hint`;
        return (
          <fieldset key={key} aria-describedby={hintId} aria-invalid={error ? true : undefined}>
            <legend className={cn('text-xs font-semibold mb-1', error ? 'text-red' : 'text-ink-2')}>{LIST_LABELS[key].label}</legend>
            <p id={hintId} className="text-xs text-muted mb-2">
              {LIST_LABELS[key].hint} Up to {PROFILE_LIST_LIMITS[key].max}.
            </p>
            {key === 'subjects' && subjectsLoading && options.subjects.length === 0 ? (
              <p className="text-xs text-muted" role="status">Loading courses…</p>
            ) : options[key].length === 0 ? (
              <p className="text-xs text-muted">No courses are available to choose from right now.</p>
            ) : (
              <div className={key === 'ageGroups' ? 'flex flex-wrap gap-4' : 'grid grid-cols-2 sm:grid-cols-3 gap-2'}>
                {options[key].map((o) => (
                  <Checkbox
                    key={o.value}
                    id={`profile-${key}-${o.value}`}
                    label={o.label}
                    description={o.description}
                    checked={values[key].includes(o.value)}
                    disabled={submitting}
                    onChange={(on) => toggle(key, o.value, on)}
                  />
                ))}
              </div>
            )}
            {error && <p className="sr-only">{error}</p>}
          </fieldset>
        );
      })}

      <fieldset aria-describedby="profile-qualifications-hint" aria-invalid={errors.qualifications ? true : undefined}>
        <legend className={cn('text-xs font-semibold mb-1', errors.qualifications ? 'text-red' : 'text-ink-2')}>
          Certificates &amp; associations
        </legend>
        <p id="profile-qualifications-hint" className="text-xs text-muted mb-2">
          Add certificates, ijazahs or association memberships. An admin verifies each one before it shows as verified.
          Up to {QUALIFICATIONS_MAX}.
        </p>
        <div className="space-y-3">
          {values.qualifications.map((credential, index) => (
            <div key={index} className="rounded-xl border border-line p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-ink-2">
                  {credential.verified ? (
                    <span className="inline-flex items-center gap-1 text-green-700">✓ Verified</span>
                  ) : (
                    'Pending verification'
                  )}
                </span>
                <UiButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submitting}
                  onClick={() =>
                    setValues((v) => ({
                      ...v,
                      qualifications: v.qualifications.filter((_, i) => i !== index),
                    }))
                  }
                >
                  Remove
                </UiButton>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <Field label="Type" htmlFor={`qualification-${index}-type`}>
                  <Select
                    id={`qualification-${index}-type`}
                    value={credential.type}
                    disabled={submitting}
                    options={TEACHER_CREDENTIAL_TYPES.map((t) => ({ value: t, label: humanizeCredentialType(t) }))}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        qualifications: v.qualifications.map((c, i) =>
                          i === index ? { ...c, type: e.target.value as TeacherCredential['type'] } : c,
                        ),
                      }))
                    }
                  />
                </Field>
                <Field label="Issuer" htmlFor={`qualification-${index}-issuer`}>
                  <TextInput
                    id={`qualification-${index}-issuer`}
                    value={credential.issuer}
                    disabled={submitting}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        qualifications: v.qualifications.map((c, i) => (i === index ? { ...c, issuer: e.target.value } : c)),
                      }))
                    }
                  />
                </Field>
                <Field label="Title" htmlFor={`qualification-${index}-title`}>
                  <TextInput
                    id={`qualification-${index}-title`}
                    value={credential.title}
                    disabled={submitting}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        qualifications: v.qualifications.map((c, i) => (i === index ? { ...c, title: e.target.value } : c)),
                      }))
                    }
                  />
                </Field>
                <Field label="Document link" htmlFor={`qualification-${index}-url`} hint="A full https:// link to the certificate or membership proof.">
                  <TextInput
                    id={`qualification-${index}-url`}
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={credential.documentUrl}
                    disabled={submitting}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        qualifications: v.qualifications.map((c, i) => (i === index ? { ...c, documentUrl: e.target.value } : c)),
                      }))
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        {errors.qualifications && <p className="text-xs text-red mt-2">{errors.qualifications}</p>}
        <UiButton
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={submitting || values.qualifications.length >= QUALIFICATIONS_MAX}
          onClick={() => setValues((v) => ({ ...v, qualifications: [...v.qualifications, { ...BLANK_CREDENTIAL }] }))}
        >
          Add credential
        </UiButton>
      </fieldset>

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

function humanizeCredentialType(type: TeacherCredential['type']): string {
  if (type === 'CERTIFICATE') return 'Certificate';
  if (type === 'ASSOCIATION') return 'Association membership';
  return 'Other';
}

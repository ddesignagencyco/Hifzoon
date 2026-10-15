'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Alert, ErrorState, Field, Select, TextInput } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/landing/Button';
import { ApiClientError } from '@/lib/api/http';
import {
  useAddChild,
  useBookTrial,
  useCreateFamily,
  useFamilyStudents,
  useGrantDataConsent,
  useMyFamilies,
  useStudentConsent,
} from '@/hooks/useBooking';
import {
  AddChildInput,
  BookedClass,
  CONSENT_POLICY_VERSION,
  FamilyStudent,
  OpenSlot,
  TRIAL_DURATION_MINUTES,
  hasDataCollectionConsent,
  learnerAge,
  validateChild,
  validateFamily,
} from '@/lib/api/modules/public-booking';
import { countryOptions } from '@/lib/data/countries';

const box = 'bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card';

/** Toasts the first validation problem (or a summary when there are several). Returns true when valid. */
function reportInvalid(found: Record<string, string>, toast: ReturnType<typeof useToast>): boolean {
  const problems = Object.values(found);
  if (problems.length === 0) return true;
  toast.error(problems.length === 1 ? problems[0] : 'Please fix the highlighted fields');
  return false;
}

/**
 * Signed-in guardian: make sure a family exists, pick or add the learner, record
 * DATA_COLLECTION consent (required by `/scheduling/book`), then book the trial.
 */
export function LearnerStep({
  guardianName,
  timeZone,
  courseId,
  slot,
  onBooked,
  onSlotTaken,
}: {
  guardianName: string;
  timeZone: string;
  courseId: string;
  slot: Pick<OpenSlot, 'teacherId' | 'startsAt'>;
  onBooked: (booked: BookedClass, learner: FamilyStudent) => void;
  onSlotTaken: () => void;
}) {
  const families = useMyFamilies(true);
  const family = families.data?.[0];

  if (families.isLoading) return <Loading label="Loading your family account…" />;
  if (families.isError)
    return <ErrorState error={families.error} title="Could not load your family account" onRetry={() => families.refetch()} />;
  if (!family) return <CreateFamilyForm guardianName={guardianName} timeZone={timeZone} />;
  return (
    <ChooseLearner
      familyId={family.id}
      timeZone={timeZone}
      courseId={courseId}
      slot={slot}
      onBooked={onBooked}
      onSlotTaken={onSlotTaken}
    />
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-[#6b7772] py-6">
      <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> {label}
    </div>
  );
}

function CreateFamilyForm({ guardianName, timeZone }: { guardianName: string; timeZone: string }) {
  const create = useCreateFamily();
  const toast = useToast();
  const countries = useMemo(() => countryOptions(), []);
  const [name, setName] = useState(`${guardianName.split(' ')[0] || 'My'} family`);
  const [country, setCountry] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: name.trim(), ...(country ? { country } : {}), timeZone };
    const found = validateFamily(body);
    setErrors(found);
    if (reportInvalid(found, toast)) create.mutate(body, { onError: (err) => toast.error(err) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-[#3c4a45]">First, set up your family account. You can add other guardians later.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Family name" htmlFor="family-name" required error={errors.name}>
          <TextInput id="family-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Country" htmlFor="family-country" error={errors.country}>
          <Select id="family-country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Prefer not to say</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="green" size="sm" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create family account'}
      </Button>
    </form>
  );
}

function ChooseLearner({
  familyId,
  timeZone,
  courseId,
  slot,
  onBooked,
  onSlotTaken,
}: {
  familyId: string;
  timeZone: string;
  courseId: string;
  slot: Pick<OpenSlot, 'teacherId' | 'startsAt'>;
  onBooked: (booked: BookedClass, learner: FamilyStudent) => void;
  onSlotTaken: () => void;
}) {
  const students = useFamilyStudents(familyId);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = students.data ?? [];
  const activeId = studentId ?? (list.length === 1 ? list[0].id : null);
  const learner = list.find((s) => s.id === activeId);

  if (students.isLoading) return <Loading label="Loading learners…" />;
  if (students.isError) return <ErrorState error={students.error} title="Could not load learners" onRetry={() => students.refetch()} />;

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">Who is the trial for?</legend>
        {list.length === 0 && !adding && <p className="text-sm text-[#6b7772]">No learners on your account yet.</p>}
        <div className="grid sm:grid-cols-2 gap-2.5">
          {list.map((s) => (
            <label
              key={s.id}
              className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer ${
                s.id === activeId ? 'border-[#143a2f] bg-[#f0f6f3]' : 'border-[#e6dfd1] bg-[#faf7f1]'
              }`}
            >
              <input
                type="radio"
                name="learner"
                value={s.id}
                checked={s.id === activeId}
                onChange={() => {
                  setStudentId(s.id);
                  setAdding(false);
                }}
                className="accent-[#143a2f]"
              />
              <span>
                <span className="block text-sm font-semibold text-[#10201b]">{s.displayName}</span>
                <span className="block text-[11px] text-[#6b7772]">Age {learnerAge(s.birthYear)}</span>
              </span>
            </label>
          ))}
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#143a2f] hover:underline cursor-pointer mt-1"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden /> Add a learner
          </button>
        )}
      </fieldset>

      {adding && (
        <AddLearnerForm
          familyId={familyId}
          timeZone={timeZone}
          onAdded={(id) => {
            setStudentId(id);
            setAdding(false);
          }}
          onCancel={list.length > 0 ? () => setAdding(false) : undefined}
        />
      )}

      {learner && !adding && (
        <ConfirmBooking
          key={learner.id}
          learner={learner}
          courseId={courseId}
          slot={slot}
          onBooked={onBooked}
          onSlotTaken={onSlotTaken}
        />
      )}
    </div>
  );
}

function AddLearnerForm({
  familyId,
  timeZone,
  onAdded,
  onCancel,
}: {
  familyId: string;
  timeZone: string;
  onAdded: (studentId: string) => void;
  onCancel?: () => void;
}) {
  const add = useAddChild(familyId);
  const toast = useToast();
  const [form, setForm] = useState({ displayName: '', birthYear: '', gender: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: AddChildInput = {
      displayName: form.displayName.trim(),
      birthYear: Number(form.birthYear),
      gender: form.gender as AddChildInput['gender'],
      timeZone,
    };
    const found = validateChild(body);
    setErrors(found);
    if (!reportInvalid(found, toast)) return;
    add.mutate(body, { onSuccess: (child) => onAdded(child.id), onError: (err) => toast.error(err) });
  };

  return (
    <form onSubmit={submit} className="p-4 rounded-2xl border border-[#e6dfd1] bg-[#faf7f1] space-y-4" noValidate>
      <p className="text-xs text-[#6b7772]">We only collect a first name and birth year — never a full date of birth.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="First name" htmlFor="child-name" required error={errors.displayName}>
          <TextInput
            id="child-name"
            maxLength={120}
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          />
        </Field>
        <Field label="Birth year" htmlFor="child-year" required error={errors.birthYear}>
          <TextInput
            id="child-year"
            type="number"
            inputMode="numeric"
            min={1990}
            value={form.birthYear}
            onChange={(e) => setForm((f) => ({ ...f, birthYear: e.target.value }))}
          />
        </Field>
        <Field label="Gender" htmlFor="child-gender" required error={errors.gender}>
          <Select id="child-gender" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
            <option value="">Choose…</option>
            <option value="FEMALE">Girl / woman</option>
            <option value="MALE">Boy / man</option>
            <option value="OTHER">Prefer to describe otherwise</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="green" size="sm" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add learner'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function ConfirmBooking({
  learner,
  courseId,
  slot,
  onBooked,
  onSlotTaken,
}: {
  learner: FamilyStudent;
  courseId: string;
  slot: Pick<OpenSlot, 'teacherId' | 'startsAt'>;
  onBooked: (booked: BookedClass, learner: FamilyStudent) => void;
  onSlotTaken: () => void;
}) {
  const consent = useStudentConsent(learner.id);
  const grant = useGrantDataConsent();
  const book = useBookTrial();
  const toast = useToast();
  const [agreed, setAgreed] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const [slotTaken, setSlotTaken] = useState(false);
  const granted = hasDataCollectionConsent(consent.data);
  const under13 = learnerAge(learner.birthYear) < 13;
  const pending = grant.isPending || book.isPending;

  const confirm = async () => {
    setConsentMissing(false);
    setSlotTaken(false);
    if (!granted && !agreed) {
      setConsentMissing(true);
      toast.error('Please give consent so we can schedule the class.');
      return;
    }
    try {
      if (!granted) await grant.mutateAsync(learner.id);
      const booked = await book.mutateAsync({
        teacherId: slot.teacherId,
        courseId,
        studentId: learner.id,
        startsAt: slot.startsAt,
        durationMinutes: TRIAL_DURATION_MINUTES,
        roomType: 'ONE_TO_ONE',
        type: 'TRIAL',
      });
      onBooked(booked, learner);
    } catch (err) {
      if (err instanceof ApiClientError && (err.code === 'DOUBLE_BOOKED' || err.status === 409)) setSlotTaken(true);
      toast.error(err);
    }
  };

  return (
    <div className="space-y-4 border-t border-[#f3eee4] pt-5">
      {consent.isLoading ? (
        <Loading label="Checking consent…" />
      ) : consent.isError ? (
        <ErrorState error={consent.error} title="Could not check consent" onRetry={() => consent.refetch()} />
      ) : granted ? (
        <Alert tone="success">Data-collection consent is already on file for {learner.displayName}.</Alert>
      ) : (
        <label
          htmlFor="booking-consent"
          className={`flex items-start gap-3 p-4 rounded-2xl bg-[#faf7f1] border cursor-pointer ${
            consentMissing ? 'border-red' : 'border-[#e6dfd1]'
          }`}
        >
          <input
            id="booking-consent"
            type="checkbox"
            checked={agreed}
            aria-invalid={consentMissing || undefined}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (e.target.checked) setConsentMissing(false);
            }}
            className="mt-1 h-4 w-4 accent-[#143a2f]"
          />
          <span className="text-xs text-[#3c4a45] leading-relaxed">
            I am {learner.displayName}&apos;s parent or legal guardian and I consent to Hifzoon collecting and using their
            learning data to deliver classes (data-collection consent, policy v{CONSENT_POLICY_VERSION}).
            {under13 && ' This is required by law for learners under 13.'} You can withdraw it from the family portal.
          </span>
        </label>
      )}

      {slotTaken && (
        <button type="button" onClick={onSlotTaken} className="block text-sm font-semibold text-[#143a2f] underline cursor-pointer">
          Choose another time
        </button>
      )}

      <Button
        type="button"
        variant="gold"
        className="w-full"
        disabled={pending || consent.isLoading || consent.isError}
        onClick={confirm}
      >
        {pending ? (grant.isPending ? 'Recording consent…' : 'Booking your class…') : `Confirm free trial for ${learner.displayName}`}
      </Button>
    </div>
  );
}

export { box as bookingCardClass };

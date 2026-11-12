'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, PhoneCall } from 'lucide-react';
import { Alert, CountrySelect, Field, TextInput, UiButton } from '@/components/ui/primitives';
import { useAuth } from '@/hooks/useAuth';
import { bookingApi } from '@/lib/api/modules/public-booking';

/**
 * When no open time suits a family, they can leave their details instead of leaving the
 * site. The enquiry lands in the CRM as a lead with a follow-up task for the office.
 */
export function CallbackRequest({
  courseCode,
  courseName,
  timeZone,
  teacherChosen = false,
  onShowAllTeachers,
}: {
  courseCode: string;
  /** The course's name, for the family; the code only goes to the API. */
  courseName?: string;
  timeZone: string;
  /** A teacher was picked: their calendar is full, not necessarily everyone's. */
  teacherChosen?: boolean;
  onShowAllTeachers?: () => void;
}) {
  const { currentUser: user } = useAuth();
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: '', country: '', city: '', message: '' });
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email', string>>>({});
  const send = useMutation({
    mutationFn: () =>
      bookingApi.enquire({
        contactName: form.name.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.country ? { country: form.country } : {}),
        ...(form.city.trim() ? { city: form.city.trim() } : {}),
        ...(form.message.trim() ? { message: form.message.trim() } : {}),
        courseInterest: courseCode,
        timeZone,
        ...(website ? { website } : {}),
      }),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length === 0) send.mutate();
  };

  if (send.isSuccess) {
    return (
      <Alert tone="success" title="Thank you — we will be in touch">
        Our admissions team will contact you within one working day to find a time that suits you.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="No open times in the next two weeks">
        {teacherChosen
          ? 'The teacher you chose has no open time that matches your preferences. See every teacher, or leave your details and our admissions team will find a time for you.'
          : `No teacher is free for ${courseName ?? 'this course'} in the next two weeks. Leave your details and our admissions team will find a time for you.`}
        {teacherChosen && onShowAllTeachers && (
          <div className="mt-2">
            <UiButton size="sm" variant="secondary" onClick={onShowAllTeachers}>
              Show every teacher
            </UiButton>
          </div>
        )}
      </Alert>
      <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl border border-[#e6dfd1] bg-[#faf7f1] p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#10201b]">
          <PhoneCall className="h-4 w-4 text-[#a97f3c]" aria-hidden /> Ask us to call you back
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your name" htmlFor="cb-name" required error={errors.name}>
            <TextInput id="cb-name" value={form.name} onChange={set('name')} autoComplete="name" maxLength={160} />
          </Field>
          <Field label="Email" htmlFor="cb-email" required error={errors.email}>
            <TextInput id="cb-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={320} />
          </Field>
          <Field label="Phone or WhatsApp" htmlFor="cb-phone" hint="Optional">
            <TextInput id="cb-phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" maxLength={32} />
          </Field>
          <Field label="Country" htmlFor="cb-country" hint="Optional">
            <CountrySelect id="cb-country" value={form.country} onChange={(country) => setForm((f) => ({ ...f, country }))} />
          </Field>
          <Field label="City" htmlFor="cb-city" hint="Optional">
            <TextInput id="cb-city" value={form.city} onChange={set('city')} autoComplete="address-level2" maxLength={120} />
          </Field>
          <Field label="Best times to reach you" htmlFor="cb-message" hint="Optional" className="sm:col-span-2">
            <TextInput id="cb-message" value={form.message} onChange={set('message')} maxLength={1000} placeholder="e.g. weekday evenings" />
          </Field>
        </div>
        {/* Hidden from people; bots that fill every field give themselves away. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="sr-only"
          aria-hidden
        />
        {send.isError && (
          <Alert tone="error">We could not send your details just now. Please try again in a minute.</Alert>
        )}
        <UiButton type="submit" loading={send.isPending} icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
          Request a call back
        </UiButton>
      </form>
    </div>
  );
}

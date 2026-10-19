'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Field, LoadingState, ErrorState, Modal, Select, TextArea, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useFamilyStudents,
  useMessagingFamilies,
  useStartThread,
  useStudentEnrolments,
} from '@/hooks/useMessaging';
import {
  detectContactDetails,
  MESSAGE_MAX_LENGTH,
  MESSAGEABLE_ENROLMENT_STATUSES,
  validateMessageBody,
} from '@/lib/api/modules/messaging';

/**
 * Guardian starts (or continues) a conversation about one child with a teacher who
 * teaches that child — the same rule `MessagingService.assertActorMayMessage` enforces.
 */
export function NewThreadModal({ open, onClose, basePath }: { open: boolean; onClose: () => void; basePath: string }) {
  if (!open) return null;
  return <NewThreadForm onClose={onClose} basePath={basePath} />;
}

function NewThreadForm({ onClose, basePath }: { onClose: () => void; basePath: string }) {
  const router = useRouter();
  const toast = useToast();
  const start = useStartThread();
  const families = useMessagingFamilies();

  const [familyChoice, setFamilyChoice] = useState('');
  const familyId = familyChoice || (families.data?.length === 1 ? families.data[0].id : '');
  const students = useFamilyStudents(familyId || undefined);

  const [studentChoice, setStudentChoice] = useState('');
  const studentId = studentChoice || (students.data?.length === 1 ? students.data[0].id : '');
  const enrolments = useStudentEnrolments(studentId || undefined);

  // Failed option lists: the picker is outlined red and the reason goes to a toast.
  useEffect(() => {
    if (students.isError) toast.error(students.error);
  }, [students.isError, students.error, toast]);
  useEffect(() => {
    if (enrolments.isError) toast.error(enrolments.error);
  }, [enrolments.isError, enrolments.error, toast]);

  const [enrolmentId, setEnrolmentId] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const teacherOptions = useMemo(
    () =>
      (enrolments.data ?? []).filter(
        (e) => e.teacher && e.student.id === studentId && MESSAGEABLE_ENROLMENT_STATUSES.includes(e.status),
      ),
    [enrolments.data, studentId],
  );
  const selectedEnrolmentId = enrolmentId || (teacherOptions.length === 1 ? teacherOptions[0].id : '');
  const enrolment = teacherOptions.find((e) => e.id === selectedEnrolmentId);

  const bodyError = validateMessageBody(body);
  const contact = body.trim() ? detectContactDetails(body) : null;
  const errors = {
    family: !familyId ? 'Choose a family.' : null,
    student: !studentId ? 'Choose a child.' : null,
    teacher: !enrolment ? 'Choose a teacher.' : null,
    body: bodyError,
  };
  const valid = !errors.family && !errors.student && !errors.teacher && !errors.body && !contact;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || !enrolment?.teacher) {
      toast.error(
        errors.family ??
          errors.student ??
          errors.teacher ??
          errors.body ??
          (contact ? 'Please remove contact details before sending.' : 'Please fix the highlighted fields'),
      );
      return;
    }
    start.mutate(
      {
        input: { familyId, studentId, teacherId: enrolment.teacher.id, enrolmentId: enrolment.id },
        body,
      },
      {
        onSuccess: (thread) => {
          toast.success(`Message sent to ${enrolment.teacher?.user.name ?? 'the teacher'}`);
          onClose();
          router.push(`${basePath}/${thread.id}`);
        },
        onError: (error) => toast.error(error),
      },
    );
  };

  const show = (msg: string | null) => (submitted ? msg : null);

  return (
    <Modal
      open
      onClose={start.isPending ? () => undefined : onClose}
      title="New message"
      description="Message a teacher about one of your children. If a conversation already exists, your message is added to it."
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={start.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" form="new-thread-form" loading={start.isPending}>
            Send message
          </UiButton>
        </>
      }
    >
      {families.isLoading ? (
        <LoadingState label="Loading your family…" />
      ) : families.isError ? (
        <ErrorState error={families.error} onRetry={() => families.refetch()} />
      ) : (families.data ?? []).length === 0 ? (
        <Alert tone="warning" title="No family account found">
          Set up your family and add a child before messaging a teacher.
        </Alert>
      ) : (
        <form id="new-thread-form" onSubmit={submit} className="space-y-4" noValidate>
          {(families.data ?? []).length > 1 && (
            <Field label="Family" htmlFor="nt-family" required error={show(errors.family)}>
              <Select
                id="nt-family"
                value={familyId}
                onChange={(e) => {
                  setFamilyChoice(e.target.value);
                  setStudentChoice('');
                  setEnrolmentId('');
                }}
              >
                <option value="">Choose a family</option>
                {families.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Child" htmlFor="nt-student" required error={show(errors.student) ?? (students.isError ? 'Could not load children.' : null)}>
            <Select
              id="nt-student"
              value={studentId}
              disabled={!familyId || students.isLoading}
              onChange={(e) => {
                setStudentChoice(e.target.value);
                setEnrolmentId('');
              }}
            >
              <option value="">{students.isLoading ? 'Loading…' : 'Choose a child'}</option>
              {students.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Teacher"
            htmlFor="nt-teacher"
            required
            error={
              show(errors.teacher) ??
              (enrolments.isError ? 'Could not load teachers.' : null)
            }
            hint={
              studentId && !enrolments.isLoading && teacherOptions.length === 0
                ? 'This child has no current teacher yet. You can message once a teacher is assigned.'
                : 'Only teachers who currently teach this child are listed.'
            }
          >
            <Select
              id="nt-teacher"
              value={selectedEnrolmentId}
              disabled={!studentId || enrolments.isLoading || teacherOptions.length === 0}
              onChange={(e) => setEnrolmentId(e.target.value)}
            >
              <option value="">{enrolments.isLoading ? 'Loading…' : 'Choose a teacher'}</option>
              {teacherOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.teacher?.user.name} — {e.course.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Message"
            htmlFor="nt-body"
            required
            error={show(errors.body)}
            hint={`${body.trim().length}/${MESSAGE_MAX_LENGTH}`}
          >
            <TextArea id="nt-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          {contact && (
            <Alert tone="warning" title="Please remove contact details">
              Your message looks like it contains {contact}. All contact with teachers stays on Hifzoon.
            </Alert>
          )}
        </form>
      )}
    </Modal>
  );
}

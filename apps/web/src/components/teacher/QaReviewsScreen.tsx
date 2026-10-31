'use client';

import React, { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  QueryState,
  TextArea,
  UiButton,
  formatDate,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMyQaReviews, useReplyToQaReview } from '@/hooks/useTeacher';
import type { TeacherQaReview } from '@/lib/api/modules/teacher';

/** `/teacher/reviews` — supervisors' reviews of the teacher's classes, and their replies (M62). */
export function QaReviewsScreen() {
  const reviews = useMyQaReviews();
  const [open, setOpen] = useState<TeacherQaReview | null>(null);

  return (
    <>
      <PageHeader
        title="Quality reviews"
        description="A supervisor watches some of your classes each month and scores them against the lesson rubric. Read the feedback and reply."
      />
      <Card>
        <CardBody className="pt-5">
          <QueryState
            query={reviews}
            loadingLabel="Loading reviews…"
            empty={
              <EmptyState
                icon={<ClipboardCheck className="h-5 w-5" aria-hidden />}
                title="No reviews yet"
                description="When a supervisor reviews one of your classes, it appears here."
              />
            }
          >
            {(rows) => (
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                onRowClick={setOpen}
                columns={[
                  { key: 'class', header: 'Class', sortValue: (r) => r.class.startsAt, render: (r) => `${r.class.course.name} · ${formatDate(r.class.startsAt)}` },
                  {
                    key: 'score',
                    header: 'Average',
                    className: 'tabular-nums',
                    sortValue: (r) => r.average ?? -1,
                    render: (r) => (r.average === null ? '—' : <span className="font-semibold text-ink">{r.average.toFixed(1)} / 5</span>),
                  },
                  { key: 'reviewed', header: 'Reviewed', sortValue: (r) => r.reviewedAt, render: (r) => formatDate(r.reviewedAt) },
                  {
                    key: 'reply',
                    header: 'Your reply',
                    sortValue: (r) => (r.teacherReply ? 1 : 0),
                    render: (r) => (r.teacherReply ? <Badge tone="green">Replied</Badge> : <Badge tone="amber">Not yet</Badge>),
                  },
                ]}
              />
            )}
          </QueryState>
        </CardBody>
      </Card>
      {open && <ReviewDetail key={open.id} review={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReviewDetail({ review, onClose }: { review: TeacherQaReview; onClose: () => void }) {
  const toast = useToast();
  const reply = useReplyToQaReview();
  const [text, setText] = useState(review.teacherReply ?? '');
  const criteria = review.rubric.criteria?.items ?? [];

  const send = () => {
    const body = text.trim();
    if (body.length < 2) return toast.error('Write a reply first.');
    reply.mutate(
      { reviewId: review.id, teacherReply: body },
      {
        onSuccess: () => {
          toast.success('Reply sent to the supervisor');
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal open size="md" title={`${review.class.course.name} · ${formatDate(review.class.startsAt)}`} description={review.rubric.name} onClose={onClose}>
      <dl className="mb-4 space-y-1.5">
        {criteria.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-ink-2">{c.label}</dt>
            <dd className="font-semibold tabular-nums text-ink">{review.scores[c.key] ?? '—'} / 5</dd>
          </div>
        ))}
      </dl>
      {review.feedback && (
        <div className="mb-4 rounded-xl bg-sand/60 p-3 text-sm text-ink-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Supervisor feedback</p>
          {review.feedback}
        </div>
      )}
      <Field label="Your reply" htmlFor="qa-reply">
        <TextArea id="qa-reply" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <UiButton variant="ghost" onClick={onClose}>
          Close
        </UiButton>
        <UiButton onClick={send} loading={reply.isPending}>
          {review.teacherReply ? 'Update reply' : 'Send reply'}
        </UiButton>
      </div>
    </Modal>
  );
}

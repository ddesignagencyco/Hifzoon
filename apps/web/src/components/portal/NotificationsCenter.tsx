'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks';
import { PortalKey } from '@/lib/portal/nav';
import { hrefForNotification } from '@/lib/portal/notification-links';
import {
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  QueryState,
  TextInput,
  UiButton,
  Badge,
  StatusBadge,
  formatDateTime,
  humanize,
  EmptyState,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useNotificationPreferences,
  useNotifications,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotifications';
import {
  describeNotification,
  NotificationPreferences,
  toHHmm,
} from '@/lib/api/modules/notifications';

/** Notification inbox + channel/quiet-hour preferences (FR-NTF-01, FR-NTF-02, FR-NTF-04). */
const PAGE_SIZE = 20;

export function NotificationsCenter({ portal, description }: { portal: PortalKey; description?: string }) {
  const [page, setPage] = useState(1);
  const list = useNotifications(page, PAGE_SIZE);
  const { currentUser } = useAuth();
  const roles = currentUser?.roles ?? [];

  return (
    <>
      <PageHeader
        title="Notifications"
        description={description ?? 'Class reminders, lesson cards and messages sent to you.'}
      />
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <Card>
          <CardHeader
            title="Inbox"
            description={
              list.data ? `${list.data.meta.total} notification${list.data.meta.total === 1 ? '' : 's'}` : undefined
            }
          />
          <CardBody>
            <QueryState
              query={list}
              isEmpty={(d) => d.items.length === 0}
              empty={
                <EmptyState
                  title="No notifications yet"
                  description="Reminders and updates will appear here."
                />
              }
            >
              {(data) => (
                <>
                  <ul className="divide-y divide-line">
                    {data.items.map((n) => {
                      const { title, body } = describeNotification(n);
                      const href = hrefForNotification(n, portal, roles);
                      return (
                        <li key={n.id} className="py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">
                              {href ? (
                                <Link href={href} className="hover:underline text-green-800">
                                  {title}
                                </Link>
                              ) : (
                                title
                              )}
                            </p>
                            {body && (
                              <p className="text-xs text-muted mt-0.5 line-clamp-3">{body}</p>
                            )}
                            <p className="text-[11px] text-muted mt-1">
                              {formatDateTime(n.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge>{humanize(n.channel)}</Badge>
                            {/* DELIVERED / READ are confirmed by the provider's webhook. */}
                            <StatusBadge status={n.status} />
                            {n.sentAt && n.channel !== 'IN_APP' && (
                              <span className="text-[11px] text-muted">Sent {formatDateTime(n.sentAt)}</span>
                            )}
                            {n.failureReason && (n.status === 'FAILED' || n.status === 'SKIPPED') && (
                              <span className="text-[11px] text-muted max-w-[14rem] text-right">{n.failureReason}</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {data.meta.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <UiButton size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Previous
                      </UiButton>
                      <span className="text-xs text-muted">
                        Page {data.meta.page} of {data.meta.totalPages}
                      </span>
                      <UiButton size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </UiButton>
                    </div>
                  )}
                </>
              )}
            </QueryState>
          </CardBody>
        </Card>
        <PreferencesCard />
      </div>
    </>
  );
}

function PreferencesCard() {
  const prefs = useNotificationPreferences();

  return (
    <Card>
      <CardHeader
        title="Delivery preferences"
        description="Safeguarding alerts always come through, even in quiet hours."
      />
      <CardBody>
        {prefs.isLoading ? (
          <LoadingState />
        ) : prefs.isError || !prefs.data ? (
          <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
        ) : (
          // Keyed so the form re-initialises whenever the server copy changes.
          <PreferencesForm key={JSON.stringify(prefs.data)} initial={prefs.data} />
        )}
      </CardBody>
    </Card>
  );
}

function PreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const update = useUpdateNotificationPreferences();
  const toast = useToast();
  const [form, setForm] = useState({
    email: initial.email,
    whatsapp: initial.whatsapp,
    push: initial.push,
    quietFrom: toHHmm(initial.quietFrom),
    quietTo: toHHmm(initial.quietTo),
  });

  const quietInvalid = Boolean(form.quietFrom) !== Boolean(form.quietTo);
  const [attempted, setAttempted] = useState(false);
  const quietError = attempted && quietInvalid ? 'Set both a start and an end time for quiet hours.' : null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (quietInvalid) return toast.error('Set both a start and an end time for quiet hours.');
    update.mutate(
      {
        email: form.email,
        whatsapp: form.whatsapp,
        push: form.push,
        ...(form.quietFrom && form.quietTo
          ? { quietFrom: form.quietFrom, quietTo: form.quietTo }
          : {}),
      },
      {
        onSuccess: () => toast.success('Notification preferences saved'),
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Checkbox
        id="pref-email"
        label="Email"
        checked={form.email}
        onChange={(v) => setForm((f) => ({ ...f, email: v }))}
      />
      <Checkbox
        id="pref-whatsapp"
        label="WhatsApp"
        checked={form.whatsapp}
        onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))}
      />
      <Checkbox
        id="pref-push"
        label="Mobile app push (in-app inbox is always on)"
        checked={form.push}
        onChange={(v) => setForm((f) => ({ ...f, push: v }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quiet from" htmlFor="quiet-from" error={quietError && !form.quietFrom ? quietError : null}>
          <TextInput
            id="quiet-from"
            type="time"
            value={form.quietFrom}
            onChange={(e) => setForm((f) => ({ ...f, quietFrom: e.target.value }))}
          />
        </Field>
        <Field label="Quiet to" htmlFor="quiet-to" error={quietError && !form.quietTo ? quietError : null}>
          <TextInput
            id="quiet-to"
            type="time"
            value={form.quietTo}
            onChange={(e) => setForm((f) => ({ ...f, quietTo: e.target.value }))}
          />
        </Field>
      </div>
      <UiButton type="submit" loading={update.isPending} className="w-full">
        Save preferences
      </UiButton>
    </form>
  );
}

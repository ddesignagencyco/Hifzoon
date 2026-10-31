'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Modal,
  QueryState,
  StatusBadge,
  UiButton,
  formatDate,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { http } from '@/lib/api/http';
import { familySchedulingApi, type OpenSlot } from '@/lib/api/modules/scheduling-family';
import { cn } from '@/lib/utils';

/** `GET /scheduling/makeup-credits` row (M67). */
export interface MakeupCredit {
  id: string;
  status: 'AVAILABLE' | 'USED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  student: { id: string; displayName: string };
  family: { id: string; name: string };
  sourceClass: {
    id: string;
    startsAt: string;
    endsAt: string;
    teacherId: string;
    course: { id: string; name: string };
    teacher: { user: { name: string } };
  } | null;
  usedClass: { id: string; startsAt: string } | null;
}

const KEY = ['makeup-credits'] as const;

/**
 * Parent → Timetable: a class cancelled in good time earns a make-up credit. The family
 * books it into one of the same teacher's open times before the credit expires (M67).
 */
export function MakeupCredits({ zone }: { zone: string }) {
  const credits = useQuery({ queryKey: KEY, queryFn: () => http.get<MakeupCredit[]>('/scheduling/makeup-credits') });
  const [booking, setBooking] = useState<MakeupCredit | null>(null);
  const available = (credits.data ?? []).filter((c) => c.status === 'AVAILABLE').length;

  if (!credits.isLoading && (credits.data ?? []).length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader
        title="Make-up credits"
        description={
          available > 0
            ? `${available} make-up class${available === 1 ? '' : 'es'} to book. A class cancelled in good time earns one.`
            : 'A class cancelled in good time earns a make-up class.'
        }
      />
      <CardBody className="pt-0">
        <QueryState query={credits} empty={<EmptyState title="No make-up credits" />}>
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(c) => c.id}
              columns={[
                { key: 'child', header: 'Child', render: (c) => <span className="font-medium text-ink">{c.student.displayName}</span> },
                {
                  key: 'missed',
                  header: 'Missed class',
                  render: (c) =>
                    c.sourceClass ? `${c.sourceClass.course.name} · ${formatDateTime(c.sourceClass.startsAt)}` : '—',
                },
                { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} />, sortValue: (c) => c.status },
                {
                  key: 'expires',
                  header: 'Use by',
                  sortValue: (c) => c.expiresAt,
                  render: (c) => (c.status === 'USED' && c.usedClass ? `Booked ${formatDateTime(c.usedClass.startsAt)}` : formatDate(c.expiresAt)),
                },
                {
                  key: 'book',
                  header: <span className="sr-only">Book</span>,
                  sortable: false,
                  className: 'text-right',
                  render: (c) =>
                    c.status === 'AVAILABLE' && c.sourceClass ? (
                      <UiButton size="sm" onClick={() => setBooking(c)}>
                        Book make-up
                      </UiButton>
                    ) : null,
                },
              ]}
            />
          )}
        </QueryState>
      </CardBody>
      {booking && <BookMakeup key={booking.id} credit={booking} zone={zone} onClose={() => setBooking(null)} />}
    </Card>
  );
}

function BookMakeup({ credit, zone, onClose }: { credit: MakeupCredit; zone: string; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const source = credit.sourceClass!;
  const minutes = Math.max(15, Math.round((Date.parse(source.endsAt) - Date.parse(source.startsAt)) / 60_000));
  const [range] = useState(() => {
    const from = new Date(Date.now() + 2 * 3_600_000);
    const latest = Math.min(Date.parse(credit.expiresAt), Date.now() + 21 * 86_400_000);
    return { from: from.toISOString(), to: new Date(latest).toISOString() };
  });
  const slots = useQuery({
    queryKey: ['makeup-slots', credit.id],
    queryFn: () =>
      familySchedulingApi.openSlots({
        ...range,
        visitorZone: zone,
        durationMinutes: minutes,
        courseId: source.course.id,
        teacherId: source.teacherId,
        limit: 60,
      }),
  });
  const [picked, setPicked] = useState<OpenSlot | null>(null);
  const byDay = useMemo(() => {
    const groups = new Map<string, OpenSlot[]>();
    for (const s of slots.data ?? []) {
      const day = new Date(s.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone });
      groups.set(day, [...(groups.get(day) ?? []), s]);
    }
    return [...groups];
  }, [slots.data, zone]);

  const book = useMutation({
    mutationFn: (slot: OpenSlot) =>
      http.post<{ classId: string }>(`/scheduling/makeup-credits/${encodeURIComponent(credit.id)}/redeem`, {
        startsAt: slot.startsAt,
        teacherId: slot.teacherId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      // The booked make-up shows up in the timetable straight away.
      queryClient.invalidateQueries({ queryKey: ['parent', 'schedule'] });
      toast.success('Make-up class booked');
      onClose();
    },
    onError: (err) => toast.error(err),
  });

  return (
    <Modal
      open
      size="md"
      title={`Book a make-up for ${credit.student.displayName}`}
      description={`${source.course.name} with ${source.teacher.user.name} · ${minutes} min · use by ${formatDate(credit.expiresAt)}`}
      onClose={onClose}
    >
      <QueryState
        query={slots}
        loadingLabel="Finding open times…"
        empty={<EmptyState icon={<Ticket className="h-5 w-5" aria-hidden />} title="No open times before the credit expires" description="Message the academy and they will find a time." />}
      >
        {() => (
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {byDay.map(([day, list]) => (
              <div key={day}>
                <p className="mb-1.5 text-xs font-semibold text-ink">{day}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setPicked(s)}
                      aria-pressed={picked?.startsAt === s.startsAt}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs tabular-nums transition',
                        picked?.startsAt === s.startsAt ? 'border-green-800 bg-green-800 text-white' : 'border-line bg-white text-ink hover:border-gold',
                      )}
                    >
                      {new Date(s.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: zone })}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryState>
      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
        <UiButton variant="ghost" onClick={onClose}>
          Cancel
        </UiButton>
        <UiButton disabled={!picked} loading={book.isPending} onClick={() => picked && book.mutate(picked)}>
          Book this time
        </UiButton>
      </div>
    </Modal>
  );
}

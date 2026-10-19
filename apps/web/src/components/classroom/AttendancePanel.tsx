'use client';

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Badge, EmptyState, Modal, QueryState, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useClassroomAttendance, useCloseAttendance } from '@/hooks/useClassroom';
import { participantRoleLabel } from '@/lib/api/modules/classroom';

/** Attendance list + close (FR-CLS-14). Teacher / supervisor / admin only. */
export function AttendancePanel({ classId }: { classId: string }) {
  const attendance = useClassroomAttendance(classId);
  const close = useCloseAttendance(classId);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const doClose = () =>
    close.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(r.closed === 0 ? 'No open attendance rows to close' : `Closed ${r.closed} attendance record(s)`);
        setConfirming(false);
      },
      onError: (e) => toast.error(e),
    });

  return (
    <div className="space-y-3">
      <QueryState
        query={attendance}
        isEmpty={(d) => d.participants.length === 0}
        empty={
          <EmptyState
            title="Nobody recorded yet"
            description="Attendance is recorded when participants connect to the live room."
          />
        }
      >
        {(data) => (
          <>
            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-sand px-2 py-2">
                <dt className="text-[11px] text-muted">Students present</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">{data.summary.studentsPresent}</dd>
              </div>
              <div className="rounded-xl bg-sand px-2 py-2">
                <dt className="text-[11px] text-muted">Avg. minutes</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">{data.summary.averageMinutes}</dd>
              </div>
              <div className="rounded-xl bg-sand px-2 py-2">
                <dt className="text-[11px] text-muted">Guardians watching</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">{data.summary.guardiansPresent}</dd>
              </div>
              <div className="rounded-xl bg-sand px-2 py-2">
                <dt className="text-[11px] text-muted">Still connected</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">{data.summary.stillConnected}</dd>
              </div>
            </dl>
            <ul className="divide-y divide-line" aria-label="Attendance">
              {data.participants.map((p) => (
                <li key={p.id} className="py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{p.student?.displayName ?? p.user.name}</p>
                    <p className="text-[11px] text-muted">
                      {participantRoleLabel(p.role)} · joined {formatDateTime(p.joinedAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-ink tabular-nums">{p.minutesPresent} min</p>
                    {p.leftAt ? <Badge>Left</Badge> : <Badge tone="green">Connected</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>
      <UiButton
        variant="secondary"
        size="sm"
        icon={<LogOut className="w-3.5 h-3.5" aria-hidden />}
        onClick={() => setConfirming(true)}
        className="w-full"
      >
        Close attendance
      </UiButton>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Close attendance?"
        description="Everyone still connected is marked as left now and their minutes are banked. Use this when the class has ended."
        size="sm"
        footer={
          <>
            <UiButton variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </UiButton>
            <UiButton onClick={doClose} loading={close.isPending}>
              Close attendance
            </UiButton>
          </>
        }
      >
        <p className="text-sm text-ink-2">This does not end the video room.</p>
      </Modal>
    </div>
  );
}

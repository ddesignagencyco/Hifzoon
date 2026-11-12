'use client';

import React, { useState } from 'react';
import { Pause, Pencil, Play, Square } from 'lucide-react';
import { Alert, Field, Modal, Select, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMyPermissions } from '@/hooks/usePermissions';
import { useScheduleActions } from '@/hooks/useSchedulingExtras';
import { RRuleWeekday, RoomType, ScheduleDetail, WEEKDAYS, buildRRule, HHMM_RE } from '@/lib/api/modules/scheduling-admin';
import { ConfirmDialog } from '../system/shared';
import { cn } from '@/lib/utils';

const WARN = 'Upcoming classes nobody has started are removed and rebuilt. A class a family moved by hand in that range goes back to its normal slot. Families are not notified automatically.';

/** Edit / pause / resume / end for a recurring schedule (permission: scheduling.schedule.manage). */
export function ScheduleActions({ schedule }: { schedule: ScheduleDetail }) {
  const { can } = useMyPermissions();
  const toast = useToast();
  const act = useScheduleActions();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'pause' | 'end' | null>(null);
  if (!can('scheduling.schedule.manage')) return null;
  const ended = schedule.status === 'ENDED';

  const run = (kind: 'pause' | 'resume' | 'end', ok: string) =>
    act.mutate({ kind, id: schedule.id }, { onSuccess: () => { toast.success(ok); setConfirm(null); }, onError: (e) => { toast.error(e); setConfirm(null); } });

  return (
    <div className="flex flex-wrap gap-2">
      {ended ? <p className="text-xs text-muted">This schedule has ended and cannot be changed.</p> : (
        <>
          <UiButton size="sm" variant="secondary" icon={<Pencil className="w-3.5 h-3.5" aria-hidden />} onClick={() => setEditing(true)}>Edit pattern</UiButton>
          {schedule.status === 'PAUSED'
            ? <UiButton size="sm" variant="secondary" icon={<Play className="w-3.5 h-3.5" aria-hidden />} loading={act.isPending} onClick={() => run('resume', 'Schedule resumed')}>Resume</UiButton>
            : <UiButton size="sm" variant="secondary" icon={<Pause className="w-3.5 h-3.5" aria-hidden />} onClick={() => setConfirm('pause')}>Pause</UiButton>}
          <UiButton size="sm" variant="danger" icon={<Square className="w-3.5 h-3.5" aria-hidden />} onClick={() => setConfirm('end')}>End</UiButton>
        </>
      )}
      <ConfirmDialog open={confirm === 'pause'} title="Pause this schedule?" description="Upcoming unstarted classes are removed until you resume. Past and started classes are kept." confirmLabel="Pause" tone="primary" pending={act.isPending} onClose={() => setConfirm(null)} onConfirm={() => run('pause', 'Schedule paused')} />
      <ConfirmDialog open={confirm === 'end'} title="End this schedule?" description="Upcoming unstarted classes are removed and no more are created. This cannot be undone." confirmLabel="End schedule" pending={act.isPending} onClose={() => setConfirm(null)} onConfirm={() => run('end', 'Schedule ended')} />
      {editing && <EditModal schedule={schedule} onClose={() => setEditing(false)} />}
    </div>
  );
}

function parseDays(rrule: string): RRuleWeekday[] {
  const by = /BYDAY=([^;]+)/i.exec(rrule)?.[1];
  return by ? (by.split(',').map((d) => d.trim().toUpperCase()).filter((d) => WEEKDAYS.some((w) => w.code === d)) as RRuleWeekday[]) : [];
}

function EditModal({ schedule, onClose }: { schedule: ScheduleDetail; onClose: () => void }) {
  const toast = useToast();
  const act = useScheduleActions();
  const weekly = /FREQ=WEEKLY/i.test(schedule.rrule);
  const [days, setDays] = useState<RRuleWeekday[]>(parseDays(schedule.rrule));
  const [time, setTime] = useState(schedule.localStartTime.includes('T') ? schedule.localStartTime.slice(11, 16) : schedule.localStartTime.slice(0, 5));
  const [duration, setDuration] = useState(String(schedule.durationMinutes));
  const [room, setRoom] = useState<RoomType>(schedule.roomType);
  const [endsOn, setEndsOn] = useState(schedule.endsOn ? schedule.endsOn.slice(0, 10) : '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!HHMM_RE.test(time)) return toast.error('Time must look like 16:30.');
    const d = Number(duration);
    if (!Number.isInteger(d) || d < 10 || d > 180) return toast.error('Length must be 10 to 180 minutes.');
    if (weekly && days.length === 0) return toast.error('Pick at least one weekday.');
    const body: Parameters<typeof act.mutate>[0] = { kind: 'update', id: schedule.id, body: {
      localStartTime: time, durationMinutes: d, roomType: room, endsOn: endsOn || null,
      // The pattern is only rewritten for plain weekly schedules; anything else keeps its rule.
      ...(weekly ? { rrule: buildRRule({ freq: 'WEEKLY', interval: Number(/INTERVAL=(\d+)/i.exec(schedule.rrule)?.[1] ?? 1), byDay: days, end: { kind: 'never' } }) } : {}),
    } };
    act.mutate(body, { onSuccess: () => { toast.success('Schedule updated'); onClose(); }, onError: (err) => toast.error(err) });
  };

  return (
    <Modal open onClose={() => (act.isPending ? undefined : onClose())} title="Edit recurring schedule" size="md">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Edit schedule">
        <Alert tone="warning">{WARN}</Alert>
        {weekly && (
          <div>
            <p className="text-xs font-semibold text-ink-2 mb-1">Weekdays</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => {
                const on = days.includes(w.code);
                return <button key={w.code} type="button" aria-pressed={on} onClick={() => setDays((d) => (on ? d.filter((x) => x !== w.code) : [...d, w.code]))}
                  className={cn('h-8 rounded-full border px-3 text-xs font-semibold cursor-pointer', on ? 'bg-green-800 text-white border-green-800' : 'bg-white border-line hover:bg-sand')}>{w.short}</button>;
              })}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Start time (${schedule.familyTimeZone})`} htmlFor="se-time"><TextInput id="se-time" value={time} placeholder="16:30" onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Length (minutes)" htmlFor="se-dur"><TextInput id="se-dur" type="number" min={10} max={180} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
          <Field label="Room" htmlFor="se-room"><Select id="se-room" value={room} onChange={(e) => setRoom(e.target.value as RoomType)}><option value="ONE_TO_ONE">One to one</option><option value="CIRCLE">Circle</option></Select></Field>
          <Field label="Ends on (blank = no end)" htmlFor="se-end"><TextInput id="se-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><UiButton variant="secondary" onClick={onClose} disabled={act.isPending}>Cancel</UiButton><UiButton type="submit" loading={act.isPending}>Save and rebuild</UiButton></div>
      </form>
    </Modal>
  );
}

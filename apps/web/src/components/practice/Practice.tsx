'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, Square, Timer } from 'lucide-react';
import {
  Alert,
  Badge,
  EmptyState,
  Field,
  Modal,
  QueryState,
  Select,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAssignPractice, useLogPractice, usePracticeAssignments, usePracticeSessions } from '@/hooks/usePractice';
import {
  passageLabel,
  PracticeAssignment,
  PracticeMode,
  PracticeStatus,
  uploadPracticeAudio,
} from '@/lib/api/modules/practice';

const STATUS_LABEL: Record<PracticeStatus, string> = {
  ASSIGNED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Done',
  EXPIRED: 'Expired',
};

const MODE_LABEL: Record<PracticeMode, string> = {
  READING: 'Reading',
  MEMORISATION: 'Memorisation',
};

function StatusPill({ a }: { a: PracticeAssignment }) {
  if (a.overdue) return <Badge tone="red">Overdue</Badge>;
  const tone = a.status === 'COMPLETED' ? 'green' : a.status === 'IN_PROGRESS' ? 'amber' : 'neutral';
  return <Badge tone={tone}>{STATUS_LABEL[a.status]}</Badge>;
}

function Progress({ done, target }: { done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / Math.max(1, target)) * 100));
  return (
    <div className="space-y-1">
      <div className="h-1.5 rounded-full bg-line/60 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-green-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted tabular-nums">
        {done} of {target} min
      </p>
    </div>
  );
}

/**
 * Practice assignments for a student (or, with no `studentId`, every one the viewer may
 * see). `practiceHref` turns each row into a link to the student's practice page.
 */
export function PracticeList({
  studentId,
  practiceHref,
  showStudent = false,
}: {
  studentId?: string;
  practiceHref?: (assignment: PracticeAssignment) => string;
  showStudent?: boolean;
}) {
  const list = usePracticeAssignments({ studentId });
  const [open, setOpen] = useState<PracticeAssignment | null>(null);

  return (
    <>
      <QueryState
        query={list}
        loadingLabel="Loading practice…"
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState icon={<Timer className="w-5 h-5" aria-hidden />} title="No practice set yet" description="The teacher sets practice between classes." />}
      >
        {(rows) => (
          <ul className="divide-y divide-line/60">
            {rows.map((a) => (
              <li key={a.id} className="py-3 grid sm:grid-cols-[1fr_160px_auto] gap-3 items-center">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-ink">
                    {showStudent && <span>{a.student.displayName} · </span>}
                    Surah {passageLabel(a)} · {MODE_LABEL[a.mode]}
                  </p>
                  <p className="text-[11px] text-muted">
                    Set by {a.teacher.user.name} · {a.dueOn ? `due ${formatDate(a.dueOn, { timeZone: 'UTC' })}` : 'no due date'}
                    {a.lastPractisedAt ? ` · last practised ${formatDateTime(a.lastPractisedAt)}` : ''}
                  </p>
                  <StatusPill a={a} />
                </div>
                <Progress done={a.minutesDone} target={a.targetMinutes} />
                <div className="flex gap-2 sm:justify-end">
                  {practiceHref && a.status !== 'EXPIRED' && (
                    <Link
                      href={practiceHref(a)}
                      className="inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold bg-green-800 text-white hover:bg-green-900"
                    >
                      Practise
                    </Link>
                  )}
                  <UiButton size="sm" variant="secondary" onClick={() => setOpen(a)} disabled={a.sessionCount === 0}>
                    Sessions ({a.sessionCount})
                  </UiButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {open && <SessionsModal assignment={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function SessionsModal({ assignment, onClose }: { assignment: PracticeAssignment; onClose: () => void }) {
  const sessions = usePracticeSessions(assignment.id);
  return (
    <Modal open onClose={onClose} title={`Practice: Surah ${passageLabel(assignment)}`} size="lg">
      <QueryState query={sessions} loadingLabel="Loading sessions…" isEmpty={(rows) => rows.length === 0} empty={<EmptyState title="No sessions yet" />}>
        {(rows) => (
          <ul className="divide-y divide-line/60">
            {rows.map((s) => (
              <li key={s.id} className="py-3 space-y-2">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{formatDateTime(s.startedAt)}</span> · {s.minutes} min
                </p>
                {s.audioUrl ? (
                  <>
                    <audio controls preload="none" src={s.audioUrl} className="w-full" />
                    {s.audioDeleteAfter && <p className="text-[11px] text-muted">Recording kept until {formatDate(s.audioDeleteAfter)}.</p>}
                  </>
                ) : (
                  <p className="text-[11px] text-muted">No recording.</p>
                )}
                {s.resultSummary?.scored === false && <p className="text-[11px] text-muted">{s.resultSummary.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Modal>
  );
}

interface AssignDraft {
  fromSurah: string;
  fromAyah: string;
  toSurah: string;
  toAyah: string;
  mode: PracticeMode;
  targetMinutes: string;
  dueOn: string;
}

const EMPTY_DRAFT: AssignDraft = { fromSurah: '', fromAyah: '1', toSurah: '', toAyah: '', mode: 'MEMORISATION', targetMinutes: '30', dueOn: '' };

function draftProblem(d: AssignDraft): string | null {
  const n = (v: string) => Number(v);
  const whole = (v: string) => v !== '' && Number.isInteger(n(v));
  if (![d.fromSurah, d.fromAyah, d.toSurah, d.toAyah, d.targetMinutes].every(whole)) return 'Fill in every number.';
  if ([d.fromSurah, d.toSurah].some((s) => n(s) < 1 || n(s) > 114)) return 'Surahs are numbered 1 to 114.';
  if (n(d.fromAyah) < 1 || n(d.toAyah) < 1) return 'Ayahs start at 1.';
  if (n(d.toSurah) * 1000 + n(d.toAyah) < n(d.fromSurah) * 1000 + n(d.fromAyah)) return 'The passage ends before it starts.';
  if (n(d.targetMinutes) < 5 || n(d.targetMinutes) > 600) return 'Set between 5 and 600 minutes.';
  return null;
}

/** Teacher: set practice for one of their students. */
export function AssignPracticeButton({ studentId, studentName }: { studentId: string; studentName?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AssignDraft>(EMPTY_DRAFT);
  const assign = useAssignPractice();
  const toast = useToast();
  const set = (patch: Partial<AssignDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const today = new Date().toISOString().slice(0, 10);

  const submit = () => {
    const problem = draftProblem(draft);
    if (problem) return toast.error(problem);
    assign.mutate(
      {
        studentId,
        fromSurah: Number(draft.fromSurah),
        fromAyah: Number(draft.fromAyah),
        toSurah: Number(draft.toSurah),
        toAyah: Number(draft.toAyah),
        mode: draft.mode,
        targetMinutes: Number(draft.targetMinutes),
        ...(draft.dueOn ? { dueOn: draft.dueOn } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Practice set. The family has been told.');
          setOpen(false);
          setDraft(EMPTY_DRAFT);
        },
        onError: (e) => toast.error(e),
      },
    );
  };

  return (
    <>
      <UiButton size="sm" onClick={() => setOpen(true)} icon={<Timer className="w-3.5 h-3.5" aria-hidden />}>
        Set practice
      </UiButton>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={studentName ? `Set practice for ${studentName}` : 'Set practice'}
        description="The student and family are told, and the minutes count towards it as they practise."
        footer={
          <>
            <UiButton variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </UiButton>
            <UiButton onClick={submit} loading={assign.isPending}>
              Set practice
            </UiButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['fromSurah', 'From surah', 114],
                ['fromAyah', 'From ayah', 286],
                ['toSurah', 'To surah', 114],
                ['toAyah', 'To ayah', 286],
              ] as const
            ).map(([field, label, max]) => (
              <Field key={field} label={label} htmlFor={`practice-${field}`} required>
                <TextInput
                  id={`practice-${field}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={max}
                  value={draft[field]}
                  onChange={(e) => set({ [field]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Kind" htmlFor="practice-mode">
              <Select id="practice-mode" value={draft.mode} onChange={(e) => set({ mode: e.target.value as PracticeMode })}>
                <option value="MEMORISATION">Memorisation</option>
                <option value="READING">Reading</option>
              </Select>
            </Field>
            <Field label="Minutes in all" htmlFor="practice-minutes" required>
              <TextInput id="practice-minutes" type="number" inputMode="numeric" min={5} max={600} value={draft.targetMinutes} onChange={(e) => set({ targetMinutes: e.target.value })} />
            </Field>
            <Field label="Due" htmlFor="practice-due" hint="Optional">
              <TextInput id="practice-due" type="date" min={today} value={draft.dueOn} onChange={(e) => set({ dueOn: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

type RecorderState = 'idle' | 'recording' | 'recorded';

/**
 * Student: practise against one assignment. Recording is optional — the minutes count either
 * way — and is kept only while a guardian's voice consent stands (the API refuses otherwise).
 */
export function PracticeRecorder({ assignment }: { assignment: PracticeAssignment }) {
  const toast = useToast();
  const log = useLogPractice();
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [manualMinutes, setManualMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const canRecord = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);
  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudio(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }));
        setState('recorded');
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setState('recording');
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error('The microphone could not be opened. Allow it in the browser, or log your minutes below.');
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stop();
  };

  const finish = async (minutes: number, recording: Blob | null) => {
    setSaving(true);
    try {
      const audioKey = recording ? await uploadPracticeAudio(assignment.id, recording) : undefined;
      const result = await log.mutateAsync({ assignmentId: assignment.id, minutes, audioKey });
      toast.success(result.assignmentStatus === 'COMPLETED' ? 'Well done — this practice is complete.' : `Saved. ${result.minutesDone} of ${assignment.targetMinutes} min done.`);
      setAudio(null);
      setState('idle');
      setSeconds(0);
      setManualMinutes('');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const recordedMinutes = Math.max(1, Math.round(seconds / 60));
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      {canRecord ? (
        <div className="rounded-xl border border-line p-4 space-y-3">
          <p className="text-sm font-semibold text-ink">Record your recitation</p>
          <p className="text-xs text-muted">Your teacher can listen to it. Recordings are deleted after 30 days.</p>
          <div className="flex items-center gap-3">
            {state === 'recording' ? (
              <UiButton variant="danger" onClick={stop} icon={<Square className="w-4 h-4" aria-hidden />}>
                Stop
              </UiButton>
            ) : (
              <UiButton onClick={start} disabled={saving} icon={<Mic className="w-4 h-4" aria-hidden />}>
                {state === 'recorded' ? 'Record again' : 'Start recording'}
              </UiButton>
            )}
            <span className="text-sm tabular-nums text-ink-2" aria-live="polite">
              {mmss}
            </span>
          </div>
          {state === 'recorded' && audio && audioUrl && (
            <div className="space-y-3">
              <audio controls src={audioUrl} className="w-full" />
              <UiButton onClick={() => finish(recordedMinutes, audio)} loading={saving}>
                Save {recordedMinutes} min with recording
              </UiButton>
            </div>
          )}
        </div>
      ) : (
        <Alert tone="warning">This browser cannot record audio. You can still log your practice minutes.</Alert>
      )}

      <div className="rounded-xl border border-line p-4 space-y-3">
        <p className="text-sm font-semibold text-ink">Or log minutes without a recording</p>
        <div className="flex items-end gap-3">
          <Field label="Minutes" htmlFor="practice-manual-minutes" className="w-32">
            <TextInput id="practice-manual-minutes" type="number" inputMode="numeric" min={1} max={180} value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} />
          </Field>
          <UiButton
            variant="secondary"
            loading={saving}
            onClick={() => {
              const m = Number(manualMinutes);
              if (!Number.isInteger(m) || m < 1 || m > 180) return toast.error('Enter between 1 and 180 minutes.');
              void finish(m, null);
            }}
          >
            Log minutes
          </UiButton>
        </div>
      </div>
    </div>
  );
}

/** One assignment: what to practise, progress, the recorder and past sessions. */
export function PracticeScreen({ assignmentId, backHref, backLabel }: { assignmentId: string; backHref: string; backLabel: string }) {
  const list = usePracticeAssignments();
  const sessions = usePracticeSessions(assignmentId);
  return (
    <>
      <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink mb-3">
        ← {backLabel}
      </Link>
      <QueryState query={list} loadingLabel="Loading practice…">
        {(rows) => {
          const a = rows.find((r) => r.id === assignmentId);
          if (!a) return <EmptyState title="Practice not found" description="It may have been removed, or it belongs to another student." />;
          return (
            <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
              <div className="space-y-4">
                <div>
                  <h1 className="text-xl font-semibold text-ink">
                    Surah {passageLabel(a)} · {MODE_LABEL[a.mode]}
                  </h1>
                  <p className="text-xs text-muted mt-1">
                    Set by {a.teacher.user.name} for {a.student.displayName} · {a.dueOn ? `due ${formatDate(a.dueOn, { timeZone: 'UTC' })}` : 'no due date'}
                  </p>
                  <div className="mt-3 max-w-xs">
                    <Progress done={a.minutesDone} target={a.targetMinutes} />
                  </div>
                </div>
                {a.status === 'EXPIRED' ? <Alert tone="warning">This practice has expired.</Alert> : <PracticeRecorder assignment={a} />}
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="text-sm font-semibold text-ink mb-2">Past sessions</p>
                <QueryState query={sessions} isEmpty={(r) => r.length === 0} empty={<p className="text-xs text-muted">None yet.</p>}>
                  {(rs) => (
                    <ul className="divide-y divide-line/60">
                      {rs.map((s) => (
                        <li key={s.id} className="py-2 text-xs text-ink-2">
                          {formatDateTime(s.startedAt)} · {s.minutes} min{s.hasAudio ? ' · recorded' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </QueryState>
              </div>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

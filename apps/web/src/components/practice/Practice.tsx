'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Mic,
  Pause,
  Play,
  Repeat,
  Send,
  Square,
  Timer,
  Volume2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  DataTable,
  EmptyState,
  Field,
  Modal,
  QueryState,
  Select,
  TextArea,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
  type Column,
} from '@/components/ui/primitives';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import { useToast } from '@/components/ui/toast';
import {
  useAssignPractice,
  useLogPractice,
  usePracticeAssignments,
  usePracticeSession,
  usePracticeSessions,
  usePracticeToReview,
  useRecordingAllowed,
  useReferenceAudio,
  useReviewPracticeSession,
} from '@/hooks/usePractice';
import { ApiClientError } from '@/lib/api/http';
import { useMushafPageWords } from '@/hooks/useMushaf';
import { meaningTextProps } from '@/lib/api/modules/quran-public';
import {
  COURSE_MISTAKE_TYPES,
  MISTAKE_TYPE_LABELS,
  MISTAKE_TYPES,
  MistakeType,
  mistakeWhere,
} from '@/lib/api/modules/lessons';
import { boardForCourse } from '@/lib/data/lesson-boards';
import { BOARD_DEFAULT_MODE, NO_BOARD_AUDIO } from '@/lib/board-practice';
import { BoardPassage, BoardPracticeFields } from './BoardPractice';
import {
  passageAyahs,
  PracticeAssignment,
  PracticeBoard,
  PracticeMark,
  PracticeMode,
  PracticeReviewItem,
  PracticeReviewStatus,
  PracticeSessionRow,
  PracticeStatus,
  practiceRange,
  practiceSortValue,
  practiceTitle,
  ReviewMarkInput,
  recordingMinutes,
  sessionKind,
  sessionStatus,
  timerMinutes,
  uploadPracticeAudio,
} from '@/lib/api/modules/practice';
import { markPracticeSeen } from '@/lib/practice-seen';
import { OpenMistakesInPassage } from './OpenMistakesInPassage';

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

/** Same Quran face as the Mushaf viewer. */
const ARABIC: React.CSSProperties = {
  fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif",
};

/** Ayahs shown at once: enough to practise, few enough to load quickly. */
export const AYAHS_PER_PAGE = 10;

const TEACHER_COPY = 'Your teacher will listen and reply.';
const PREPARE_COPY = "Practise as often as you like. Your teacher doesn't review this part.";
export const CONSENT_MISSING_COPY =
  'A parent needs to allow practice recordings before you can send one to your teacher. Your teacher will hear you in the next class instead.';

/** Who is on the practice screen: a guardian can give the recording consent, a student asks. */
export type PracticeViewer = 'parent' | 'student';

type Meaning = 'off' | 'en' | 'ur';

const wordKey = (surah: number, ayah: number, index: number) => `${surah}:${ayah}:${index}`;

/** A word of the passage, or (board practice) the dua word / Qaida item, tapped in a review. */
type Picked =
  | { surah: number; ayah: number; wordIndex: number; text: string }
  | { itemRef: string; text: string };

/** One key per marked place: the item reference of a board mark, else the word. */
function markKey(m: { itemRef?: string; surah?: number; ayah?: number; wordIndex?: number }): string {
  return m.itemRef ?? wordKey(m.surah ?? 0, m.ayah ?? 0, m.wordIndex ?? 0);
}

/** "67:2 word 4", or the dua word / Qaida item. */
function markPlace(m: ReviewMarkInput): string {
  return m.itemRef ?? `${m.surah}:${m.ayah} word ${(m.wordIndex ?? 0) + 1}`;
}

/** ﴿١٢﴾: the ayah number in Arabic-Indic digits, as printed in the Mushaf. */
function ayahMark(n: number): string {
  const digits = String(n).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
  return `﴿${digits}﴾`;
}

// ── Passage ──────────────────────────────────────────────────────────────────

/**
 * The passage, ayah by ayah, in the Quran font, a page of ayahs at a time. Each ayah can be
 * heard from the licensed recitation (with repeat and speed). In "test myself" each word is a
 * blank pill until tapped; the teacher's review taps a word to mark it instead.
 */
export function PassageText({
  assignmentId,
  range,
  marks = [],
  hidden = false,
  revealed,
  onReveal,
  onWordClick,
  pending,
  meaning = 'off',
  audio = true,
}: {
  assignmentId?: string;
  range: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number };
  /** The teacher's marks, highlighted. */
  marks?: Array<Pick<PracticeMark, 'surah' | 'ayah' | 'wordIndex' | 'type'>>;
  /** Test myself: words are blank until revealed. */
  hidden?: boolean;
  revealed?: ReadonlySet<string>;
  onReveal?: (key: string) => void;
  /** Teacher review: a tap marks the word. */
  onWordClick?: (word: { surah: number; ayah: number; wordIndex: number; text: string }) => void;
  /** Words chosen in this review, not yet saved. */
  pending?: ReadonlySet<string>;
  meaning?: Meaning;
  audio?: boolean;
}) {
  const { ayahs, truncated } = useMemo(() => passageAyahs(range), [range]);
  const pages = Math.max(1, Math.ceil(ayahs.length / AYAHS_PER_PAGE));
  const [page, setPage] = useState(0);
  const shown = ayahs.slice(page * AYAHS_PER_PAGE, (page + 1) * AYAHS_PER_PAGE);
  const words = useMushafPageWords('MADANI_15', shown, true, meaning === 'off' ? null : meaning);

  const reference = useReferenceAudio(assignmentId ?? '', Boolean(assignmentId && audio));
  const urlOf = useMemo(
    () => new Map((reference.data?.ayahs ?? []).map((a) => [`${a.surah}:${a.ayah}`, a.url])),
    [reference.data],
  );
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<string | null>(null);
  const [speed, setSpeed] = useState('1');
  useEffect(() => {
    if (player.current) player.current.playbackRate = Number(speed);
  }, [speed]);

  const play = (key: string) => {
    const el = player.current;
    const url = urlOf.get(key);
    if (!el || !url) return;
    if (playing === key && !el.paused) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = url;
    el.playbackRate = Number(speed);
    setPlaying(key);
    // jsdom and some browsers return nothing or reject without a user gesture.
    void Promise.resolve(el.play?.()).catch(() => setPlaying(null));
  };

  const markOf = new Map(
    marks
      .filter((m) => m.surah !== null && m.ayah !== null && m.wordIndex !== null)
      .map((m) => [wordKey(m.surah as number, m.ayah as number, m.wordIndex as number), m]),
  );
  const meaningProps = meaning === 'off' ? null : meaningTextProps(meaning);
  const canHear = Boolean(assignmentId && audio && reference.data?.available);

  return (
    <div className="space-y-3">
      {canHear && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Volume2 className="w-4 h-4" aria-hidden />
          <span>Press play on an ayah to hear it recited.</span>
          <label htmlFor="practice-speed" className="ms-auto">
            Speed
          </label>
          <select
            id="practice-speed"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
          >
            {['0.75', '1', '1.25'].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>
      )}
      <audio
        ref={player}
        className="hidden"
        onEnded={() => {
          const el = player.current;
          if (el && playing && repeat === playing) {
            el.currentTime = 0;
            void Promise.resolve(el.play?.()).catch(() => setPlaying(null));
          } else setPlaying(null);
        }}
      />
      <ol className="space-y-3" aria-label="Passage">
        {shown.map((a, i) => {
          const q = words[i];
          const key = `${a.surah}:${a.ayah}`;
          const empty = q?.data && q.data.words.length === 0;
          return (
            <li
              key={key}
              className="rounded-xl border border-line/70 bg-white px-4 py-3"
              data-testid={`ayah-${key}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold text-muted tabular-nums">
                  {a.surah}:{a.ayah}
                </span>
                {canHear && urlOf.has(key) && (
                  <span className="ms-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => play(key)}
                      aria-label={`${playing === key ? 'Pause' : 'Play'} ayah ${key}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-50 text-green-800 hover:bg-green-100"
                    >
                      {playing === key ? (
                        <Pause className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <Play className="w-3.5 h-3.5" aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepeat((r) => (r === key ? null : key))}
                      aria-pressed={repeat === key}
                      aria-label={`Repeat ayah ${key}`}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                        repeat === key ? 'bg-green-800 text-white' : 'bg-sand text-ink-2'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </span>
                )}
              </div>
              {q?.data && !empty ? (
                <p dir="rtl" lang="ar" className="text-2xl leading-[2.6] text-ink" style={ARABIC}>
                  {q.data.words.map((w) => {
                    const k = wordKey(a.surah, a.ayah, w.index);
                    const mark = markOf.get(k);
                    const chosen = pending?.has(k);
                    const blank = hidden && !revealed?.has(k);
                    const meaningLine =
                      meaningProps && w.translation ? (
                        <span
                          className="block text-[11px] leading-tight text-muted mt-0.5"
                          {...meaningProps}
                        >
                          {w.translation}
                        </span>
                      ) : null;
                    if (blank) {
                      return (
                        <button
                          key={k}
                          type="button"
                          data-word={k}
                          aria-label="Hidden word, tap to show"
                          onClick={() => onReveal?.(k)}
                          className="inline-block align-middle mx-1 my-1 h-[1.1em] rounded-full bg-line/80 hover:bg-line"
                          style={{ width: `${Math.max(1.2, w.text.length * 0.42)}em` }}
                        />
                      );
                    }
                    const tone = chosen
                      ? 'bg-amber-200 text-amber-950 ring-2 ring-amber-500'
                      : mark
                        ? 'bg-red-100 text-red-900 underline decoration-red-500 decoration-2 underline-offset-8'
                        : '';
                    const label = mark ? (MISTAKE_TYPE_LABELS[mark.type] ?? mark.type) : null;
                    const body = (
                      <>
                        {w.text}
                        {meaningLine}
                      </>
                    );
                    if (onWordClick) {
                      return (
                        <button
                          key={k}
                          type="button"
                          data-word={k}
                          data-marked={mark ? mark.type : undefined}
                          aria-label={`${w.text}${label ? `, ${label}` : ''}${chosen ? ', chosen' : ''}`}
                          onClick={() =>
                            onWordClick({
                              surah: a.surah,
                              ayah: a.ayah,
                              wordIndex: w.index,
                              text: w.text,
                            })
                          }
                          className={`inline-block mx-0.5 rounded px-1 hover:bg-green-50 ${tone}`}
                        >
                          {body}
                        </button>
                      );
                    }
                    return mark ? (
                      <mark
                        key={k}
                        data-word={k}
                        data-marked={mark.type}
                        title={label ?? undefined}
                        aria-label={`${w.text}, ${label}`}
                        className={`inline-block mx-0.5 rounded px-1 ${tone}`}
                      >
                        {body}
                      </mark>
                    ) : (
                      <span key={k} data-word={k} className="inline-block mx-0.5">
                        {body}
                      </span>
                    );
                  })}
                  <span className="mx-1 text-green-800" aria-label={`ayah ${a.ayah}`}>
                    {ayahMark(a.ayah)}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted">
                  {q?.isError
                    ? 'The ayah text could not be loaded.'
                    : empty
                      ? 'The Quran text is not available on this server yet.'
                      : 'Loading the ayah…'}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <UiButton
            size="sm"
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            icon={<ChevronLeft className="w-3.5 h-3.5" aria-hidden />}
          >
            Previous
          </UiButton>
          <span className="tabular-nums">
            Ayahs {page * AYAHS_PER_PAGE + 1}–{page * AYAHS_PER_PAGE + shown.length} of{' '}
            {ayahs.length}
          </span>
          <UiButton
            size="sm"
            variant="secondary"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
            icon={<ChevronRight className="w-3.5 h-3.5" aria-hidden />}
          >
            Next
          </UiButton>
        </div>
      )}
      {truncated && (
        <p className="text-[11px] text-muted">
          The passage is long, so only its first {ayahs.length} ayahs are shown here.
        </p>
      )}
    </div>
  );
}

// ── Timer and recording ──────────────────────────────────────────────────────

type RecorderState = 'idle' | 'recording' | 'recorded';

/**
 * Step 1, Prepare. Student (or a guardian with a young child): a timer counts real practice
 * time while the screen is open and visible; Finish logs it, rounded up to whole minutes, with
 * no audio. These sessions count towards the target and are never sent to the teacher.
 * Typing the minutes is the fallback.
 */
export function PracticeTimer({
  assignment,
  revealsCount = 0,
  onLogged,
}: {
  assignment: PracticeAssignment;
  revealsCount?: number;
  onLogged?: () => void;
}) {
  const toast = useToast();
  const log = useLogPractice();
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');

  useEffect(() => {
    if (!running) return;
    // A hidden tab is not practice: the count waits until the screen is back.
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        setSeconds((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const save = async (minutes: number) => {
    setSaving(true);
    try {
      const result = await log.mutateAsync({ assignmentId: assignment.id, minutes, revealsCount });
      toast.success(
        result.assignmentStatus === 'COMPLETED'
          ? 'Well done, you have reached the practice minutes. Recite to your teacher when ready.'
          : `Practised ${minutes} min. ${result.minutesDone} of ${assignment.targetMinutes} min done.`,
      );
      setRunning(false);
      setSeconds(0);
      setManualMinutes('');
      onLogged?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="rounded-xl border border-line p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-ink me-auto">Practice timer</p>
        <span
          className="text-2xl font-semibold tabular-nums text-ink"
          aria-live="polite"
          aria-label={`Practice time ${mmss}`}
        >
          {mmss}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {running ? (
          <UiButton
            variant="secondary"
            onClick={() => setRunning(false)}
            icon={<Pause className="w-4 h-4" aria-hidden />}
          >
            Pause
          </UiButton>
        ) : (
          <UiButton
            onClick={() => setRunning(true)}
            icon={<Play className="w-4 h-4" aria-hidden />}
          >
            {seconds > 0 ? 'Resume' : 'Start'}
          </UiButton>
        )}
        <UiButton
          variant="secondary"
          disabled={seconds === 0}
          loading={saving}
          onClick={() => void save(timerMinutes(seconds))}
          icon={<Square className="w-4 h-4" aria-hidden />}
        >
          Finish{seconds > 0 ? ` and log ${timerMinutes(seconds)} min` : ''}
        </UiButton>
      </div>

      <details className="border-t border-line/60 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted">
          Enter minutes by hand instead
        </summary>
        <div className="mt-3 flex items-end gap-3">
          <Field label="Minutes" htmlFor="practice-manual-minutes" className="w-32">
            <TextInput
              id="practice-manual-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
          </Field>
          <UiButton
            variant="secondary"
            loading={saving}
            onClick={() => {
              const m = Number(manualMinutes);
              if (!Number.isInteger(m) || m < 1 || m > 180)
                return toast.error('Enter between 1 and 180 minutes.');
              void save(m);
            }}
          >
            Log minutes
          </UiButton>
        </div>
      </details>
    </div>
  );
}

const MIC_UNAVAILABLE =
  'No microphone is available. Allow microphone access in your browser, or use a device with a microphone, to record your recitation.';

/**
 * Step 2, Recite to your teacher: record the whole passage, play it back, record again, and
 * send it. Sending uploads the recording (signed URL) and logs a session with it; only these
 * sessions wait for the teacher. A recording needs the guardian's practice-recordings consent
 * (AI_VOICE), checked up front and again by the API.
 */
export function PracticeRecitation({
  assignment,
  viewer = 'student',
  onSent,
}: {
  assignment: PracticeAssignment;
  viewer?: PracticeViewer;
  onSent?: () => void;
}) {
  const toast = useToast();
  const log = useLogPractice();
  const allowed = useRecordingAllowed(assignment.id);
  const [refused, setRefused] = useState(false);
  const [recState, setRecState] = useState<RecorderState>('idle');
  const [audio, setAudio] = useState<Blob | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const canRecord =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  // Say up front when the device has no microphone at all.
  useEffect(() => {
    if (!canRecord || !navigator.mediaDevices.enumerateDevices) return;
    let live = true;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (live && !devices.some((d) => d.kind === 'audioinput')) setMicError(MIC_UNAVAILABLE);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [canRecord]);

  useEffect(() => {
    if (recState !== 'recording') return;
    const id = setInterval(
      () => setRecSeconds(Math.round((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [recState]);

  const noConsent = refused || allowed.data?.allowed === false;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecSeconds(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
        setAudio(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }));
        setRecState('recorded');
      };
      startedAt.current = Date.now();
      setRecSeconds(0);
      setAudio(null);
      rec.start();
      recorder.current = rec;
      setMicError(null);
      setRecState('recording');
    } catch {
      setMicError(MIC_UNAVAILABLE);
    }
  };
  const stopRecording = () => recorder.current?.stop();

  const send = async () => {
    if (!audio) return;
    setSending(true);
    try {
      const audioKey = await uploadPracticeAudio(assignment.id, audio);
      await log.mutateAsync({
        assignmentId: assignment.id,
        minutes: recordingMinutes(recSeconds),
        audioKey,
      });
      toast.success(`Sent to your teacher. ${TEACHER_COPY}`);
      setAudio(null);
      setRecSeconds(0);
      setRecState('idle');
      onSent?.();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'CONSENT_REQUIRED') setRefused(true);
      else toast.error(e);
    } finally {
      setSending(false);
    }
  };

  const mmss = `${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, '0')}`;

  return (
    <section
      aria-labelledby="practice-step-recite"
      className="rounded-xl border-2 border-green-700/30 bg-green-50/30 p-4 space-y-3"
    >
      <div>
        <h2 id="practice-step-recite" className="text-base font-semibold text-ink">
          2. Recite to your teacher
        </h2>
        <p className="text-xs text-muted mt-1">
          When you are ready, record the whole passage from start to finish and send it.{' '}
          {TEACHER_COPY} Recordings are deleted after 30 days.
        </p>
      </div>
      {noConsent ? (
        <Alert tone="warning">
          <p>{CONSENT_MISSING_COPY}</p>
          {viewer === 'parent' ? (
            <Link
              href={`/parent/children/${assignment.studentId}?tab=consent`}
              className="mt-2 inline-block font-semibold underline"
            >
              Allow practice recordings
            </Link>
          ) : (
            <p className="mt-2 font-semibold">Ask your parent.</p>
          )}
        </Alert>
      ) : !canRecord ? (
        <Alert tone="warning">
          This browser cannot record audio. Open this page in a recent browser on a device with a
          microphone to recite to your teacher.
        </Alert>
      ) : (
        <>
          {micError && <Alert tone="warning">{micError}</Alert>}
          <div className="flex flex-wrap items-center gap-2">
            {recState === 'recording' ? (
              <UiButton
                variant="danger"
                onClick={stopRecording}
                icon={<Square className="w-4 h-4" aria-hidden />}
              >
                Stop recording
              </UiButton>
            ) : (
              <UiButton
                variant={recState === 'recorded' ? 'secondary' : 'primary'}
                onClick={() => void startRecording()}
                disabled={sending}
                icon={<Mic className="w-4 h-4" aria-hidden />}
              >
                {recState === 'recorded' ? 'Record again' : 'Start recording'}
              </UiButton>
            )}
            {recState !== 'idle' && (
              <span className="text-sm tabular-nums text-ink" aria-live="polite">
                {recState === 'recording' ? `Recording ${mmss}` : `Recorded ${mmss}`}
              </span>
            )}
          </div>
          {recState === 'recorded' && audio && audioUrl && (
            <div className="space-y-2">
              <audio controls src={audioUrl} className="w-full" aria-label="Your recording" />
              <UiButton
                onClick={() => void send()}
                loading={sending}
                icon={<Send className="w-4 h-4" aria-hidden />}
              >
                Send to teacher
              </UiButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Sessions ─────────────────────────────────────────────────────────────────

function ReviewBadge({ s }: { s: PracticeSessionRow }) {
  const status = sessionStatus(s);
  if (status === 'practised') return <Badge tone="neutral">Practised</Badge>;
  return status === 'reviewed' ? (
    <Badge tone="green">Reviewed</Badge>
  ) : (
    <Badge tone="amber">Waiting for teacher</Badge>
  );
}

function MarksList({ marks }: { marks: PracticeMark[] }) {
  if (marks.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {marks.map((m) => (
        <li key={m.id} className="text-[11px] text-ink-2">
          {mistakeWhere(m)}: {MISTAKE_TYPE_LABELS[m.type] ?? m.type}
          {m.resolvedAt ? ' · fixed' : ''}
        </li>
      ))}
    </ul>
  );
}

/** One session: when, how long, the recording, and the teacher's reply. */
function SessionItem({
  s,
  selected,
  onSelect,
  reviewHref,
}: {
  s: PracticeSessionRow;
  selected?: boolean;
  onSelect?: () => void;
  reviewHref?: string;
}) {
  const marks = s.marks ?? [];
  const recitation = sessionKind(s) === 'RECITATION';
  return (
    <li className={`py-3 space-y-1.5 ${selected ? 'bg-green-50/60 -mx-2 px-2 rounded-lg' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink">
        <span className="font-semibold">{formatDateTime(s.startedAt)}</span>
        <span className="tabular-nums">{s.minutes} min</span>
        <span className="text-muted tabular-nums">
          {s.revealsCount} {s.revealsCount === 1 ? 'reveal' : 'reveals'}
        </span>
        <span className="ms-auto">
          <ReviewBadge s={s} />
        </span>
      </div>
      {s.audioUrl ? (
        <audio controls preload="none" src={s.audioUrl} className="w-full h-9" />
      ) : recitation ? (
        <p className="text-[11px] text-muted">Recording deleted after 30 days.</p>
      ) : (
        <p className="text-[11px] text-muted">Own practice, not sent to the teacher.</p>
      )}
      {s.reviewedAt && (
        <div className="rounded-lg bg-sand/60 px-3 py-2 space-y-1">
          <p className="text-[11px] text-muted">
            {s.reviewedBy?.name ?? 'The teacher'} replied {formatDateTime(s.reviewedAt)}
          </p>
          {s.feedback && <p className="text-xs text-ink whitespace-pre-line">{s.feedback}</p>}
          <MarksList marks={marks} />
        </div>
      )}
      <div className="flex gap-2">
        {onSelect && marks.length > 0 && (
          <UiButton size="sm" variant="ghost" onClick={onSelect} aria-pressed={selected}>
            {selected ? 'Shown in the passage' : 'Show words in the passage'}
          </UiButton>
        )}
        {reviewHref && recitation && (
          <Link
            href={reviewHref}
            className="inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold bg-green-800 text-white hover:bg-green-900"
          >
            {s.reviewedAt ? 'Edit review' : 'Review'}
          </Link>
        )}
      </div>
    </li>
  );
}

export function SessionsModal({
  assignment,
  onClose,
  canReview = false,
}: {
  assignment: PracticeAssignment;
  onClose: () => void;
  canReview?: boolean;
}) {
  const sessions = usePracticeSessions(assignment.id);
  return (
    <Modal open onClose={onClose} title={`Practice: ${practiceTitle(assignment)}`} size="lg">
      <QueryState
        query={sessions}
        loadingLabel="Loading sessions…"
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState title="No sessions yet" />}
      >
        {(rows) => (
          <ul className="divide-y divide-line/60">
            {rows.map((s) => (
              <SessionItem
                key={s.id}
                s={s}
                reviewHref={canReview ? `/teacher/practice/${s.id}` : undefined}
              />
            ))}
          </ul>
        )}
      </QueryState>
    </Modal>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

function StatusPill({ a }: { a: PracticeAssignment }) {
  if (a.overdue) return <Badge tone="red">Overdue</Badge>;
  const tone =
    a.status === 'COMPLETED' ? 'green' : a.status === 'IN_PROGRESS' ? 'amber' : 'neutral';
  return <Badge tone={tone}>{STATUS_LABEL[a.status]}</Badge>;
}

/**
 * "Waiting for teacher" (a recitation not yet reviewed), "Reviewed by …", or "Practised"
 * (only prepare sessions so far, which the teacher does not review).
 */
export function reviewLine(
  a: Pick<PracticeAssignment, 'awaitingReview' | 'lastReview'> & { sessionCount?: number },
): string | null {
  if ((a.awaitingReview ?? 0) > 0) return 'Waiting for teacher';
  if (a.lastReview) return a.lastReview.by ? `Reviewed by ${a.lastReview.by}` : 'Reviewed';
  if ((a.sessionCount ?? 0) > 0) return 'Practised';
  return null;
}

function Progress({ done, target }: { done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / Math.max(1, target)) * 100));
  return (
    <div className="space-y-1 min-w-28">
      <div
        className="h-1.5 rounded-full bg-line/60 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-green-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted tabular-nums">
        {done} of {target} min
      </p>
    </div>
  );
}

export interface PracticeFilters {
  child: string;
  status: 'all' | 'active' | 'waiting' | 'reviewed' | 'COMPLETED' | 'overdue';
  due: 'any' | 'week' | 'overdue' | 'none';
}

export const DEFAULT_FILTERS: PracticeFilters = { child: 'all', status: 'all', due: 'any' };

export function filterPractice(
  rows: PracticeAssignment[],
  f: PracticeFilters,
  now = Date.now(),
): PracticeAssignment[] {
  const week = now + 7 * 86_400_000;
  return rows.filter((a) => {
    if (f.child !== 'all' && a.studentId !== f.child) return false;
    if (f.status === 'active' && (a.status === 'COMPLETED' || a.status === 'EXPIRED')) return false;
    if (f.status === 'COMPLETED' && a.status !== 'COMPLETED') return false;
    if (f.status === 'overdue' && !a.overdue) return false;
    if (f.status === 'waiting' && !((a.awaitingReview ?? 0) > 0)) return false;
    if (f.status === 'reviewed' && !(a.lastReview && !(a.awaitingReview ?? 0))) return false;
    const due = a.dueOn ? Date.parse(a.dueOn) : null;
    if (f.due === 'none' && due !== null) return false;
    if (f.due === 'overdue' && !a.overdue) return false;
    if (f.due === 'week' && (due === null || due > week || a.overdue)) return false;
    return true;
  });
}

/**
 * Practice assignments for a student (or, with no `studentId`, every one the viewer may
 * see), as a table. `practiceHref` links each row to the practice page.
 */
export function PracticeList({
  studentId,
  practiceHref,
  showStudent = false,
  canReview = false,
  filters: withFilters = false,
  filterState,
}: {
  studentId?: string;
  practiceHref?: (assignment: PracticeAssignment) => string;
  showStudent?: boolean;
  /** The teacher: each session links to its review. */
  canReview?: boolean;
  /** Child, status and due filters above the table (the family's Practice page). */
  filters?: boolean;
  /** Filters held by the page (its own FilterBar); no filter bar is drawn here. */
  filterState?: PracticeFilters;
}) {
  const list = usePracticeAssignments({ studentId });
  const [open, setOpen] = useState<PracticeAssignment | null>(null);
  const [filters, setFilters] = useState<PracticeFilters>(DEFAULT_FILTERS);
  const set = <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const columns: Column<PracticeAssignment>[] = [
    ...(showStudent
      ? [
          {
            key: 'child',
            header: 'Child',
            render: (a: PracticeAssignment) => (
              <span className="font-semibold text-ink">{a.student.displayName}</span>
            ),
            sortValue: (a: PracticeAssignment) => a.student.displayName,
          },
        ]
      : []),
    {
      key: 'passage',
      header: 'Passage',
      render: (a) => <span className="font-semibold text-ink">{practiceTitle(a)}</span>,
      sortValue: (a) => practiceSortValue(a),
    },
    { key: 'kind', header: 'Kind', render: (a) => MODE_LABEL[a.mode] },
    { key: 'teacher', header: 'Set by', render: (a) => a.teacher.user.name },
    {
      key: 'due',
      header: 'Due',
      render: (a) => (a.dueOn ? formatDate(a.dueOn, { timeZone: 'UTC' }) : 'No date'),
      sortValue: (a) => (a.dueOn ? Date.parse(a.dueOn) : Number.MAX_SAFE_INTEGER),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (a) => <Progress done={a.minutesDone} target={a.targetMinutes} />,
      sortValue: (a) => a.minutesDone / Math.max(1, a.targetMinutes),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => {
        const line = reviewLine(a);
        return (
          <div className="space-y-1">
            <StatusPill a={a} />
            {line && (
              <p
                className={`text-[11px] ${(a.awaitingReview ?? 0) > 0 ? 'text-amber-800' : a.lastReview ? 'text-green-800' : 'text-muted'}`}
              >
                {line}
              </p>
            )}
          </div>
        );
      },
      sortable: false,
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (a) => (
        <div className="flex gap-2 justify-end">
          {practiceHref && a.status !== 'EXPIRED' && (
            <Link
              href={practiceHref(a)}
              className="inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold bg-green-800 text-white hover:bg-green-900"
            >
              Practise
            </Link>
          )}
          <UiButton
            size="sm"
            variant="secondary"
            onClick={() => setOpen(a)}
            disabled={a.sessionCount === 0}
          >
            Sessions ({a.sessionCount})
          </UiButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <QueryState
        query={list}
        loadingLabel="Loading practice…"
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            className={withFilters ? 'rounded-xl border border-line bg-white' : undefined}
            icon={<Timer className="w-5 h-5" aria-hidden />}
            title="No practice set yet"
            description="The teacher sets practice between classes."
          />
        }
      >
        {(rows) => {
          const children = [...new Map(rows.map((a) => [a.studentId, a.student.displayName]))];
          const shown = filterState
            ? filterPractice(rows, filterState)
            : withFilters
              ? filterPractice(rows, filters)
              : rows;
          return (
            <div className="space-y-4">
              {withFilters && !filterState && (
                <FilterBar>
                  {children.length > 1 && (
                    <FilterSelect
                      id="practice-child"
                      label="Child"
                      value={filters.child}
                      onChange={(v) => set('child', v)}
                      options={[
                        { value: 'all', label: 'All children' },
                        ...children.map(([value, label]) => ({ value, label })),
                      ]}
                    />
                  )}
                  <FilterSelect<PracticeFilters['status']>
                    id="practice-status"
                    label="Status"
                    value={filters.status}
                    onChange={(v) => set('status', v)}
                    options={[
                      { value: 'all', label: 'Any status' },
                      { value: 'active', label: 'Still to do' },
                      { value: 'waiting', label: 'Waiting for teacher' },
                      { value: 'reviewed', label: 'Reviewed' },
                      { value: 'COMPLETED', label: 'Done' },
                      { value: 'overdue', label: 'Overdue' },
                    ]}
                  />
                  <FilterSelect<PracticeFilters['due']>
                    id="practice-due-filter"
                    label="Due"
                    value={filters.due}
                    onChange={(v) => set('due', v)}
                    options={[
                      { value: 'any', label: 'Any time' },
                      { value: 'week', label: 'Within a week' },
                      { value: 'overdue', label: 'Overdue' },
                      { value: 'none', label: 'No due date' },
                    ]}
                  />
                </FilterBar>
              )}
              <DataTable<PracticeAssignment>
                rows={shown}
                rowKey={(a) => a.id}
                columns={columns}
                pageSize={20}
                empty={
                  <EmptyState
                    title="No practice matches"
                    description="Try another child, status or due date."
                  />
                }
              />
            </div>
          );
        }}
      </QueryState>
      {open && (
        <SessionsModal assignment={open} onClose={() => setOpen(null)} canReview={canReview} />
      )}
    </>
  );
}

// ── Assign ───────────────────────────────────────────────────────────────────

/** What a practice is set from: the Mushaf, or a Duas / Qaida board. */
type PracticeSource = 'QURAN' | PracticeBoard;

const SOURCE_LABEL: Record<PracticeSource, string> = {
  QURAN: 'Quran passage',
  DUAS: 'Duas (Hisn al-Muslim)',
  QAIDA: 'Noorani Qaida',
};

interface AssignDraft {
  source: PracticeSource;
  fromSurah: string;
  fromAyah: string;
  toSurah: string;
  toAyah: string;
  boardLesson: number | null;
  boardItem: number | null;
  mode: PracticeMode;
  targetMinutes: string;
  dueOn: string;
}

function emptyDraft(source: PracticeSource): AssignDraft {
  return {
    source,
    fromSurah: '',
    fromAyah: '1',
    toSurah: '',
    toAyah: '',
    boardLesson: null,
    boardItem: null,
    mode: source === 'QURAN' ? 'MEMORISATION' : BOARD_DEFAULT_MODE[source],
    targetMinutes: '30',
    dueOn: '',
  };
}

function draftProblem(d: AssignDraft): string | null {
  const n = (v: string) => Number(v);
  const whole = (v: string) => v !== '' && Number.isInteger(n(v));
  if (d.source !== 'QURAN') {
    if (!d.boardLesson) return d.source === 'DUAS' ? 'Choose a dua chapter.' : 'Choose a Qaida lesson.';
  } else {
    if (![d.fromSurah, d.fromAyah, d.toSurah, d.toAyah].every(whole)) return 'Fill in every number.';
    if ([d.fromSurah, d.toSurah].some((s) => n(s) < 1 || n(s) > 114))
      return 'Surahs are numbered 1 to 114.';
    if (n(d.fromAyah) < 1 || n(d.toAyah) < 1) return 'Ayahs start at 1.';
    if (n(d.toSurah) * 1000 + n(d.toAyah) < n(d.fromSurah) * 1000 + n(d.fromAyah))
      return 'The passage ends before it starts.';
  }
  if (!whole(d.targetMinutes)) return 'Fill in every number.';
  if (n(d.targetMinutes) < 5 || n(d.targetMinutes) > 600) return 'Set between 5 and 600 minutes.';
  return null;
}

/**
 * The sources a teacher may set practice from, given the student's course types: a Duas or Qaida
 * course gets its board (first, as the default); any other course, or none known, the Mushaf.
 */
export function practiceSources(courseTypes: Array<string | null | undefined> = []): PracticeSource[] {
  const boards = [...new Set(courseTypes.map((t) => boardForCourse(t)).filter((b): b is PracticeBoard => !!b))];
  const quran = courseTypes.length === 0 || courseTypes.some((t) => !boardForCourse(t));
  return [...boards, ...(quran ? (['QURAN'] as const) : [])];
}

/**
 * Teacher: set practice for one of their students. A Duas or Qaida student gets a dua chapter
 * (and optionally one dua) or a Qaida lesson instead of the surah/ayah fields.
 */
export function AssignPracticeButton({
  studentId,
  studentName,
  courseTypes,
}: {
  studentId: string;
  studentName?: string;
  /** The types of the courses the student takes with this teacher. */
  courseTypes?: Array<string | null | undefined>;
}) {
  const sources = practiceSources(courseTypes);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AssignDraft>(() => emptyDraft(sources[0]));
  const assign = useAssignPractice();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  // The enrolments may arrive after the first render: follow them until the teacher picks.
  const source = sources.includes(draft.source) ? draft.source : sources[0];
  const d = source === draft.source ? draft : { ...emptyDraft(source), targetMinutes: draft.targetMinutes, dueOn: draft.dueOn };

  const submit = () => {
    const problem = draftProblem(d);
    if (problem) return toast.error(problem);
    const where =
      d.source === 'QURAN'
        ? {
            fromSurah: Number(d.fromSurah),
            fromAyah: Number(d.fromAyah),
            toSurah: Number(d.toSurah),
            toAyah: Number(d.toAyah),
          }
        : {
            board: d.source,
            boardLesson: d.boardLesson as number,
            ...(d.source === 'DUAS' && d.boardItem !== null ? { boardItem: d.boardItem } : {}),
          };
    assign.mutate(
      {
        studentId,
        ...where,
        mode: d.mode,
        targetMinutes: Number(d.targetMinutes),
        ...(d.dueOn ? { dueOn: d.dueOn } : {}),
      },
      {
        onSuccess: (created) => {
          toast.success(`Practice set: ${practiceTitle(created)}. The family has been told.`);
          setOpen(false);
          setDraft(emptyDraft(d.source));
        },
        onError: (e) => toast.error(e),
      },
    );
  };

  return (
    <>
      <UiButton
        size="sm"
        onClick={() => setOpen(true)}
        icon={<Timer className="w-3.5 h-3.5" aria-hidden />}
      >
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
          {sources.length > 1 && (
            <Field label="Practise from" htmlFor="practice-source">
              <Select
                id="practice-source"
                value={d.source}
                onChange={(e) => {
                  const next = e.target.value as PracticeSource;
                  setDraft({ ...emptyDraft(next), targetMinutes: d.targetMinutes, dueOn: d.dueOn });
                }}
              >
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {d.source === 'QURAN' ? (
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
                    value={d[field]}
                    onChange={(e) => setDraft({ ...d, [field]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          ) : (
            <BoardPracticeFields
              board={d.source}
              lesson={d.boardLesson}
              item={d.boardItem}
              onChange={(next) => setDraft({ ...d, boardLesson: next.lesson, boardItem: next.item })}
            />
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Kind" htmlFor="practice-mode">
              <Select
                id="practice-mode"
                value={d.mode}
                onChange={(e) => setDraft({ ...d, mode: e.target.value as PracticeMode })}
              >
                <option value="MEMORISATION">Memorisation</option>
                <option value="READING">Reading</option>
              </Select>
            </Field>
            <Field label="Minutes in all" htmlFor="practice-minutes" required>
              <TextInput
                id="practice-minutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                value={d.targetMinutes}
                onChange={(e) => setDraft({ ...d, targetMinutes: e.target.value })}
              />
            </Field>
            <Field label="Due" htmlFor="practice-due" hint="Optional">
              <TextInput
                id="practice-due"
                type="date"
                min={today}
                value={d.dueOn}
                onChange={(e) => setDraft({ ...d, dueOn: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Practice screen ──────────────────────────────────────────────────────────

/** The passage display controls: test myself, hide/show all, meanings. */
function PassageToolbar({
  testing,
  reveals,
  meaning,
  onTest,
  onHideAll,
  onShowAll,
  onMeaning,
  meanings = true,
}: {
  /** Word meanings (Mushaf passages only; a dua shows its meaning in full). */
  meanings?: boolean;
  testing: boolean;
  reveals: number;
  meaning: Meaning;
  onTest: () => void;
  onHideAll: () => void;
  onShowAll: () => void;
  onMeaning: (m: Meaning) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {testing ? (
        <>
          <UiButton
            size="sm"
            variant="secondary"
            onClick={onHideAll}
            icon={<EyeOff className="w-3.5 h-3.5" aria-hidden />}
          >
            Hide all
          </UiButton>
          <UiButton
            size="sm"
            variant="secondary"
            onClick={onShowAll}
            icon={<Eye className="w-3.5 h-3.5" aria-hidden />}
          >
            Show all
          </UiButton>
          <span className="text-xs text-ink-2 tabular-nums" aria-live="polite">
            {reveals} {reveals === 1 ? 'word' : 'words'} peeked
          </span>
        </>
      ) : (
        <UiButton size="sm" onClick={onTest} icon={<EyeOff className="w-3.5 h-3.5" aria-hidden />}>
          Test myself
        </UiButton>
      )}
      {meanings && (
        <>
          <label htmlFor="practice-meaning" className="ms-auto text-xs text-muted">
            Word meanings
          </label>
          <select
            id="practice-meaning"
            value={meaning}
            onChange={(e) => onMeaning(e.target.value as Meaning)}
            className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
          >
            <option value="off">Off</option>
            <option value="en">English</option>
            <option value="ur">Urdu</option>
          </select>
        </>
      )}
    </div>
  );
}

/**
 * The passage to practise with its memorisation tools, the timer, and on the side the past
 * sessions with the teacher's replies. Used by the student, and by a guardian practising with
 * a young child.
 */
export function PracticeWorkspace({
  assignment,
  sessions,
  viewer = 'student',
}: {
  assignment: PracticeAssignment;
  sessions: PracticeSessionRow[];
  viewer?: PracticeViewer;
}) {
  const [testing, setTesting] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [reveals, setReveals] = useState(0);
  const [meaning, setMeaning] = useState<Meaning>('off');
  const latestMarked = sessions.find((s) => (s.marks ?? []).length > 0)?.id ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const highlightId = selected ?? latestMarked;
  const highlight = sessions.find((s) => s.id === highlightId)?.marks ?? [];
  // A dua or Qaida lesson instead of a surah range.
  const range = practiceRange(assignment);
  const reveal = (k: string) => {
    setRevealed((r) => new Set(r).add(k));
    setReveals((n) => n + 1);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="space-y-4">
        <section aria-labelledby="practice-step-prepare" className="space-y-3">
        <div>
          <h2 id="practice-step-prepare" className="text-base font-semibold text-ink">
            1. Prepare
          </h2>
          <p className="text-xs text-muted mt-1">
            {range
              ? 'Read the passage, listen to the qari, test yourself and time your practice.'
              : assignment.board === 'QAIDA'
                ? 'Read the lesson, test yourself and time your practice.'
                : 'Read the dua, learn it, test yourself and time your practice.'}{' '}
            {PREPARE_COPY}
          </p>
          {!range && <p className="text-xs text-muted mt-1">{NO_BOARD_AUDIO}</p>}
        </div>
        <div className="rounded-xl border border-line p-4 space-y-3">
          <PassageToolbar
            testing={testing}
            reveals={reveals}
            meaning={meaning}
            onTest={() => {
              setRevealed(new Set());
              setTesting(true);
            }}
            onHideAll={() => setRevealed(new Set())}
            onShowAll={() => setTesting(false)}
            onMeaning={setMeaning}
            meanings={Boolean(range)}
          />
          {testing && (
            <p className="text-[11px] text-muted">
              {range
                ? 'Recite from memory. Tap a blank to see that word; the teacher sees how many you needed.'
                : assignment.board === 'QAIDA'
                  ? 'Read each item, then tap it to check; the teacher sees how many you needed.'
                  : 'Say each dua from memory, then tap to check it; the teacher sees how many you needed.'}
            </p>
          )}
          {range ? (
            <PassageText
              assignmentId={assignment.id}
              range={range}
              marks={testing ? [] : highlight}
              hidden={testing}
              revealed={revealed}
              onReveal={reveal}
              meaning={meaning}
            />
          ) : (
            <BoardPassage
              passage={assignment}
              marks={testing ? [] : highlight}
              hidden={testing}
              revealed={revealed}
              onReveal={reveal}
            />
          )}
          {!testing && highlight.length > 0 && (
            <p className="text-[11px] text-muted">
              Words your teacher marked are underlined in red.
            </p>
          )}
        </div>
        {assignment.status === 'EXPIRED' ? (
          <Alert tone="warning">This practice has expired.</Alert>
        ) : (
          <PracticeTimer
            assignment={assignment}
            revealsCount={reveals}
            onLogged={() => setReveals(0)}
          />
        )}
        </section>
        {assignment.status !== 'EXPIRED' && (
          <PracticeRecitation assignment={assignment} viewer={viewer} />
        )}
      </div>
      <div className="rounded-xl border border-line p-4">
        <p className="text-sm font-semibold text-ink">Past sessions</p>
        <p className="text-[11px] text-muted mb-1">
          Practised: your own practice. Recitations wait for your teacher, then show their reply.
        </p>
        {sessions.length === 0 ? (
          <p className="text-xs text-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {sessions.map((s) => (
              <SessionItem
                key={s.id}
                s={s}
                selected={s.id === highlightId}
                onSelect={() => setSelected(s.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One assignment: what to practise, progress, the passage and timer, and past sessions. */
export function PracticeScreen({
  assignmentId,
  backHref,
  backLabel,
  viewer = 'student',
}: {
  assignmentId: string;
  backHref: string;
  backLabel: string;
  viewer?: PracticeViewer;
}) {
  const list = usePracticeAssignments();
  const sessions = usePracticeSessions(assignmentId);
  const reviewedAt = list.data?.find((r) => r.id === assignmentId)?.lastReview?.at;
  // Opening the practice shows the teacher's reply: it no longer counts on the sidebar badge.
  useEffect(() => {
    if (list.data?.some((r) => r.id === assignmentId)) markPracticeSeen(assignmentId);
  }, [assignmentId, list.data, reviewedAt]);
  return (
    <>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink mb-3"
      >
        ← {backLabel}
      </Link>
      <QueryState query={list} loadingLabel="Loading practice…">
        {(rows) => {
          const a = rows.find((r) => r.id === assignmentId);
          if (!a)
            return (
              <EmptyState
                title="Practice not found"
                description="It may have been removed, or it belongs to another student."
              />
            );
          return (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-ink">
                  {practiceTitle(a)} · {MODE_LABEL[a.mode]}
                </h1>
                <p className="text-xs text-muted mt-1">
                  Set by {a.teacher.user.name} for {a.student.displayName} ·{' '}
                  {a.dueOn ? `due ${formatDate(a.dueOn, { timeZone: 'UTC' })}` : 'no due date'}
                  {reviewLine(a) ? ` · ${reviewLine(a)}` : ''}
                </p>
                <div className="mt-3 max-w-xs">
                  <Progress done={a.minutesDone} target={a.targetMinutes} />
                </div>
              </div>
              <PracticeWorkspace assignment={a} sessions={sessions.data ?? []} viewer={viewer} />
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

// ── Teacher review ───────────────────────────────────────────────────────────

/** Teacher: practice sessions of the last 30 days, waiting for a reply by default, newest first. */
export function PracticeReviewQueue() {
  const [status, setStatus] = useState<PracticeReviewStatus>('all');
  const [student, setStudent] = useState('all');
  const queue = usePracticeToReview(true, status);
  const columns: Column<PracticeReviewItem>[] = [
    {
      key: 'student',
      header: 'Child',
      render: (r) => (
        <span className="font-semibold text-ink">{r.assignment.student.displayName}</span>
      ),
      sortValue: (r) => r.assignment.student.displayName,
    },
    {
      key: 'passage',
      header: 'Passage',
      render: (r) => `${practiceTitle(r.assignment)} · ${MODE_LABEL[r.assignment.mode]}`,
    },
    { key: 'minutes', header: 'Minutes', render: (r) => r.minutes, sortValue: (r) => r.minutes },
    {
      key: 'audio',
      header: 'Recording',
      render: (r) => (r.hasAudio ? <Badge tone="blue">Yes</Badge> : <span className="text-xs text-muted">No</span>),
      sortValue: (r) => (r.hasAudio ? 1 : 0),
    },
    {
      key: 'when',
      header: 'Practised on',
      render: (r) => formatDateTime(r.startedAt),
      sortValue: (r) => Date.parse(r.startedAt),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (r.reviewedAt ? <Badge tone="green">Reviewed</Badge> : <Badge tone="gold">Waiting</Badge>),
      sortValue: (r) => (r.reviewedAt ? 1 : 0),
    },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      sortable: false,
      className: 'text-right',
      render: (r) => (
        <Link
          href={`/teacher/practice/${r.id}`}
          onClick={(e) => e.stopPropagation()}
          className={
            r.reviewedAt
              ? 'inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold border border-line bg-white text-ink hover:bg-sand'
              : 'inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold bg-green-800 text-white hover:bg-green-900'
          }
        >
          {r.reviewedAt ? 'View' : 'Review'}
        </Link>
      ),
    },
  ];
  // Children seen in any loaded list, so the child filter keeps its options across statuses.
  const children = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of queue.data ?? []) seen.set(r.assignment.student.id, r.assignment.student.displayName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [queue.data]);
  const router = useRouter();
  return (
    <>
      <FilterBar className="mb-4">
        <FilterSelect<PracticeReviewStatus>
          id="practice-review-status"
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'waiting', label: 'Waiting for you' },
            { value: 'reviewed', label: 'Reviewed' },
          ]}
        />
        <FilterSelect
          id="practice-review-child"
          label="Child"
          value={student}
          onChange={setStudent}
          options={[{ value: 'all', label: 'All children' }, ...children.map(([value, label]) => ({ value, label }))]}
        />
      </FilterBar>
      <QueryState
        query={queue}
        loadingLabel="Loading practice to review…"
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            className="rounded-xl border border-line bg-white"
            icon={<Timer className="w-5 h-5" aria-hidden />}
            title={status === 'reviewed' ? 'Nothing reviewed in the last 30 days' : 'Nothing to review'}
            description="When a student sends you a recitation of a passage you set, it appears here until you reply. Their own practice with the timer is not sent to you."
          />
        }
      >
        {(rows) => (
          <DataTable
            rows={student === 'all' ? rows : rows.filter((r) => r.assignment.student.id === student)}
            rowKey={(r) => r.id}
            columns={columns}
            pageSize={20}
            onRowClick={(r) => router.push(`/teacher/practice/${r.id}`)}
            empty={
              <EmptyState
                title="No sessions for this child"
                description="Try another child or status."
              />
            }
          />
        )}
      </QueryState>
    </>
  );
}

/**
 * Teacher: listen to (or read) one session, tap the words read wrongly and choose what kind of
 * mistake each was, write a reply, and mark it reviewed. The family is told.
 */
export function PracticeReviewScreen({ sessionId }: { sessionId: string }) {
  const detail = usePracticeSession(sessionId);
  const review = useReviewPracticeSession(sessionId);
  const toast = useToast();
  const [pending, setPending] = useState<ReviewMarkInput[]>([]);
  const [picking, setPicking] = useState<Picked | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <QueryState query={detail} loadingLabel="Loading the session…">
      {({ session: s, assignment: a, canReview }) => {
        if (!a) return <EmptyState title="This practice was removed" />;
        if (sessionKind(s) === 'PREPARE')
          return (
            <EmptyState
              title="This was a practice session; nothing to review."
              description="The student practised on their own. Only recitations they send you are reviewed."
            />
          );
        const pendingKeys = new Set(pending.map(markKey));
        const range = practiceRange(a);
        // A board practice is marked with its course's own categories.
        const types: readonly MistakeType[] = a.board ? (COURSE_MISTAKE_TYPES[a.board] ?? []) : MISTAKE_TYPES;
        const text = feedback ?? s.feedback ?? '';
        const submit = () =>
          review.mutate(
            { feedback: text, mistakes: pending },
            {
              onSuccess: (r) => {
                toast.success(
                  r.added > 0
                    ? `Reviewed. ${r.added} ${r.added === 1 ? 'word' : 'words'} marked; the family has been told.`
                    : 'Reviewed. The family has been told.',
                );
                setPending([]);
                setPicking(null);
              },
              onError: (e) => toast.error(e),
            },
          );
        return (
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-ink">
                  {a.student.displayName} · {practiceTitle(a)}
                </h1>
                <p className="text-xs text-muted mt-1">
                  {formatDateTime(s.startedAt)} · {s.minutes} min · {s.revealsCount}{' '}
                  {s.revealsCount === 1 ? 'word peeked' : 'words peeked'} ·{' '}
                  {s.reviewedAt ? `reviewed ${formatDateTime(s.reviewedAt)}` : 'waiting for you'}
                </p>
              </div>
              {s.audioUrl ? (
                <audio controls src={s.audioUrl} className="w-full" />
              ) : (
                <Alert tone="neutral">
                  The recording was deleted after 30 days. Your review is kept.
                </Alert>
              )}
              <div className="rounded-xl border border-line p-4 space-y-3">
                <p className="text-sm font-semibold text-ink">
                  {canReview
                    ? a.board === 'QAIDA'
                      ? 'Tap an item that was read wrongly'
                      : 'Tap a word that was read wrongly'
                    : range
                      ? 'Passage'
                      : a.board === 'QAIDA'
                        ? 'Lesson'
                        : 'Dua'}
                </p>
                {range ? (
                  <PassageText
                    assignmentId={a.id}
                    range={range}
                    marks={s.marks ?? []}
                    pending={pendingKeys}
                    onWordClick={canReview ? (w) => setPicking(w) : undefined}
                  />
                ) : (
                  <BoardPassage
                    passage={a}
                    marks={s.marks ?? []}
                    pending={pendingKeys}
                    onPick={canReview ? (p) => setPicking(p) : undefined}
                  />
                )}
              </div>
            </div>
            <div className="rounded-xl border border-line p-4 space-y-4">
              {picking && canReview && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                  {'itemRef' in picking ? (
                    <p className="text-xs text-ink">{picking.itemRef}</p>
                  ) : (
                    <p className="text-xs text-ink">
                      {picking.surah}:{picking.ayah} word {picking.wordIndex + 1}{' '}
                      <span dir="rtl" lang="ar" className="text-lg" style={ARABIC}>
                        {picking.text}
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mistake type">
                    {types.map((t: MistakeType) => (
                      <UiButton
                        key={t}
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const mark: ReviewMarkInput =
                            'itemRef' in picking
                              ? { itemRef: picking.itemRef, type: t }
                              : {
                                  surah: picking.surah,
                                  ayah: picking.ayah,
                                  wordIndex: picking.wordIndex,
                                  type: t,
                                };
                          setPending((p) => [
                            ...p.filter((m) => markKey(m) !== markKey(picking)),
                            mark,
                          ]);
                          setPicking(null);
                        }}
                      >
                        {MISTAKE_TYPE_LABELS[t]}
                      </UiButton>
                    ))}
                  </div>
                  <UiButton size="sm" variant="ghost" onClick={() => setPicking(null)}>
                    Cancel
                  </UiButton>
                </div>
              )}
              {canReview && (
                <OpenMistakesInPassage
                  studentId={a.student.id}
                  range={a}
                  excludeIds={(s.marks ?? []).map((m) => m.id)}
                />
              )}
              {(s.marks ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-ink">Already marked</p>
                  <MarksList marks={s.marks ?? []} />
                </div>
              )}
              {pending.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-ink">To add</p>
                  <ul className="space-y-1">
                    {pending.map((m) => {
                      const k = markKey(m);
                      return (
                        <li key={k} className="flex items-center gap-2 text-[11px] text-ink-2">
                          {markPlace(m)}: {MISTAKE_TYPE_LABELS[m.type]}
                          <button
                            type="button"
                            className="ms-auto text-red-700 hover:underline"
                            onClick={() =>
                              setPending((p) => p.filter((x) => markKey(x) !== k))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {canReview ? (
                <>
                  <Field
                    label="Feedback for the family"
                    htmlFor="practice-feedback"
                    hint={`${text.length}/1000`}
                  >
                    <TextArea
                      id="practice-feedback"
                      rows={5}
                      maxLength={1000}
                      value={text}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="What went well, and what to work on before the next class."
                    />
                  </Field>
                  <UiButton onClick={submit} loading={review.isPending} className="w-full">
                    {s.reviewedAt ? 'Save review' : 'Mark reviewed'}
                  </UiButton>
                </>
              ) : (
                <p className="text-xs text-muted">
                  Only the teacher who set this practice can review it.
                </p>
              )}
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

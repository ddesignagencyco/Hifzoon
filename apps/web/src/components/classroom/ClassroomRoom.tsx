'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDisplayZone } from '@/hooks/useDisplayZone';
import { ClipboardList, Circle, LogIn, Maximize2, MonitorUp, Palette, PanelRightClose, PanelRightOpen, PenLine, Users, Video, VideoOff, Wifi } from 'lucide-react';
import {
  Alert,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  STATE_POLL_MS,
  useClassroomState,
  useJoinClassroom,
  useRecordingConsent,
  useSetClassroomHighlight,
  useSetClassroomLayout,
  useSetClassroomPage,
  useSetClassroomTajweed,
} from '@/hooks/useClassroom';
import { useClassroomSocket } from '@/hooks/useClassroomSocket';
import { useClassMistakes } from '@/hooks/useClassroomMistakes';
import { useMushafLayouts } from '@/hooks/useMushaf';
import {
  ClassroomSnapshot,
  ParticipantRole,
  RecordingStarted,
  joinWindow,
  participantRoleLabel,
} from '@/lib/api/modules/classroom';
import { MUSHAF_LAYOUTS, MushafLayout, clampPage, layoutLabel } from '@/lib/api/modules/mushaf';
import { MushafViewer, WordPosition } from '@/components/mushaf/MushafViewer';
import { PageNavigator } from '@/components/mushaf/PageNavigator';
import { MistakeLogger, ClassStudent } from './MistakeLogger';
import { AiFlagReview, MistakeList } from './MistakeList';
import { AttendancePanel } from './AttendancePanel';
import { RecordingControl } from './RecordingControl';
import { BandwidthPanel } from './BandwidthPanel';
import { MediaControls, RoomDetails, SelfVideoTile, VideoProviderChip, useLocalPreview } from './VideoPanel';
import {
  ControlBar,
  ControlButton,
  Filmstrip,
  LightSheet,
  MeetingTopBar,
  PanelSection,
  PanelTab,
  PanelTabs,
  ParticipantTile,
  StatusPill,
  SyncIndicator,
  TabPanel,
  classPhase,
  useServerClock,
  formatClock,
  initialsOf,
} from './MeetingChrome';

export type ClassroomViewer = 'teacher' | 'student' | 'guardian';

type PanelValue = 'people' | 'mistakes' | 'recording' | 'connection';

type Participant = ClassroomSnapshot['participants'][number];

const ROLE_ORDER: Record<ParticipantRole, number> = { TEACHER: 0, STUDENT: 1, GUARDIAN_VIEWER: 2, SUPERVISOR: 3 };

/** Teacher first, then students, guardians and supervisors (as in a meeting's filmstrip). */
function byRole(a: Participant, b: Participant) {
  return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
}

/**
 * The live classroom shared by the teacher, student and guardian portals
 * (FR-CLS-01…05, 11–14), laid out like a video meeting. The teacher drives the Mushaf
 * over REST; everyone follows the state snapshot by polling, sped up by the classroom
 * socket when it is available.
 */
export function ClassroomRoom({ classId, viewer }: { classId: string; viewer: ClassroomViewer }) {
  const state = useClassroomState(classId, { pollMs: STATE_POLL_MS });

  if (state.isLoading) return <LoadingState label="Opening the classroom…" />;
  if (state.isError || !state.data) {
    return (
      <>
        <PageHeader eyebrow="Live class" title="Classroom" />
        <Card>
          <ErrorState error={state.error} onRetry={() => state.refetch()} title="Could not open this classroom" />
        </Card>
      </>
    );
  }
  return <Room classId={classId} viewer={viewer} snapshot={state.data} />;
}

function Room({ classId, viewer, snapshot }: { classId: string; viewer: ClassroomViewer; snapshot: ClassroomSnapshot }) {
  const isTeacher = viewer === 'teacher';
  // Same zone as the timetables (account zone, else device) so a class shows one clock time.
  const zone = useDisplayZone();
  const toast = useToast();
  const panelId = useId();
  const join = useJoinClassroom(classId);
  const token = join.data;
  const socket = useClassroomSocket(classId, token?.token);
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const preview = useLocalPreview(lowBandwidth);
  const [selection, setSelection] = useState<WordPosition | null>(null);
  const [recording, setRecording] = useState<RecordingStarted | null>(null);
  const [panel, setPanel] = useState<PanelValue>(isTeacher ? 'mistakes' : 'people');

  const consent = useRecordingConsent(classId, isTeacher);
  const students: ClassStudent[] = useMemo(
    () => (consent.data?.students ?? []).map((s) => ({ studentId: s.studentId, displayName: s.displayName })),
    [consent.data],
  );
  const mistakes = useClassMistakes(classId, isTeacher);
  const markers = useMemo(() => mistakes.data ?? [], [mistakes.data]);

  const setPage = useSetClassroomPage(classId);
  const setHighlight = useSetClassroomHighlight(classId);
  const setLayout = useSetClassroomLayout(classId);
  const setTajweed = useSetClassroomTajweed(classId);
  const layouts = useMushafLayouts();

  // Snapshot the clock once per render cycle of new server data rather than per render.
  const serverNow = new Date(snapshot.serverTime).getTime();
  const windowState = joinWindow(snapshot.startsAt, snapshot.endsAt, serverNow);
  const started = serverNow >= new Date(snapshot.startsAt).getTime();
  // The API only marks a class LIVE when the room is first opened after the start time
  // (backend B36), so a room opened early stays SCHEDULED; classPhase says what is really happening.
  const phase = classPhase(snapshot.status, snapshot.startsAt, snapshot.endsAt, serverNow);
  // Children have no login yet (Kids PIN, M2): they join on a parent's device, which shows
  // as GUARDIAN_VIEWER. Either counts as the student's side being in the room.
  const studentSidePresent = snapshot.participants.some((p) => p.role === 'STUDENT' || p.role === 'GUARDIAN_VIEWER');
  const page = snapshot.page ?? (isTeacher ? 1 : null);

  const roster = useMemo(() => snapshot.participants.slice().sort(byRole), [snapshot.participants]);
  const selfEntry = token ? (roster.find((p) => p.userId === token.sub && p.role === token.role) ?? roster.find((p) => p.userId === token.sub)) : undefined;
  const selfName = selfEntry?.displayName ?? 'You';
  const teacherName = roster.find((p) => p.role === 'TEACHER')?.displayName;

  const changePage = (next: number) =>
    setPage.mutate(clampPage(next), { onError: (e) => toast.error(e) });

  // The teacher sees page 1 by default, but the room has no page until one is sent, so
  // students and parents were left on "Waiting for the teacher". Publish it once on join.
  const publishedDefaultPage = useRef(false);
  const mustPublishPage = isTeacher && Boolean(token) && snapshot.page == null;
  useEffect(() => {
    if (!mustPublishPage || publishedDefaultPage.current) return;
    publishedDefaultPage.current = true;
    setPage.mutate(1, { onError: () => (publishedDefaultPage.current = false) });
  }, [mustPublishPage, setPage]);

  // Meeting-app view controls: hide the video strip or the side panel, or fill the screen with the Mushaf.
  const [showTiles, setShowTiles] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const mushafRef = useRef<HTMLDivElement>(null);
  const fullScreenMushaf = () => {
    const el = mushafRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => toast.error('Full screen is not available in this browser.'));
  };

  const selectWord = (pos: WordPosition) => {
    setSelection(pos);
    setHighlight.mutate(pos, { onError: (e) => toast.error(e) });
  };

  const changeLayout = (layout: MushafLayout) =>
    setLayout.mutate(layout, {
      onSuccess: () => toast.success(`Switched to ${layoutLabel(layout)}`),
      onError: (e) => toast.error(e),
    });

  const toggleTajweed = () =>
    setTajweed.mutate(!snapshot.tajweedColours, {
      onSuccess: (r) => toast.success(r.tajweedColours ? 'Tajweed colours on' : 'Tajweed colours off'),
      onError: (e) => toast.error(e),
    });

  const doJoin = () =>
    join.mutate(undefined, {
      onSuccess: () => toast.success('You have joined the class'),
      onError: (e) => toast.error(e),
    });

  // Leaving drops the room token: the socket disconnects (the gateway records the leave)
  // and the camera preview stops. Joining again issues a fresh token.
  const doLeave = () => {
    preview.stop();
    join.reset();
    toast.success('You left the class');
  };

  const layoutOptions = layouts.data?.map((l) => l.layout) ?? [...MUSHAF_LAYOUTS];
  const endTime = formatClock(snapshot.endsAt, zone);

  const tabs: PanelTab<PanelValue>[] = [
    { value: 'people', label: 'People', icon: <Users className="h-3.5 w-3.5" />, count: snapshot.participants.length },
    ...(isTeacher
      ? ([
          { value: 'mistakes', label: 'Mistakes', icon: <PenLine className="h-3.5 w-3.5" />, count: markers.length },
          { value: 'recording', label: 'Recording', icon: <Circle className="h-3.5 w-3.5" /> },
        ] as PanelTab<PanelValue>[])
      : []),
    { value: 'connection', label: 'Connection', icon: <Wifi className="h-3.5 w-3.5" /> },
  ];

  const tiles = roster.map((p) =>
    token && p === selfEntry ? (
      <SelfVideoTile key={`${p.userId}-${p.role}`} token={token} name={selfName} preview={preview} lowBandwidth={lowBandwidth} />
    ) : (
      <ParticipantTile key={`${p.userId}-${p.role}`} name={p.displayName} role={p.role} />
    ),
  );
  // Joined but not in the snapshot yet (presence comes from the socket): still show yourself.
  if (token && !selfEntry) {
    tiles.unshift(<SelfVideoTile key="self" token={token} name={selfName} preview={preview} lowBandwidth={lowBandwidth} />);
  }

  return (
    <div className="overflow-clip rounded-3xl bg-green-950 text-white shadow-xl ring-1 ring-green-900" data-testid="classroom-meeting">
      <MeetingTopBar
        title={viewer === 'guardian' ? 'Watching the live class' : 'Live classroom'}
        subtitle={`${formatDateTime(snapshot.startsAt, zone)} – ${endTime} · ${zone.replace(/_/g, ' ')}`}
        status={<StatusPill phase={phase} status={snapshot.status} startsAt={snapshot.startsAt} serverTime={snapshot.serverTime} timeZone={zone} />}
        recording={!!recording?.started}
        participantCount={snapshot.participants.length}
        sync={<SyncIndicator live={!!token && socket.status === 'connected'} pollSeconds={STATE_POLL_MS / 1000} />}
        actions={
          isTeacher ? (
            <Link
              href={`/teacher/classroom/${encodeURIComponent(classId)}/lesson-card`}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-gold px-4 text-sm font-semibold text-green-950 hover:bg-gold-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-green-950"
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              Write lesson card
            </Link>
          ) : undefined
        }
      />

      <div className={showPanel ? 'grid items-start lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]' : 'grid items-start'}>
        {/* ── Stage ─────────────────────────────────────────────────────────── */}
        <section aria-label="Class stage" className="min-w-0 space-y-3 p-3 sm:space-y-4 sm:p-4">
          <RoomStateBanner
            windowState={windowState}
            ended={phase === 'ended'}
            startsAt={snapshot.startsAt}
            endsAt={snapshot.endsAt}
            serverTime={snapshot.serverTime}
            viewer={viewer}
            classId={classId}
            joined={Boolean(token)}
            zone={zone}
          />
          {!showTiles ? null : tiles.length > 0 ? (
            <Filmstrip>{tiles}</Filmstrip>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/65">
              Nobody is on camera yet.
            </p>
          )}

          {isTeacher && page !== null && (
            <div
              role="group"
              aria-label="Mushaf controls"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2"
            >
              <PageNavigator page={page} onChange={changePage} pending={setPage.isPending} tone="dark" />
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="classroom-layout" className="sr-only">
                  Mushaf layout
                </label>
                <Select
                  id="classroom-layout"
                  size="sm"
                  value={snapshot.layout}
                  onChange={(e) => changeLayout(e.target.value as MushafLayout)}
                  disabled={setLayout.isPending}
                  className="w-44"
                >
                  {layoutOptions.map((l) => (
                    <option key={l} value={l}>
                      {layoutLabel(l)}
                    </option>
                  ))}
                </Select>
                <ControlButton
                  tone={snapshot.tajweedColours ? 'gold' : 'neutral'}
                  aria-pressed={snapshot.tajweedColours}
                  onClick={toggleTajweed}
                  loading={setTajweed.isPending}
                  icon={<Palette className="h-3.5 w-3.5" aria-hidden />}
                  className="h-8 px-3 text-xs"
                >
                  Tajweed
                </ControlButton>
              </div>
            </div>
          )}

          {/* The Mushaf, shared as a light page on the dark stage. */}
          <div ref={mushafRef} className="rounded-2xl bg-cream p-3 text-ink shadow-inner sm:p-5 overflow-auto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-green-950/90 px-2.5 py-1 font-medium text-white">
                <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
                <span className="truncate">
                  {isTeacher
                    ? 'You are sharing the Mushaf with the class'
                    : page === null
                      ? `Waiting for ${teacherName ?? 'the teacher'} to share the Mushaf`
                      : `${teacherName ?? 'The teacher'} is sharing the Mushaf`}
                </span>
              </span>
              <span className="font-medium">
                {layoutLabel(snapshot.layout)} · Tajweed colours {snapshot.tajweedColours ? 'on' : 'off'}
                {!isTeacher && snapshot.highlight && ` · reading ${snapshot.highlight.surah}:${snapshot.highlight.ayah}`}
              </span>
            </div>
            <p className="sr-only">
              {isTeacher
                ? 'Your page, highlight, layout and Tajweed layer are shown to everyone in the class.'
                : 'Following the teacher. The page updates automatically.'}
            </p>
            {page === null ? (
              <EmptyState title="Waiting for the teacher" description="The Mushaf appears here as soon as the teacher opens a page." />
            ) : (
              <MushafViewer
                layout={snapshot.layout}
                page={page}
                highlight={snapshot.highlight}
                tajweed={snapshot.tajweedColours}
                selected={isTeacher ? selection : null}
                onSelect={isTeacher ? selectWord : undefined}
                markers={isTeacher ? markers : []}
              />
            )}
          </div>

          <div className="sticky bottom-3 z-10">
            <ControlBar
              start={
                token ? (
                  <VideoProviderChip token={token} />
                ) : (
                  <p className="text-xs text-white/75" role="status">
                    {windowState === 'early'
                      ? 'The room opens 10 minutes before the class starts.'
                      : windowState === 'closed'
                        ? 'This class has finished.'
                        : viewer === 'guardian'
                          ? 'The room is open. Join to watch — you are never on camera.'
                          : 'The room is open.'}
                  </p>
                )
              }
            >
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="View">
                <ControlButton
                  onClick={() => setShowTiles((v) => !v)}
                  aria-pressed={!showTiles}
                  icon={showTiles ? <VideoOff className="h-4 w-4" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
                >
                  {showTiles ? 'Hide videos' : 'Show videos'}
                </ControlButton>
                <ControlButton
                  onClick={() => setShowPanel((v) => !v)}
                  aria-pressed={!showPanel}
                  className="hidden lg:inline-flex"
                  icon={showPanel ? <PanelRightClose className="h-4 w-4" aria-hidden /> : <PanelRightOpen className="h-4 w-4" aria-hidden />}
                >
                  {showPanel ? 'Hide panel' : 'Show panel'}
                </ControlButton>
                <ControlButton onClick={fullScreenMushaf} icon={<Maximize2 className="h-4 w-4" aria-hidden />} aria-label="Show the Mushaf full screen">
                  Full screen
                </ControlButton>
              </div>
              {token ? (
                <MediaControls token={token} preview={preview} lowBandwidth={lowBandwidth} onLeave={doLeave} />
              ) : (
                <ControlButton
                  tone="gold"
                  onClick={doJoin}
                  loading={join.isPending}
                  disabled={windowState !== 'open'}
                  icon={<LogIn className="h-4 w-4" aria-hidden />}
                >
                  {viewer === 'guardian' ? 'Join to watch' : 'Join class'}
                </ControlButton>
              )}
            </ControlBar>
          </div>
        </section>

        {/* ── Side panel ────────────────────────────────────────────────────── */}
        <aside
          hidden={!showPanel}
          aria-label="Classroom panel"
          className="min-w-0 space-y-4 border-t border-white/10 bg-green-900/70 p-3 sm:p-4 lg:min-h-full lg:border-l lg:border-t-0"
        >
          <PanelTabs tabs={tabs} value={panel} onChange={setPanel} idPrefix={panelId} />

          <TabPanel idPrefix={panelId} value="people" active={panel === 'people'}>
            <PanelSection title="In the room">
              {snapshot.participants.length === 0 ? (
                <p className="text-xs text-white/65">Nobody is connected right now.</p>
              ) : (
                <ul className="space-y-1" aria-label="Participants">
                  {roster.map((p) => (
                    <li
                      key={`${p.userId}-${p.role}`}
                      className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5 text-sm"
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-gold-100"
                        aria-hidden
                      >
                        {initialsOf(p.displayName)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-white">
                        {p.displayName}
                        {token && p === selfEntry && <span className="text-white/60"> (you)</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-white/65">{participantRoleLabel(p.role)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelSection>
            {isTeacher && (
              <PanelSection title="Attendance">
                <LightSheet>
                  <AttendancePanel classId={classId} />
                </LightSheet>
              </PanelSection>
            )}
          </TabPanel>

          {isTeacher && (
            <TabPanel idPrefix={panelId} value="mistakes" active={panel === 'mistakes'}>
              <PanelSection
                title="Log a mistake"
                description={selection ? `Selected ${selection.surah}:${selection.ayah}, word ${selection.wordIndex}` : 'Select a word on the Mushaf'}
              >
                <LightSheet>
                  {consent.isLoading ? (
                    <LoadingState label="Loading students…" className="py-6" />
                  ) : consent.isError ? (
                    <ErrorState error={consent.error} onRetry={() => consent.refetch()} title="Could not load the class students" className="py-4" />
                  ) : !started ? (
                    <Alert tone="neutral" title="The class hasn't started yet">
                      Mistakes can be logged from {formatClock(snapshot.startsAt, zone)}, once the lesson begins.
                    </Alert>
                  ) : !studentSidePresent ? (
                    <Alert tone="warning" title="Waiting for the student">
                      Mistakes can be logged once the student has joined — on their own login or on their parent&apos;s device.
                    </Alert>
                  ) : (
                    <MistakeLogger classId={classId} students={students} selection={selection} />
                  )}
                </LightSheet>
              </PanelSection>
              <PanelSection title="Mistakes this class" description="These prefill the lesson card.">
                <MistakeList classId={classId} students={students} />
              </PanelSection>
              {students.length > 0 && (
                <PanelSection title="AI flags to review">
                  <LightSheet>
                    <AiFlagReview classId={classId} students={students} />
                  </LightSheet>
                </PanelSection>
              )}
            </TabPanel>
          )}

          {isTeacher && (
            <TabPanel idPrefix={panelId} value="recording" active={panel === 'recording'}>
              <PanelSection title="Recording" description="Needs consent from every enrolled student.">
                <LightSheet>
                  <RecordingControl classId={classId} joined={!!token} onStarted={setRecording} />
                </LightSheet>
              </PanelSection>
            </TabPanel>
          )}

          <TabPanel idPrefix={panelId} value="connection" active={panel === 'connection'}>
            {token && (
              <PanelSection title="Your room">
                <RoomDetails token={token} />
              </PanelSection>
            )}
            <PanelSection title="Connection">
              <LightSheet>
                <BandwidthPanel lowBandwidth={lowBandwidth} onLowBandwidthChange={setLowBandwidth} />
              </LightSheet>
            </PanelSection>
          </TabPanel>
        </aside>
      </div>
    </div>
  );
}

/**
 * Says plainly why the room can't be used yet or any more: a live countdown until the room
 * opens (10 minutes before the start), or an "ended" card with the next step for each role.
 */
function RoomStateBanner({
  windowState,
  ended,
  startsAt,
  endsAt,
  serverTime,
  viewer,
  classId,
  joined,
  zone,
}: {
  windowState: ReturnType<typeof joinWindow>;
  ended: boolean;
  startsAt: string;
  endsAt: string;
  serverTime: string;
  viewer: ClassroomViewer;
  classId: string;
  joined: boolean;
  zone: string;
}) {
  const now = useServerClock(serverTime);
  const time = (iso: string) => formatClock(iso, zone);

  if (windowState === 'early') {
    const opensAt = new Date(startsAt).getTime() - 10 * 60_000;
    const left = Math.max(0, opensAt - now);
    const mins = Math.floor(left / 60_000);
    const secs = Math.floor((left % 60_000) / 1000);
    const countdown = left >= 3_600_000 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins}:${String(secs).padStart(2, '0')}`;
    return (
      <div role="status" className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-white">
        <p className="font-semibold text-gold-100">The room isn&apos;t open yet</p>
        <p className="mt-0.5 text-white/80">
          Class starts at {time(startsAt)}. You can join from {time(new Date(opensAt).toISOString())} — opens in{' '}
          <span className="font-mono tabular-nums text-white">{countdown}</span>.
        </p>
      </div>
    );
  }

  if (ended || windowState === 'closed') {
    return (
      <div role="status" className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-white">
        <p className="font-semibold">This class has ended</p>
        <p className="mt-0.5 text-white/75">
          It ran until {time(endsAt)}.{' '}
          {joined ? 'You can leave the room.' : 'The room is closed to new joins.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {viewer === 'teacher' && (
            <Link
              href={`/teacher/classroom/${classId}/lesson-card`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-xs font-semibold text-green-950 hover:bg-gold-600"
            >
              <PenLine className="h-3.5 w-3.5" aria-hidden /> Write lesson card
            </Link>
          )}
          <Link
            href={viewer === 'teacher' ? '/teacher/timetable' : viewer === 'guardian' ? '/parent/timetable' : '/student'}
            className="inline-flex h-9 items-center rounded-full border border-white/20 px-4 text-xs font-semibold text-white hover:bg-white/10"
          >
            {viewer === 'guardian' ? 'Back to timetable (rate this class)' : viewer === 'teacher' ? 'Back to timetable' : 'Back to my portal'}
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

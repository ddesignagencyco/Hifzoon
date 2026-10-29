'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDisplayZone } from '@/hooks/useDisplayZone';
import {
  Circle,
  ClipboardList,
  Maximize2,
  MonitorUp,
  Palette,
  PanelRight,
  PenLine,
  RotateCcw,
  Users,
  Wifi,
} from 'lucide-react';
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
  classroomKeys,
  LIVE_POLL_MS,
} from '@/hooks/useClassroom';
import { CLASSROOM_SOCKET_EVENTS, useClassroomSocket } from '@/hooks/useClassroomSocket';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useClassMistakes } from '@/hooks/useClassroomMistakes';
import { useMushafLayouts } from '@/hooks/useMushaf';
import { familyKeys, useFamilies } from '@/hooks/useFamily';
import { familiesApi } from '@/lib/api/modules/families';
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
import {
  AudioUnlock,
  MediaControls,
  MediaIcons,
  QualityBars,
  RemoteAudio,
  RemoteVideo,
  RoomDetails,
  SelfVideoTile,
  useLocalPreview,
} from './VideoPanel';
import { useLiveKit } from './useLiveKit';
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
  ConnectionStatus,
  type RoomConnection,
  TabPanel,
  classPhase,
  useServerClock,
  formatClock,
  initialsOf,
  IconControl,
} from './MeetingChrome';

export type ClassroomViewer = 'teacher' | 'student' | 'guardian';

type PanelValue = 'people' | 'mistakes' | 'recording' | 'connection';

type Participant = ClassroomSnapshot['participants'][number];

const ROLE_ORDER: Record<ParticipantRole, number> = {
  TEACHER: 0,
  STUDENT: 1,
  GUARDIAN_VIEWER: 2,
  SUPERVISOR: 3,
};

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
const STOP_POLLING_AFTER_END_MS = 10 * 60_000;

export function ClassroomRoom({
  classId,
  viewer,
  joinAs,
}: {
  classId: string;
  viewer: ClassroomViewer;
  /** Guardian only: `watch`, or the id of their child to join as. Chosen before entering the room. */
  joinAs?: string | null;
}) {
  const [live, setLive] = useState(false);
  const state = useClassroomState(classId, {
    pollMs: (data) => {
      if (data && Date.now() > new Date(data.endsAt).getTime() + STOP_POLLING_AFTER_END_MS)
        return false;
      return live ? LIVE_POLL_MS : STATE_POLL_MS;
    },
  });

  if (state.isLoading) return <LoadingState label="Opening the classroom…" />;
  // A failed background refresh keeps the last snapshot: the class carries on with a warning.
  if (!state.data) {
    return (
      <>
        <PageHeader eyebrow="Live class" title="Classroom" />
        <Card>
          <ErrorState
            error={state.error}
            onRetry={() => state.refetch()}
            title="Could not open this classroom"
          />
        </Card>
      </>
    );
  }
  return (
    <>
      {state.isError && (
        <Alert tone="warning" title="Connection unstable" className="mb-3">
          The latest class state could not be loaded. You are still in the class; it will catch up
          when the connection returns.
        </Alert>
      )}
      <Room
        classId={classId}
        viewer={viewer}
        snapshot={state.data}
        onLiveChange={setLive}
        joinAs={joinAs ?? null}
      />
    </>
  );
}

function Room({
  classId,
  viewer,
  snapshot,
  onLiveChange,
  joinAs,
}: {
  classId: string;
  viewer: ClassroomViewer;
  snapshot: ClassroomSnapshot;
  onLiveChange: (live: boolean) => void;
  joinAs: string | null;
}) {
  const queryClient = useQueryClient();
  const isTeacher = viewer === 'teacher';
  // Same zone as the timetables (account zone, else device) so a class shows one clock time.
  const zone = useDisplayZone();
  const toast = useToast();
  const panelId = useId();
  const join = useJoinClassroom(classId);
  const token = join.data;
  const { children: ownChildren, ready: childrenReady } = useOwnChildrenInClass(
    snapshot.students,
    viewer === 'guardian',
  );
  const socket = useClassroomSocket(classId, token?.token);
  useEffect(() => onLiveChange(socket.live), [socket.live, onLiveChange]);
  const patchState = (fields: Partial<ClassroomSnapshot>) =>
    queryClient.setQueryData<ClassroomSnapshot>(classroomKeys.state(classId), (prev) =>
      prev ? { ...prev, ...fields } : prev,
    );
  /** Teacher control: instant on this screen, over the socket when live, REST otherwise. */
  const sendControl = (event: string, payload: unknown, fallback: () => void) => {
    if (!socket.live) return fallback();
    socket.emit(event, payload).catch(fallback);
  };
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const preview = useLocalPreview(lowBandwidth);
  // The last join choice, so a dropped video session can fetch a fresh token the same way.
  const lastJoinAs = useRef<string | undefined>(undefined);
  const rejoin = useCallback(() => join.mutate(lastJoinAs.current), [join]);
  const video = useLiveKit(token, preview.stream, rejoin);
  const connection: RoomConnection = !token
    ? 'joining'
    : socket.status === 'connected'
      ? video.status === 'connecting'
        ? 'joining'
        : video.status === 'reconnecting'
          ? 'reconnecting'
          : video.available && video.status === 'error'
            ? 'limited'
            : 'connected'
      : socket.status === 'error' || socket.status === 'unavailable'
        ? 'offline'
        : 'reconnecting';
  // Tell the room our mic/camera state so other tiles can show it (M55).
  const mediaState = preview.stream ? `${preview.micOn}|${preview.camOn && !lowBandwidth}` : 'off';
  useEffect(() => {
    if (!socket.live) return;
    const [mic, cam] =
      mediaState === 'off' ? [false, false] : mediaState.split('|').map((v) => v === 'true');
    socket
      .emit(CLASSROOM_SOCKET_EVENTS.MEDIA_STATE, { micOn: mic, camOn: cam })
      .catch(() => undefined);
    // `socket.emit` is stable; re-send only when the state or the connection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaState, socket.live]);
  const [selection, setSelection] = useState<WordPosition | null>(null);
  const [recording, setRecording] = useState<RecordingStarted | null>(null);
  const [panel, setPanel] = useState<PanelValue>(isTeacher ? 'mistakes' : 'people');

  const consent = useRecordingConsent(classId, isTeacher);
  const students: ClassStudent[] = useMemo(
    () =>
      (consent.data?.students ?? []).map((s) => ({
        studentId: s.studentId,
        displayName: s.displayName,
      })),
    [consent.data],
  );
  const mistakes = useClassMistakes(classId, isTeacher);
  const markers = useMemo(() => mistakes.data ?? [], [mistakes.data]);
  // Students and guardians cannot read the class mistake list, so they see the ones marked live.
  const ownStudentId = token?.studentId ?? null;
  const watchedStudents = useMemo(
    () => new Set(ownStudentId ? [ownStudentId] : ownChildren.map((c) => c.id)),
    [ownStudentId, ownChildren],
  );
  const liveMarkers = useMemo(
    () => socket.liveMistakes.filter((m) => watchedStudents.has(m.studentId)),
    [socket.liveMistakes, watchedStudents],
  );

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
  const studentSidePresent = snapshot.participants.some(
    (p) => p.role === 'STUDENT' || p.role === 'GUARDIAN_VIEWER',
  );
  const page = snapshot.page ?? (isTeacher ? 1 : null);

  // The API names a STUDENT participant after the signed-in account, which is the guardian when a
  // parent joins as their child. In a one-student class that seat can only be that child.
  const onlyStudent = snapshot.students?.length === 1 ? snapshot.students[0] : undefined;
  const roster = useMemo(
    () =>
      snapshot.participants
        .map((p) =>
          p.role === 'STUDENT' && onlyStudent ? { ...p, displayName: onlyStudent.displayName } : p,
        )
        .sort(byRole),
    [snapshot.participants, onlyStudent],
  );
  const selfEntry = token
    ? (roster.find((p) => p.userId === token.sub && p.role === token.role) ??
      roster.find((p) => p.userId === token.sub))
    : undefined;
  // A guardian joined as their child is a STUDENT participant named after the guardian; use the child's name.
  const joinedAsChild =
    token?.role === 'STUDENT' && token.studentId
      ? snapshot.students?.find((s) => s.id === token.studentId)
      : undefined;
  const selfName = joinedAsChild?.displayName ?? selfEntry?.displayName ?? 'You';
  const teacherName = roster.find((p) => p.role === 'TEACHER')?.displayName;

  const changePage = (next: number) => {
    const target = clampPage(next);
    patchState({ page: target });
    sendControl(CLASSROOM_SOCKET_EVENTS.MUSHAF_PAGE, { page: target }, () =>
      setPage.mutate(target, { onError: (e) => toast.error(e) }),
    );
  };

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
    else
      void el
        .requestFullscreen?.()
        .catch(() => toast.error('Full screen is not available in this browser.'));
  };

  const selectWord = (pos: WordPosition) => {
    setSelection(pos);
    patchState({ highlight: pos });
    sendControl(CLASSROOM_SOCKET_EVENTS.MUSHAF_HIGHLIGHT, pos, () =>
      setHighlight.mutate(pos, { onError: (e) => toast.error(e) }),
    );
  };

  const changeLayout = (layout: MushafLayout) =>
    setLayout.mutate(layout, {
      onSuccess: () => toast.success(`Switched to ${layoutLabel(layout)}`),
      onError: (e) => toast.error(e),
    });

  const toggleTajweed = () => {
    const enabled = !snapshot.tajweedColours;
    patchState({ tajweedColours: enabled });
    sendControl(CLASSROOM_SOCKET_EVENTS.MUSHAF_TAJWEED_TOGGLE, { enabled }, () =>
      setTajweed.mutate(enabled, {
        onSuccess: (r) =>
          toast.success(r.tajweedColours ? 'Tajweed colours on' : 'Tajweed colours off'),
        onError: (e) => {
          patchState({ tajweedColours: !enabled });
          toast.error(e);
        },
      }),
    );
  };

  // Opening the room is joining it (the Join choice is made on the page outside): no Join button in here.
  const guardianTarget: { id: string; displayName: string } | 'watch' | null =
    viewer !== 'guardian'
      ? null
      : joinAs === 'watch'
        ? 'watch'
        : !childrenReady
          ? null
          : ((joinAs
              ? ownChildren.find((c) => c.id === joinAs)
              : ownChildren.length === 1
                ? ownChildren[0]
                : undefined) ?? 'watch');
  const targetResolved = viewer !== 'guardian' || guardianTarget !== null;
  const autoJoined = useRef(false);
  const autoJoin =
    targetResolved && !token && windowState === 'open' && !join.isPending && !join.isError;
  useEffect(() => {
    if (!autoJoin || autoJoined.current) return;
    autoJoined.current = true;
    const asChild = guardianTarget && guardianTarget !== 'watch' ? guardianTarget : undefined;
    lastJoinAs.current = asChild?.id;
    join.mutate(asChild?.id, { onError: (e) => toast.error(e) });
  }, [autoJoin, guardianTarget, join, toast]);

  // Leaving drops the room token: the socket disconnects (the gateway records the leave)
  // and the camera preview stops. Joining again issues a fresh token.
  const doLeave = () => {
    autoJoined.current = true;
    preview.stop();
    window.location.assign(
      viewer === 'teacher'
        ? '/teacher/timetable'
        : viewer === 'guardian'
          ? '/parent/timetable'
          : '/student',
    );
    join.reset();
    toast.success('You left the class');
  };

  const layoutOptions = layouts.data?.map((l) => l.layout) ?? [...MUSHAF_LAYOUTS];
  const endTime = formatClock(snapshot.endsAt, zone);

  const tabs: PanelTab<PanelValue>[] = [
    {
      value: 'people',
      label: 'People',
      icon: <Users className="h-3.5 w-3.5" />,
      count: snapshot.participants.length,
    },
    ...(isTeacher
      ? ([
          {
            value: 'mistakes',
            label: 'Mistakes',
            icon: <PenLine className="h-3.5 w-3.5" />,
            count: markers.length,
          },
          { value: 'recording', label: 'Recording', icon: <Circle className="h-3.5 w-3.5" /> },
        ] as PanelTab<PanelValue>[])
      : []),
    { value: 'connection', label: 'Connection', icon: <Wifi className="h-3.5 w-3.5" /> },
  ];

  const tiles = roster.map((p) =>
    token && p === selfEntry ? (
      <SelfVideoTile
        key={`${p.userId}-${p.role}`}
        token={token}
        name={selfName}
        preview={preview}
        lowBandwidth={lowBandwidth}
      />
    ) : (
      <ParticipantTile
        key={`${p.userId}-${p.role}`}
        name={p.displayName}
        role={p.role}
        video={
          video.remote.get(p.userId)?.video ? (
            <RemoteVideo track={video.remote.get(p.userId)!.video!} name={p.displayName} />
          ) : undefined
        }
        overlay={<QualityBars quality={video.quality.get(p.userId)} />}
        mic={
          p.role === 'GUARDIAN_VIEWER' ? undefined : (
            <MediaIcons micOn={p.micOn} camOn={p.camOn} name={p.displayName} />
          )
        }
      />
    ),
  );
  // Joined but not in the snapshot yet (presence comes from the socket): still show yourself.
  if (token && !selfEntry) {
    tiles.unshift(
      <SelfVideoTile
        key="self"
        token={token}
        name={selfName}
        preview={preview}
        lowBandwidth={lowBandwidth}
      />,
    );
  }

  return (
    <div
      className="overflow-clip rounded-3xl bg-green-950 text-white shadow-xl ring-1 ring-green-900"
      data-testid="classroom-meeting"
    >
      {[...video.remote.entries()].map(([id, media]) =>
        media.audio ? <RemoteAudio key={id} track={media.audio} /> : null,
      )}
      <MeetingTopBar
        title={
          viewer === 'guardian'
            ? token?.role === 'STUDENT'
              ? `In class as ${selfName}`
              : `Watching${snapshot.course ? ` ${snapshot.course.name}` : ' the live class'}`
            : (snapshot.course?.name ?? 'Live classroom')
        }
        subtitle={`${formatDateTime(snapshot.startsAt, zone)} – ${endTime} · ${zone.replace(/_/g, ' ')}`}
        status={
          <StatusPill
            phase={phase}
            status={snapshot.status}
            startsAt={snapshot.startsAt}
            serverTime={snapshot.serverTime}
            timeZone={zone}
          />
        }
        recording={!!recording?.started || snapshot.recording?.status === 'RECORDING'}
        participantCount={snapshot.participants.length}
        sync={
          token || windowState === 'open' ? (
            <ConnectionStatus
              state={connection}
              detail={`Live updates: ${socket.status} · Video: ${video.available ? video.status : 'not available'}`}
            />
          ) : null
        }
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

      <div
        className={
          showPanel
            ? 'grid items-start lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]'
            : 'grid items-start'
        }
      >
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
              <PageNavigator
                page={page}
                onChange={changePage}
                pending={setPage.isPending}
                tone="dark"
              />
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
          <div
            ref={mushafRef}
            className="rounded-2xl bg-cream p-3 text-ink shadow-inner sm:p-5 overflow-auto"
          >
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
                {layoutLabel(snapshot.layout)} · Tajweed colours{' '}
                {snapshot.tajweedColours ? 'on' : 'off'}
                {!isTeacher &&
                  snapshot.highlight &&
                  ` · reading ${snapshot.highlight.surah}:${snapshot.highlight.ayah}`}
              </span>
            </div>
            <p className="sr-only">
              {isTeacher
                ? 'Your page, highlight, layout and Tajweed layer are shown to everyone in the class.'
                : 'Following the teacher. The page updates automatically.'}
            </p>
            {page === null ? (
              <EmptyState
                title="Waiting for the teacher"
                description="The Mushaf appears here as soon as the teacher opens a page."
              />
            ) : (
              <MushafViewer
                layout={snapshot.layout}
                page={page}
                highlight={snapshot.highlight}
                tajweed={snapshot.tajweedColours}
                selected={isTeacher ? selection : null}
                onSelect={isTeacher ? selectWord : undefined}
                markers={isTeacher ? markers : liveMarkers}
              />
            )}
          </div>

          <div className="sticky bottom-3 z-10">
            <ControlBar
              start={
                video.audioBlocked ? (
                  <AudioUnlock onUnlock={() => void video.startAudio()} />
                ) : !token && windowState !== 'open' ? (
                  <p className="text-xs text-white/75" role="status">
                    {windowState === 'early'
                      ? 'The room opens 10 minutes before the class starts.'
                      : 'This class has finished.'}
                  </p>
                ) : null
              }
              center={
                token ? (
                  <MediaControls
                    token={token}
                    preview={preview}
                    lowBandwidth={lowBandwidth}
                    onLeave={doLeave}
                  />
                ) : join.isError ? (
                  <ControlButton
                    tone="gold"
                    onClick={() => {
                      autoJoined.current = false;
                      join.reset();
                    }}
                    icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                  >
                    Try again
                  </ControlButton>
                ) : windowState === 'open' ? (
                  <span className="text-xs text-white/75" role="status">
                    Joining the class…
                  </span>
                ) : null
              }
              end={
                <div className="flex items-center gap-2" role="group" aria-label="View">
                  <IconControl
                    label={showTiles ? 'Hide participant videos' : 'Show participant videos'}
                    tone={showTiles ? 'neutral' : 'off'}
                    onClick={() => setShowTiles((v) => !v)}
                    aria-pressed={showTiles}
                    icon={<Users className="h-5 w-5" aria-hidden />}
                  />
                  <IconControl
                    label={showPanel ? 'Hide side panel' : 'Show side panel'}
                    tone={showPanel ? 'neutral' : 'off'}
                    onClick={() => setShowPanel((v) => !v)}
                    aria-pressed={showPanel}
                    className="hidden lg:inline-flex"
                    icon={<PanelRight className="h-5 w-5" aria-hidden />}
                  />
                  <IconControl
                    label="Show the Mushaf full screen"
                    onClick={fullScreenMushaf}
                    icon={<Maximize2 className="h-5 w-5" aria-hidden />}
                  />
                </div>
              }
            />
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
                      <span className="shrink-0 text-[11px] text-white/65">
                        {participantRoleLabel(p.role)}
                      </span>
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
                description={
                  selection
                    ? `Selected ${selection.surah}:${selection.ayah}, word ${selection.wordIndex}`
                    : 'Select a word on the Mushaf'
                }
              >
                <LightSheet>
                  {consent.isLoading ? (
                    <LoadingState label="Loading students…" className="py-6" />
                  ) : consent.isError ? (
                    <ErrorState
                      error={consent.error}
                      onRetry={() => consent.refetch()}
                      title="Could not load the class students"
                      className="py-4"
                    />
                  ) : !started ? (
                    <Alert tone="neutral" title="The class hasn't started yet">
                      Mistakes can be logged from {formatClock(snapshot.startsAt, zone)}, once the
                      lesson begins.
                    </Alert>
                  ) : !studentSidePresent ? (
                    <Alert tone="warning" title="Waiting for the student">
                      Mistakes can be logged once the student has joined — on their own login or on
                      their parent&apos;s device.
                    </Alert>
                  ) : (
                    <MistakeLogger
                      classId={classId}
                      students={students}
                      selection={selection}
                      onLogged={(m) => {
                        // Mirror to the room so the student's screen shows it instantly; the REST save is the record.
                        if (socket.live)
                          socket
                            .emit(CLASSROOM_SOCKET_EVENTS.MISTAKE_MARKED, m)
                            .catch(() => undefined);
                      }}
                    />
                  )}
                </LightSheet>
              </PanelSection>
              <PanelSection
                title="Mistakes this class"
                description="These prefill the lesson card."
              >
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
              <PanelSection
                title="Recording"
                description="Needs consent from every enrolled student."
              >
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
                <BandwidthPanel
                  lowBandwidth={lowBandwidth}
                  onLowBandwidthChange={setLowBandwidth}
                />
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
    const countdown =
      left >= 3_600_000
        ? `${Math.floor(mins / 60)} h ${mins % 60} min`
        : `${mins}:${String(secs).padStart(2, '0')}`;
    return (
      <div
        role="status"
        className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-white"
      >
        <p className="font-semibold text-gold-100">The room isn&apos;t open yet</p>
        <p className="mt-0.5 text-white/80">
          Class starts at {time(startsAt)}. You can join from{' '}
          {time(new Date(opensAt).toISOString())} — opens in{' '}
          <span className="font-mono tabular-nums text-white">{countdown}</span>.
        </p>
      </div>
    );
  }

  if (ended || windowState === 'closed') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-white"
      >
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
            href={
              viewer === 'teacher'
                ? '/teacher/timetable'
                : viewer === 'guardian'
                  ? '/parent/timetable'
                  : '/student'
            }
            className="inline-flex h-9 items-center rounded-full border border-white/20 px-4 text-xs font-semibold text-white hover:bg-white/10"
          >
            {viewer === 'guardian'
              ? 'Back to timetable (rate this class)'
              : viewer === 'teacher'
                ? 'Back to timetable'
                : 'Back to my portal'}
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

/** This class's students who belong to the guardian's active family, so they can join as them (M48). */
function useOwnChildrenInClass(
  classStudents: ClassroomSnapshot['students'] | undefined,
  enabled: boolean,
) {
  const families = useFamilies();
  const familyIds = enabled ? (families.data ?? []).map((f) => f.id) : [];
  const students = useQueries({
    queries: familyIds.map((id) => ({
      queryKey: familyKeys.students(id),
      queryFn: () => familiesApi.listStudents(id),
    })),
  });
  const mineKey = students.map((q) => (q.data ?? []).map((s) => s.id).join(',')).join('|');
  const ready = !enabled || (families.isFetched && students.every((q) => q.isFetched));
  const children = useMemo(() => {
    const mine = new Set(mineKey.split(/[|,]/).filter(Boolean));
    return (classStudents ?? []).filter((s) => mine.has(s.id));
  }, [mineKey, classStudents]);
  return { children, ready };
}

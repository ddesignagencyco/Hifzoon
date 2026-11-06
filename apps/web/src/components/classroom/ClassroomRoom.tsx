'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDisplayZone } from '@/hooks/useDisplayZone';
import {
  Check,
  Circle,
  ClipboardList,
  Clock,
  ListChecks,
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
  Modal,
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
  classroomApi,
  joinWindow,
  participantRoleLabel,
} from '@/lib/api/modules/classroom';
import { MUSHAF_LAYOUTS, MushafLayout, clampPage, layoutLabel } from '@/lib/api/modules/mushaf';
import { MushafViewer, WordPosition } from '@/components/mushaf/MushafViewer';
import { PageNavigator } from '@/components/mushaf/PageNavigator';
import { LogMistakeDialog, type ClassStudent, type LogTarget } from './LogMistakeDialog';
import { isMushafCourse, type MarkMistakeInput } from '@/lib/api/modules/lessons';
import { BOARD_MEANING_LANGUAGES, WordMeaningPicker, useWordMeaningLanguage } from './WordMeanings';
import { LessonBoard, LessonPosition, type BoardMark } from './LessonBoard';
import { boardForCourse, describeBoardItem } from '@/lib/data/lesson-boards';
import { useDuaCollection } from '@/lib/api/modules/duas';
import {
  MistakesModal,
  boardPositionOf,
  useEarlierOpenMistakes,
  type GoToTarget,
  type MistakesTab,
} from './MistakesModal';
import { LessonCardComposer } from '@/components/lessons/LessonCardComposer';
import { LessonCardDetail } from '@/components/lessons/LessonCardDetail';
import { AttendancePanel } from './AttendancePanel';
import { RecordingControl } from './RecordingControl';
import { recordingEnabled } from '@/lib/features';
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

type PanelValue = 'people' | 'recording' | 'connection';

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
  const [panel, setPanel] = useState<PanelValue>('people');
  // Quick "log a mistake" dialog, the Mistakes window and the lesson card window.
  const [logOpen, setLogOpen] = useState(false);
  const [mistakesOpen, setMistakesOpen] = useState(false);
  const [mistakesTab, setMistakesTab] = useState<MistakesTab>('class');
  const [cardWindow, setCardWindow] = useState<null | 'compose' | 'view'>(null);
  const [submittedCardId, setSubmittedCardId] = useState<string | null>(null);
  // The Arabic of the Mushaf word just tapped, for the log dialog (the viewer reports only the position).
  const tappedWordText = useRef<string | null>(null);
  const [selectionText, setSelectionText] = useState<string | null>(null);

  const consent = useRecordingConsent(classId, isTeacher);
  const students: ClassStudent[] = useMemo(
    () =>
      (consent.data?.students ?? []).map((s) => ({
        studentId: s.studentId,
        displayName: s.displayName,
      })),
    [consent.data],
  );
  // Everyone in the room reads the class's mistakes: the teacher all of them, a student or
  // guardian only their own child's (the API scopes it). Live socket marks arrive first.
  const mistakes = useClassMistakes(classId);
  // Only Mushaf mistakes have a word to underline.
  const markers = useMemo(() => onMushaf(mistakes.data ?? []), [mistakes.data]);
  const ownStudentId = token?.studentId ?? null;
  const watchedStudents = useMemo(
    () => new Set(ownStudentId ? [ownStudentId] : ownChildren.map((c) => c.id)),
    [ownStudentId, ownChildren],
  );
  // Whose mistakes the room lists: the teacher's class, or the family's own child(ren) here.
  const familyStudents: ClassStudent[] = useMemo(
    () =>
      (snapshot.students ?? [])
        .filter((s) => watchedStudents.has(s.id))
        .map((s) => ({ studentId: s.id, displayName: s.displayName })),
    [snapshot.students, watchedStudents],
  );
  const mistakeStudents = isTeacher ? students : familyStudents;
  const liveMarkers = useMemo(
    () => [...markers, ...onMushaf(socket.liveMistakes.filter((m) => watchedStudents.has(m.studentId)))],
    [markers, socket.liveMistakes, watchedStudents],
  );
  // A mark made live is saved by the teacher's request; read the list again to show it.
  const liveCount = socket.liveMistakes.length;
  const refetchMistakes = mistakes.refetch;
  useEffect(() => {
    if (liveCount > 0) void refetchMistakes();
  }, [liveCount, refetchMistakes]);

  const setPage = useSetClassroomPage(classId);
  const setHighlight = useSetClassroomHighlight(classId);
  const setLayout = useSetClassroomLayout(classId);
  const setTajweed = useSetClassroomTajweed(classId);
  const layouts = useMushafLayouts();
  const maxPageForLayout = layouts.data?.find((l) => l.layout === snapshot.layout)?.maxPage ?? 604;

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
  const canLog = isTeacher && started && studentSidePresent && students.length > 0;
  const logBlockedReason = !started
    ? `Mistakes can be logged from ${formatClock(snapshot.startsAt, zone)}, once the lesson begins.`
    : !studentSidePresent
      ? 'Mistakes can be logged once the student has joined.'
      : students.length === 0
        ? 'No students are enrolled in this class.'
        : null;

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
    const target = clampPage(next, maxPageForLayout);
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
  const [wordLanguage, setWordLanguage] = useWordMeaningLanguage();
  // The Duas board has English and Urdu only; any other choice would silently show English.
  const boardLanguage = wordLanguage === null ? null : wordLanguage === 'ur' ? 'ur' : 'en';
  const fullScreenMushaf = () => {
    const el = mushafRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void el
        .requestFullscreen?.()
        .catch(() => toast.error('Full screen is not available in this browser.'));
  };

  const highlightWord = (pos: WordPosition) => {
    setSelection(pos);
    patchState({ highlight: pos });
    sendControl(CLASSROOM_SOCKET_EVENTS.MUSHAF_HIGHLIGHT, pos, () =>
      setHighlight.mutate(pos, { onError: (e) => toast.error(e) }),
    );
  };
  // A tap points the class at a word (shared live); tapping the same word again clears it.
  const selectWord = (pos: WordPosition) => {
    const same =
      selection?.surah === pos.surah && selection.ayah === pos.ayah && selection.wordIndex === pos.wordIndex;
    if (!same) {
      setSelectionText(tappedWordText.current);
      return highlightWord(pos);
    }
    setSelection(null);
    setSelectionText(null);
    patchState({ highlight: null });
    // Quietly: an API without the clear call keeps the old highlight until the next word.
    sendControl(CLASSROOM_SOCKET_EVENTS.MUSHAF_HIGHLIGHT, { clear: true }, () =>
      void classroomApi.clearHighlight(classId).catch(() => undefined),
    );
  };

  // "Go to" on an earlier mistake: page-of answers in Madani pages, so switch to Madani first.
  const goToMistake = ({ page: target, position }: GoToTarget) => {
    const turn = () => {
      changePage(target);
      if (position) highlightWord(position);
    };
    if (snapshot.layout !== 'MADANI_15') setLayout.mutate('MADANI_15', { onSuccess: turn, onError: (e) => toast.error(e) });
    else turn();
  };

  const changeLayout = (layout: MushafLayout) =>
    setLayout.mutate(layout, {
      onSuccess: () => toast.success(`Switched to ${layoutLabel(layout)}`),
      onError: (e) => toast.error(e),
    });

  // Qaida and Duas classes read from their own board; every other course uses the Mushaf.
  const board = boardForCourse(snapshot.course?.type);
  // Mistakes on a Mushaf word, or (Qaida, Duas, Arabic, Islamic Studies) on a lesson item.
  const mushafMistakes = isMushafCourse(snapshot.course?.type);
  const duaCollection = useDuaCollection(board === 'DUAS');
  const onScreen = describeBoardItem(snapshot.lesson ?? null, duaCollection.data?.categories);
  // A tapped dua word belongs to the dua open when it was tapped; another dua clears it.
  const duaKey = snapshot.lesson ? `${snapshot.lesson.lesson}:${snapshot.lesson.item ?? 0}` : '';
  const [duaWord, setDuaWord] = useState<{ key: string; index: number; text: string } | null>(null);
  const pickedWord = board === 'DUAS' && duaWord?.key === duaKey ? duaWord : null;
  // The class sees the dua word the teacher points at (shared with the lesson position).
  const sharedDuaWord = snapshot.lesson?.board === 'DUAS' ? (snapshot.lesson.word ?? null) : null;
  const changeLesson = (position: LessonPosition & { word?: number | null }) => {
    const next = { ...position, word: position.word ?? null };
    patchState({ lesson: next });
    sendControl(CLASSROOM_SOCKET_EVENTS.LESSON_ITEM, next, () =>
      void classroomApi.setLesson(classId, next).catch((e: Error) => toast.error(e.message)),
    );
  };
  // A Qaida tile is the thing read: tapping it points the class at it; tapping it again clears it.
  const selectLesson = (position: LessonPosition) => {
    const current = snapshot.lesson;
    const same =
      position.board === 'QAIDA' &&
      position.item !== null &&
      current?.board === 'QAIDA' &&
      current.lesson === position.lesson &&
      current.item === position.item;
    changeLesson(same ? { ...position, item: null } : position);
  };
  const pickDuaWord = (word: { index: number; text: string } | null) => {
    setDuaWord(word ? { key: duaKey, ...word } : null);
    if (snapshot.lesson) changeLesson({ ...snapshot.lesson, word: word?.index ?? null });
  };
  // The dua whose words are on screen: a chapter opens on its first dua.
  const openDua =
    snapshot.lesson?.board === 'DUAS'
      ? describeBoardItem({ ...snapshot.lesson, item: snapshot.lesson.item ?? 0 }, duaCollection.data?.categories)
      : null;
  // What "Log mistake" logs against: the selected Mushaf word, dua word or Qaida tile.
  const logTarget: LogTarget | null = !board
    ? selection
      ? { kind: 'word', position: selection, text: selectionText }
      : null
    : board === 'DUAS'
      ? pickedWord && (openDua ?? onScreen)
        ? { kind: 'item', label: `${openDua ?? onScreen} · word ${pickedWord.index} (${pickedWord.text})` }
        : null
      : snapshot.lesson?.board === 'QAIDA' && snapshot.lesson.item !== null
        ? { kind: 'item', label: onScreen }
        : null;
  const logButtonTitle = logBlockedReason ?? (logTarget ? 'Log a mistake on the selected word' : 'Tap a word first');
  // Mirror a logged mistake to the room so the student's screen shows it instantly; the REST save is the record.
  const mirrorMistake = (m: MarkMistakeInput) => {
    if (socket.live) socket.emit(CLASSROOM_SOCKET_EVENTS.MISTAKE_MARKED, m).catch(() => undefined);
  };
  // The board opens on lesson 1 before the teacher picks anything. Record that opening too, or a
  // class that only read the first chapter would reach the lesson card with nothing covered.
  const openingRecorded = useRef(false);
  useEffect(() => {
    if (!isTeacher || !board || openingRecorded.current) return;
    openingRecorded.current = true;
    if (snapshot.lesson?.board === board) return;
    void classroomApi.setLesson(classId, { board, lesson: 1, item: null }).catch(() => undefined);
  }, [isTeacher, board, classId, snapshot.lesson]);

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

  // Only layouts the Quran source can serve; the current one stays listed so it reads true.
  const layoutOptions =
    layouts.data?.filter((l) => l.available !== false || l.layout === snapshot.layout).map((l) => l.layout) ?? [
      ...MUSHAF_LAYOUTS,
    ];
  const endTime = formatClock(snapshot.endsAt, zone);

  const earlier = useEarlierOpenMistakes(classId, mistakeStudents, mushafMistakes);
  // Board mistakes underlined on everyone's board, like the Mushaf's markers: this class's (red,
  // green once fixed) and the open ones from earlier classes (lighter). Live marks refetch the list.
  const boardMarks: BoardMark[] = !board
    ? []
    : [
        ...(mistakes.data ?? []).map((m) => ({ m, earlier: false })),
        ...earlier.rows.map((m) => ({ m, earlier: true })),
      ].flatMap(({ m, earlier: old }) => {
        const pos = boardPositionOf(m.itemRef, board, duaCollection.data?.categories);
        if (!pos) return [];
        const word = /· word (\d+)/.exec(m.itemRef ?? '');
        return [{ lesson: pos.lesson, item: pos.item, word: word ? Number(word[1]) : null, fixed: Boolean(m.resolvedAt), earlier: old }];
      });
  const classCount = mistakes.data?.length ?? 0;
  const earlierCount = earlier.rows.length;
  const openMistakes = (tab: MistakesTab) => {
    setMistakesTab(tab);
    setMistakesOpen(true);
  };

  const tabs: PanelTab<PanelValue>[] = [
    {
      value: 'people',
      label: 'People',
      icon: <Users className="h-3.5 w-3.5" />,
      count: snapshot.participants.length,
    },
    ...(isTeacher && recordingEnabled()
      ? ([{ value: 'recording', label: 'Recording', icon: <Circle className="h-3.5 w-3.5" /> }] as PanelTab<PanelValue>[])
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
      className="overflow-clip rounded-3xl bg-green-950 text-white shadow-xl ring-1 ring-green-900 lg:flex lg:h-[calc(100dvh-7.5rem)] lg:min-h-[36rem] lg:flex-col"
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
            endsAt={snapshot.endsAt}
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openMistakes('class')}
              className={HEADER_BUTTON_QUIET}
              aria-label={`Mistakes: ${classCount} this class, ${earlierCount} open from earlier`}
            >
              <ListChecks className="h-4 w-4" aria-hidden />
              Mistakes
              <span className="tabular-nums text-white/60">{classCount + earlierCount}</span>
            </button>
            {isTeacher && (
              <LessonCardButton
                endsAt={snapshot.endsAt}
                serverTime={snapshot.serverTime}
                zone={zone}
                submitted={Boolean(submittedCardId)}
                onOpen={() => setCardWindow(submittedCardId ? 'view' : 'compose')}
              />
            )}
          </div>
        }
      />

      <div
        className={
          showPanel
            ? 'grid items-start lg:min-h-0 lg:flex-1 lg:items-stretch lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_360px]'
            : 'grid items-start lg:min-h-0 lg:flex-1 lg:items-stretch'
        }
      >
        {/* ── Stage ─────────────────────────────────────────────────────────── */}
        <section aria-label="Class stage" className="min-w-0 space-y-3 p-3 sm:space-y-4 sm:p-4 lg:overflow-y-auto">
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
            onWriteCard={() => setCardWindow(submittedCardId ? 'view' : 'compose')}
          />
          {!showTiles ? null : tiles.length > 0 ? (
            <Filmstrip>{tiles}</Filmstrip>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/65">
              Nobody is on camera yet.
            </p>
          )}

          {isTeacher && !board && page !== null && (
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
                maxPage={maxPageForLayout}
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
            onClickCapture={
              isTeacher
                ? (e) => {
                    const word = (e.target as HTMLElement).closest('button[aria-label^="Surah "]');
                    tappedWordText.current = word
                      ? (word.querySelector('.mushaf-word')?.textContent ?? word.textContent)?.trim() || null
                      : null;
                  }
                : undefined
            }
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-green-950/90 px-2.5 py-1 font-medium text-white">
                <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
                <span className="truncate">
                  {board
                    ? isTeacher
                      ? `You are leading the ${board === 'QAIDA' ? 'Qaida' : 'duas'} lesson — the class sees what you open`
                      : `${teacherName ?? 'The teacher'} is leading the ${board === 'QAIDA' ? 'Qaida' : 'duas'} lesson`
                    : isTeacher
                      ? 'You are sharing the Mushaf with the class'
                      : page === null
                        ? `Waiting for ${teacherName ?? 'the teacher'} to share the Mushaf`
                        : `${teacherName ?? 'The teacher'} is sharing the Mushaf`}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {isTeacher && (
                  <button
                    type="button"
                    aria-disabled={!logTarget || !canLog}
                    title={logButtonTitle}
                    onClick={() => {
                      if (!canLog) return toast.error(logBlockedReason ?? 'Mistakes cannot be logged yet');
                      if (!logTarget) return toast.error('Tap a word first, then log the mistake on it.');
                      setLogOpen(true);
                    }}
                    className={
                      logTarget && canLog
                        ? 'inline-flex h-8 items-center gap-1.5 rounded-full bg-green-800 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold'
                        : 'inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-full border border-line bg-white/70 px-3 text-xs font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold'
                    }
                  >
                    <PenLine className="h-3.5 w-3.5" aria-hidden />
                    Log mistake
                  </button>
                )}
                {!board && (
                  <span className="font-medium">
                    {layoutLabel(snapshot.layout)} · Tajweed colours{' '}
                    {snapshot.tajweedColours ? 'on' : 'off'}
                    {!isTeacher &&
                      snapshot.highlight &&
                      ` · reading ${snapshot.highlight.surah}:${snapshot.highlight.ayah}`}
                  </span>
                )}
                {/* Letters have no meaning to show; the Mushaf and duas do. */}
                {board === 'DUAS' ? (
                  <WordMeaningPicker value={boardLanguage} onChange={setWordLanguage} only={BOARD_MEANING_LANGUAGES} />
                ) : (
                  board !== 'QAIDA' && <WordMeaningPicker value={wordLanguage} onChange={setWordLanguage} />
                )}
              </span>
            </div>
            <p className="sr-only">
              {isTeacher
                ? 'Your page, highlight, layout and Tajweed layer are shown to everyone in the class.'
                : 'Following the teacher. The page updates automatically.'}
            </p>
            {board ? (
              <LessonBoard
                board={board}
                position={snapshot.lesson ?? null}
                isTeacher={isTeacher}
                onSelect={selectLesson}
                meaningLanguage={boardLanguage}
                selectedWord={isTeacher ? (pickedWord?.index ?? null) : sharedDuaWord}
                onPickWord={isTeacher && board === 'DUAS' ? pickDuaWord : undefined}
                marks={boardMarks}
              />
            ) : page === null ? (
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
                wordLanguage={wordLanguage}
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
          className="flex min-w-0 flex-col gap-4 border-t border-white/10 bg-green-900/70 p-3 sm:p-4 lg:min-h-0 lg:border-l lg:border-t-0"
        >
          <div className="shrink-0">
            <PanelTabs tabs={tabs} value={panel} onChange={setPanel} idPrefix={panelId} />
          </div>
          <div className="space-y-4 lg:-me-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pe-2">

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
            <TabPanel idPrefix={panelId} value="recording" active={panel === 'recording'}>
              <PanelSection
                title="Recording"
                description="Needs consent from every enrolled student."
              >
                <LightSheet>
                  <RecordingControl
                    classId={classId}
                    joined={!!token}
                    onStarted={setRecording}
                    active={snapshot.recording?.status === 'RECORDING'}
                  />
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
          </div>
        </aside>
      </div>

      {isTeacher && (
        <LogMistakeDialog
          open={logOpen && logTarget !== null}
          onClose={() => setLogOpen(false)}
          classId={classId}
          courseType={snapshot.course?.type}
          students={students}
          target={logTarget}
          onLogged={mirrorMistake}
        />
      )}
      <MistakesModal
        open={mistakesOpen}
        onClose={() => setMistakesOpen(false)}
        classId={classId}
        viewer={isTeacher ? 'teacher' : 'family'}
        students={mistakeStudents}
        mushaf={mushafMistakes}
        board={board}
        tab={mistakesTab}
        onTabChange={setMistakesTab}
        readerBase={viewer === 'student' ? '/student/quran' : '/parent/quran'}
        onGoTo={isTeacher && !board ? goToMistake : undefined}
        onGoToBoard={isTeacher && board ? changeLesson : undefined}
      />
      {isTeacher && (
        <Modal
          open={cardWindow !== null}
          onClose={() => setCardWindow(null)}
          title={cardWindow === 'view' ? 'Submitted lesson card' : 'Lesson card'}
          description={
            cardWindow === 'view'
              ? 'As the family sees it. Edit it from Lesson cards.'
              : 'Confirm what was covered. The family is notified once it is submitted; the card locks 48 hours later.'
          }
          size="xl"
          fullScreenOnMobile
        >
          {cardWindow === 'view' && submittedCardId ? (
            <LessonCardDetail lessonCardId={submittedCardId} embedded />
          ) : (
            <LessonCardComposer
              classId={classId}
              embedded
              onSubmitted={(card) => {
                setSubmittedCardId(card.id);
                setCardWindow(null);
              }}
              onViewCard={(id) => {
                setSubmittedCardId(id);
                setCardWindow('view');
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

/**
 * Header "Write lesson card": the API takes a card from 10 minutes before the class ends (the
 * rule in assertClassFinished). Before then it looks disabled, says when, and explains on click;
 * a timer turns it on at that minute. After a submit it reads "Lesson card ✓ · View".
 */
export function LessonCardButton({
  endsAt,
  serverTime,
  zone,
  submitted,
  onOpen,
}: {
  endsAt: string;
  serverTime: string;
  zone: string;
  submitted: boolean;
  onOpen: () => void;
}) {
  const toast = useToast();
  const now = useServerClock(serverTime);
  const from = new Date(endsAt).getTime() - LESSON_CARD_LEAD_MS;
  const fromText = formatClock(new Date(from).toISOString(), zone);
  if (submitted) {
    return (
      <button type="button" onClick={onOpen} className={HEADER_BUTTON_DONE} aria-label="Lesson card submitted — view it">
        <Check className="h-4 w-4" aria-hidden />
        Lesson card
        <span className="font-medium text-emerald-100/70">· View</span>
      </button>
    );
  }
  if (now < from) {
    return (
      <button
        type="button"
        aria-disabled
        data-testid="lesson-card-locked"
        title={`You can write the lesson card from ${fromText}`}
        onClick={() => toast.error(`You can write the lesson card from ${fromText} (10 minutes before the class ends).`)}
        className={HEADER_BUTTON_LOCKED}
      >
        <Clock className="h-4 w-4" aria-hidden />
        Lesson card
        <span className="font-medium tabular-nums text-white/45">· from {fromText}</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={HEADER_BUTTON_PRIMARY}>
      <ClipboardList className="h-4 w-4" aria-hidden />
      Write lesson card
    </button>
  );
}

/** A lesson card can be submitted from this long before the class ends. */
const LESSON_CARD_LEAD_MS = 10 * 60_000;

const HEADER_BUTTON =
  'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-green-950';
const HEADER_BUTTON_QUIET = `${HEADER_BUTTON} border border-white/15 text-white hover:bg-white/10`;
const HEADER_BUTTON_PRIMARY = `${HEADER_BUTTON} bg-gold text-green-950 hover:bg-gold-100`;
const HEADER_BUTTON_LOCKED = `${HEADER_BUTTON} cursor-not-allowed border border-white/10 bg-white/[0.04] text-white/55`;
const HEADER_BUTTON_DONE = `${HEADER_BUTTON} border border-emerald-300/30 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60`;

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
  onWriteCard,
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
  onWriteCard?: () => void;
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
          {viewer === 'teacher' &&
            (onWriteCard ? (
              <button
                type="button"
                onClick={onWriteCard}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-xs font-semibold text-green-950 hover:bg-gold-600 cursor-pointer"
              >
                <PenLine className="h-3.5 w-3.5" aria-hidden /> Write lesson card
              </button>
            ) : (
              <Link
                href={`/teacher/classroom/${classId}/lesson-card`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-xs font-semibold text-green-950 hover:bg-gold-600"
              >
                <PenLine className="h-3.5 w-3.5" aria-hidden /> Write lesson card
              </Link>
            ))}
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

/** The mistakes that sit on a word of the Mushaf (other courses log against a lesson item). */
function onMushaf(rows: Array<{ surah: number | null; ayah: number | null; wordIndex: number | null }>) {
  return rows.flatMap((m) =>
    m.surah !== null && m.ayah !== null && m.wordIndex !== null
      ? [{ surah: m.surah, ayah: m.ayah, wordIndex: m.wordIndex }]
      : [],
  );
}

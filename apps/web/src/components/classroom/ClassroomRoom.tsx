'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, LogIn, Palette, Radio, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  UiButton,
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
import { VideoPanel } from './VideoPanel';

export type ClassroomViewer = 'teacher' | 'student' | 'guardian';

/**
 * The live classroom shared by the teacher, student and guardian portals
 * (FR-CLS-01…05, 11–14). The teacher drives the Mushaf over REST; everyone follows the
 * state snapshot by polling, sped up by the classroom socket when it is available.
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
  const toast = useToast();
  const join = useJoinClassroom(classId);
  const socket = useClassroomSocket(classId, join.data?.token);
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [selection, setSelection] = useState<WordPosition | null>(null);

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
  const windowState = joinWindow(snapshot.startsAt, snapshot.endsAt, new Date(snapshot.serverTime).getTime());
  const page = snapshot.page ?? (isTeacher ? 1 : null);

  const changePage = (next: number) =>
    setPage.mutate(clampPage(next), { onError: (e) => toast.error(e) });

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

  const layoutOptions = layouts.data?.map((l) => l.layout) ?? [...MUSHAF_LAYOUTS];

  return (
    <>
      <PageHeader
        eyebrow={viewer === 'guardian' ? 'Watching live class' : 'Live class'}
        title="Classroom"
        description={`${formatDateTime(snapshot.startsAt)} – ${new Date(snapshot.endsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
        actions={
          isTeacher ? (
            <Link
              href={`/teacher/classroom/${encodeURIComponent(classId)}/lesson-card`}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold bg-gold text-green-950 hover:bg-gold-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              <ClipboardList className="w-4 h-4" aria-hidden />
              Write lesson card
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Class status">
        <StatusBadge status={snapshot.status} />
        {windowState === 'early' && <Badge tone="gold">Room not open yet</Badge>}
        {windowState === 'closed' && <Badge tone="red">Room closed</Badge>}
        {windowState === 'open' && <Badge tone="green">Room open</Badge>}
        <Badge tone="neutral">
          <Users className="w-3 h-3" aria-hidden />
          {snapshot.participants.length} connected
        </Badge>
        <SyncBadge joined={!!join.data} status={socket.status} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader
              title="Mushaf"
              description={
                isTeacher
                  ? 'Your page, highlight, layout and Tajweed layer are shown to everyone in the class.'
                  : 'Following the teacher. The page updates automatically.'
              }
            />
            <CardBody className="space-y-4">
              {isTeacher && page !== null && (
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <PageNavigator page={page} onChange={changePage} pending={setPage.isPending} />
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="classroom-layout" className="sr-only">
                      Mushaf layout
                    </label>
                    <Select
                      id="classroom-layout"
                      value={snapshot.layout}
                      onChange={(e) => changeLayout(e.target.value as MushafLayout)}
                      disabled={setLayout.isPending}
                      className="h-8 text-xs w-auto rounded-full"
                    >
                      {layoutOptions.map((l) => (
                        <option key={l} value={l}>
                          {layoutLabel(l)}
                        </option>
                      ))}
                    </Select>
                    <UiButton
                      size="sm"
                      variant={snapshot.tajweedColours ? 'primary' : 'secondary'}
                      aria-pressed={snapshot.tajweedColours}
                      onClick={toggleTajweed}
                      loading={setTajweed.isPending}
                      icon={<Palette className="w-3.5 h-3.5" aria-hidden />}
                    >
                      Tajweed
                    </UiButton>
                  </div>
                </div>
              )}
              {!isTeacher && (
                <p className="text-xs text-muted">
                  {layoutLabel(snapshot.layout)} · Tajweed colours {snapshot.tajweedColours ? 'on' : 'off'}
                  {snapshot.highlight && ` · reading ${snapshot.highlight.surah}:${snapshot.highlight.ayah}`}
                </p>
              )}
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
            </CardBody>
          </Card>

          {isTeacher && (
            <Card>
              <CardHeader title="Mistakes this class" description="These prefill the lesson card." />
              <CardBody className="space-y-5">
                <MistakeList classId={classId} students={students} />
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">AI flags to review</h4>
                  <AiFlagReview classId={classId} students={students} />
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Video" />
            <CardBody>
              {join.data ? (
                <VideoPanel token={join.data} lowBandwidth={lowBandwidth} />
              ) : (
                <div className="space-y-3">
                  {windowState === 'early' && (
                    <Alert tone="neutral">The room opens 10 minutes before the class starts.</Alert>
                  )}
                  {windowState === 'closed' && <Alert tone="neutral">This class has finished.</Alert>}
                  <UiButton
                    className="w-full"
                    onClick={doJoin}
                    loading={join.isPending}
                    disabled={windowState !== 'open'}
                    icon={<LogIn className="w-4 h-4" aria-hidden />}
                  >
                    {viewer === 'guardian' ? 'Join to watch' : 'Join class'}
                  </UiButton>
                </div>
              )}
            </CardBody>
          </Card>

          {isTeacher && (
            <Card>
              <CardHeader title="Log a mistake" description={selection ? `Selected ${selection.surah}:${selection.ayah}, word ${selection.wordIndex}` : 'Select a word on the Mushaf'} />
              <CardBody>
                {consent.isLoading ? (
                  <LoadingState label="Loading students…" />
                ) : consent.isError ? (
                  <ErrorState error={consent.error} onRetry={() => consent.refetch()} title="Could not load the class students" />
                ) : (
                  <MistakeLogger classId={classId} students={students} selection={selection} />
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="In the room" />
            <CardBody>
              {snapshot.participants.length === 0 ? (
                <p className="text-xs text-muted">Nobody is connected right now.</p>
              ) : (
                <ul className="space-y-1.5" aria-label="Participants">
                  {snapshot.participants.map((p) => (
                    <li key={`${p.userId}-${p.role}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink truncate">{p.displayName}</span>
                      <span className="text-[11px] text-muted shrink-0">{participantRoleLabel(p.role)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {isTeacher && (
            <>
              <Card>
                <CardHeader title="Recording" description="Needs consent from every enrolled student." />
                <CardBody>
                  <RecordingControl classId={classId} joined={!!join.data} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Attendance" />
                <CardBody>
                  <AttendancePanel classId={classId} />
                </CardBody>
              </Card>
            </>
          )}

          <Card>
            <CardHeader title="Connection" />
            <CardBody>
              <BandwidthPanel lowBandwidth={lowBandwidth} onLowBandwidthChange={setLowBandwidth} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function SyncBadge({ joined, status }: { joined: boolean; status: string }) {
  const live = joined && status === 'connected';
  return (
    <Badge tone={live ? 'green' : 'neutral'}>
      <Radio className={cn('w-3 h-3', live && 'animate-pulse')} aria-hidden />
      {live ? 'Realtime connected' : `Syncing every ${STATE_POLL_MS / 1000}s`}
    </Badge>
  );
}

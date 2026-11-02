'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, PanelRight, RotateCcw, UserX, Users } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  ConnectionStatus,
  ControlBar,
  ControlButton,
  Filmstrip,
  LightSheet,
  MeetingTopBar,
  PanelSection,
  PanelTab,
  PanelTabs,
  type RoomConnection,
  StatusPill,
  TabPanel,
  classPhase,
  initialsOf,
  ParticipantTile,
  IconControl,
  useServerClock,
} from '@/components/classroom/MeetingChrome';
import {
  AudioUnlock,
  MediaControls,
  MediaIcons,
  QualityBars,
  RemoteAudio,
  RemoteVideo,
  SelfVideoTile,
  useLocalPreview,
} from '@/components/classroom/VideoPanel';
import { useLiveKit } from '@/components/classroom/useLiveKit';
import {
  INTERVIEW_LIVE_POLL_MS,
  INTERVIEW_STATE_POLL_MS,
  useInterviewAttendance,
  useInterviewState,
  useJoinInterview,
  useSaveInterviewNotes,
} from '@/hooks/useInterviews';
import { useInterviewSocket } from '@/hooks/useInterviewSocket';
import {
  INTERVIEW_EARLY_OPEN_MINUTES,
  InterviewRoomToken,
  InterviewSnapshot,
  interviewJoinWindow,
  interviewRoleLabel,
  interviewStatusLabel,
  isInterviewClosed,
} from '@/lib/api/modules/interviews';
import { InterviewOutcomeForm } from './InterviewOutcomeForm';

export type InterviewViewer = 'staff' | 'applicant';

type PanelValue = 'people' | 'notes' | 'verdict';

/**
 * The live hiring interview room — the same meeting shell as the classroom, minus
 * everything that belongs to a lesson.
 *
 * What is deliberately *not* here: the Mushaf, the Tajweed layer, the whiteboard, the
 * mistake logger and recording. An interview is Qari shb talking to an applicant and
 * writing down what he thinks; adding the lesson surface would have meant inventing a
 * student, an enrolment and a course for someone who has none.
 *
 * Both sides render this component. The applicant's build is the same room with the
 * notes and verdict panels absent — not hidden by CSS, absent: the API never sends them
 * a `notes` field, so there is nothing to leak if a panel were toggled open.
 */
export function InterviewRoom({
  interviewId,
  viewer,
  roomToken,
  applicantToken,
  onLeave,
}: {
  interviewId: string;
  viewer: InterviewViewer;
  /**
   * The applicant's room token, already redeemed by the lobby page. Staff pass nothing and
   * the room fetches its own on mount.
   */
  roomToken?: InterviewRoomToken;
  /**
   * The applicant's raw emailed token. Needed as well as `roomToken` because the room
   * polls state as its fallback, and the applicant has to use the public route for that.
   */
  applicantToken?: string;
  onLeave?: () => void;
}) {
  const toast = useToast();
  const panelId = useId();
  const isStaff = viewer === 'staff';

  const staffJoin = useJoinInterview(interviewId);
  const [staffToken, setStaffToken] = useState<InterviewRoomToken | null>(null);
  const token = roomToken ?? staffToken ?? null;

  const state = useInterviewState(interviewId, {
    pollMs: (data) =>
      data && isInterviewClosed(data.status) ? false : token ? INTERVIEW_LIVE_POLL_MS : INTERVIEW_STATE_POLL_MS,
    ...(applicantToken ? { applicantToken } : {}),
  });
  const snapshot = state.data;

  const socket = useInterviewSocket(interviewId, token?.token);
  const preview = useLocalPreview(false);
  const [showPanel, setShowPanel] = useState(true);
  const [showTiles, setShowTiles] = useState(true);
  const [panel, setPanel] = useState<PanelValue>(isStaff ? 'notes' : 'people');

  // Staff auto-join once, on mount. Guarded by a ref rather than the mutation's own
  // state: a re-render while the request is in flight would otherwise fire a second one.
  const autoJoined = useRef(false);
  const windowState = snapshot
    ? interviewJoinWindow(snapshot.startsAt, snapshot.endsAt)
    : 'early';
  useEffect(() => {
    if (!isStaff || autoJoined.current || token) return;
    if (!snapshot || windowState !== 'open' || isInterviewClosed(snapshot.status)) return;
    autoJoined.current = true;
    staffJoin
      .mutateAsync()
      .then(setStaffToken)
      .catch((error: Error) => toast.error(error.message));
    // `staffJoin` and `toast` are stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, token, snapshot, windowState]);

  // Report mic/camera state so the other side's tile shows it.
  const micOn = Boolean(preview.stream) && preview.micOn;
  const camOn = Boolean(preview.stream) && preview.camOn;
  const { live: socketLive, emit: socketEmit } = socket;
  useEffect(() => {
    if (!socketLive) return;
    socketEmit('interview:media-state', { micOn, camOn }).catch(() => {
      // Presence detail only; a dropped report must never surface as an error.
    });
    // Destructured rather than depending on `socket`, which is a fresh object every
    // render and would re-emit on each one.
  }, [socketLive, socketEmit, micOn, camOn]);

  const onDropped = useCallback(() => {
    // The provider token is short-lived; a reconnect after it expired needs a new one.
    if (!isStaff) return;
    staffJoin
      .mutateAsync()
      .then(setStaffToken)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);
  const video = useLiveKit(token ?? undefined, preview.stream, onDropped);

  const selfIdentity = token?.sub ?? null;
  const roster = useMemo(() => snapshot?.participants ?? [], [snapshot]);
  const selfEntry = roster.find((p) => p.identity === selfIdentity);
  const selfName = token?.displayName ?? selfEntry?.displayName ?? 'You';

  if (state.isLoading && !snapshot) return <LoadingState label="Opening the interview…" className="min-h-[60vh]" />;
  if (state.isError || !snapshot) {
    return (
      <ErrorState
        error={state.error}
        onRetry={() => state.refetch()}
        title="Could not open the interview"
      />
    );
  }

  const zone = snapshot.timeZone || 'UTC';
  const phase = classPhase(
    snapshot.status === 'LIVE' ? 'LIVE' : isInterviewClosed(snapshot.status) ? 'COMPLETED' : 'SCHEDULED',
    snapshot.startsAt,
    snapshot.endsAt,
    Date.now(),
  );
  const connection: RoomConnection = !token
    ? 'joining'
    : socket.status === 'connected'
      ? video.available && video.status === 'connected'
        ? 'connected'
        : 'limited'
      : socket.status === 'error' || socket.status === 'unavailable'
        ? 'offline'
        : 'joining';

  const doLeave = () => {
    preview.stop();
    if (onLeave) onLeave();
    else window.location.assign('/admin/teachers');
  };

  const tiles = roster.map((p) =>
    token && p.identity === selfIdentity ? (
      <SelfVideoTile
        key={p.identity}
        token={token}
        name={selfName}
        preview={preview}
        lowBandwidth={false}
        roleLabel={interviewRoleLabel(p.role)}
      />
    ) : (
      <ParticipantTile
        key={p.identity}
        name={p.displayName}
        role={p.role}
        roleLabel={interviewRoleLabel(p.role)}
        video={
          video.remote.get(p.identity)?.video ? (
            <RemoteVideo track={video.remote.get(p.identity)!.video!} name={p.displayName} />
          ) : undefined
        }
        overlay={<QualityBars quality={video.quality.get(p.identity)} />}
        mic={<MediaIcons micOn={p.micOn} camOn={p.camOn} name={p.displayName} />}
      />
    ),
  );
  // Joined but not in the snapshot yet (presence arrives over the socket): show yourself.
  if (token && !selfEntry) {
    tiles.unshift(
      <SelfVideoTile
        key="self"
        token={token}
        name={selfName}
        preview={preview}
        lowBandwidth={false}
        roleLabel={interviewRoleLabel(token.role)}
      />,
    );
  }

  const tabs: PanelTab<PanelValue>[] = [
    { value: 'people', label: 'People', icon: <Users className="h-3.5 w-3.5" />, count: roster.length },
    ...(isStaff
      ? ([
          { value: 'notes', label: 'Notes', icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
          { value: 'verdict', label: 'Verdict', icon: <UserX className="h-3.5 w-3.5" /> },
        ] as PanelTab<PanelValue>[])
      : []),
  ];

  return (
    <div
      className="overflow-clip rounded-3xl bg-green-950 text-white shadow-xl ring-1 ring-green-900"
      data-testid="interview-meeting"
    >
      {[...video.remote.entries()].map(([id, media]) =>
        media.audio ? <RemoteAudio key={id} track={media.audio} /> : null,
      )}

      <MeetingTopBar
        title={isStaff ? `Interview — ${snapshot.applicantName}` : `Interview with ${snapshot.interviewerName}`}
        subtitle={`${formatDateTime(snapshot.startsAt, zone)} · ${zone.replace(/_/g, ' ')}${
          snapshot.stage ? ` · ${snapshot.stage.replace(/_/g, ' ').toLowerCase()} step` : ''
        }`}
        status={
          <StatusPill
            phase={phase}
            status={interviewStatusLabel(snapshot.status)}
            startsAt={snapshot.startsAt}
            endsAt={snapshot.endsAt}
            serverTime={snapshot.serverTime}
            timeZone={zone}
          />
        }
        // Interviews are never recorded, so the REC pill can never light up here.
        recording={false}
        participantCount={roster.length}
        sync={
          token || windowState === 'open' ? (
            <ConnectionStatus
              state={connection}
              detail={`Live updates: ${socket.status} · Video: ${video.available ? video.status : 'not available'}`}
            />
          ) : null
        }
      />

      <div
        className={
          showPanel
            ? 'grid items-start lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]'
            : 'grid items-start'
        }
      >
        <section aria-label="Interview stage" className="min-w-0 space-y-3 p-3 sm:space-y-4 sm:p-4">
          <RoomBanner
            snapshot={snapshot}
            windowState={windowState}
            joined={Boolean(token)}
            viewer={viewer}
            zone={zone}
          />

          {!showTiles ? null : tiles.length > 0 ? (
            <Filmstrip label="People in the interview">{tiles}</Filmstrip>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/65">
              Nobody is on camera yet.
            </p>
          )}

          <div className="sticky bottom-3 z-10">
            <ControlBar
              start={
                video.audioBlocked ? (
                  <AudioUnlock onUnlock={() => void video.startAudio()} />
                ) : !token && windowState !== 'open' ? (
                  <p className="text-xs text-white/75" role="status">
                    {windowState === 'early'
                      ? `The room opens ${INTERVIEW_EARLY_OPEN_MINUTES} minutes before the interview starts.`
                      : 'This interview has finished.'}
                  </p>
                ) : null
              }
              center={
                token ? (
                  <MediaControls
                    token={token}
                    preview={preview}
                    lowBandwidth={false}
                    onLeave={doLeave}
                    leaveLabel="Leave interview"
                  />
                ) : isStaff && staffJoin.isError ? (
                  <ControlButton
                    tone="gold"
                    onClick={() => {
                      autoJoined.current = false;
                      staffJoin.reset();
                    }}
                    icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                  >
                    Try again
                  </ControlButton>
                ) : windowState === 'open' && !isInterviewClosed(snapshot.status) ? (
                  <span className="text-xs text-white/75" role="status">
                    Joining the interview…
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
                </div>
              }
            />
          </div>
        </section>

        <aside
          hidden={!showPanel}
          aria-label="Interview panel"
          className="min-w-0 space-y-4 border-t border-white/10 bg-green-900/70 p-3 sm:p-4 lg:min-h-full lg:border-l lg:border-t-0"
        >
          <PanelTabs tabs={tabs} value={panel} onChange={setPanel} idPrefix={panelId} />

          <TabPanel idPrefix={panelId} value="people" active={panel === 'people'}>
            <PanelSection title="In the room">
              {roster.length === 0 ? (
                <p className="text-xs text-white/65">Nobody is connected right now.</p>
              ) : (
                <ul className="space-y-1" aria-label="Participants">
                  {roster.map((p) => (
                    <li
                      key={p.identity}
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
                        {p.identity === selfIdentity && <span className="text-white/60"> (you)</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-white/65">
                        {interviewRoleLabel(p.role)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelSection>
            {isStaff && (
              <PanelSection title="Attendance">
                <LightSheet>
                  <InterviewAttendancePanel interviewId={interviewId} />
                </LightSheet>
              </PanelSection>
            )}
          </TabPanel>

          {isStaff && (
            <>
              <TabPanel idPrefix={panelId} value="notes" active={panel === 'notes'}>
                <PanelSection
                  title="Your notes"
                  description="Saved as you type. The applicant never sees these."
                >
                  <LightSheet>
                    <InterviewNotes interviewId={interviewId} initial={snapshot.notes ?? ''} />
                  </LightSheet>
                </PanelSection>
              </TabPanel>

              <TabPanel idPrefix={panelId} value="verdict" active={panel === 'verdict'}>
                <PanelSection
                  title="Record the verdict"
                  description="Scores and a decision. Moving the hiring step stays a separate action on the application."
                >
                  <LightSheet>
                    <InterviewOutcomeForm interviewId={interviewId} onDone={doLeave} />
                  </LightSheet>
                </PanelSection>
              </TabPanel>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Why the room is not joinable yet, in the words that match what the API will say. */
function RoomBanner({
  snapshot,
  windowState,
  joined,
  viewer,
  zone,
}: {
  snapshot: InterviewSnapshot;
  windowState: 'early' | 'open' | 'closed';
  joined: boolean;
  viewer: InterviewViewer;
  zone: string;
}) {
  const serverNow = useServerClock(snapshot.serverTime);

  if (isInterviewClosed(snapshot.status)) {
    return (
      <Banner tone="muted">
        This interview is {interviewStatusLabel(snapshot.status).toLowerCase()}.
        {viewer === 'applicant' && ' Thank you for your time — the academy will be in touch.'}
      </Banner>
    );
  }
  if (windowState === 'early') {
    const opensIn = Math.max(
      0,
      Math.round(
        (new Date(snapshot.startsAt).getTime() - INTERVIEW_EARLY_OPEN_MINUTES * 60_000 - serverNow) / 60_000,
      ),
    );
    return (
      <Banner tone="gold">
        The room opens {INTERVIEW_EARLY_OPEN_MINUTES} minutes before the start —{' '}
        {opensIn > 0 ? `about ${opensIn} minute${opensIn === 1 ? '' : 's'} from now` : 'any moment now'}. Booked for{' '}
        {formatDateTime(snapshot.startsAt, zone)}.
      </Banner>
    );
  }
  if (windowState === 'closed') {
    return <Banner tone="muted">The booked time has passed and the room has closed.</Banner>;
  }
  if (!joined) return null;
  return null;
}

function Banner({ tone, children }: { tone: 'gold' | 'muted'; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={
        tone === 'gold'
          ? 'rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5 text-xs text-gold-100'
          : 'rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs text-white/80'
      }
    >
      {children}
    </p>
  );
}

/**
 * The interviewer's notes, autosaved.
 *
 * Debounced rather than saved on every keystroke, and the textarea stays the source of
 * truth while it has focus: writing the server's echo back into it mid-sentence would
 * move the caret, which is the fastest way to make someone stop taking notes.
 */
function InterviewNotes({ interviewId, initial }: { interviewId: string; initial: string }) {
  const save = useSaveInterviewNotes(interviewId);
  const [value, setValue] = useState(initial);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      save
        .mutateAsync(value)
        .then(() => setSavedAt(new Date().toISOString()))
        .catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
    // `save` is stable; re-running on it would reset the debounce on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor={`interview-notes-${interviewId}`}>
        Interview notes
      </label>
      <textarea
        id={`interview-notes-${interviewId}`}
        value={value}
        onChange={(event) => {
          dirty.current = true;
          setValue(event.target.value);
        }}
        rows={12}
        maxLength={10_000}
        placeholder="How was the recitation? Tajweed? How would they correct a child?"
        className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950 placeholder:text-green-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
      />
      <p className="text-[11px] text-green-800" role="status">
        {save.isPending
          ? 'Saving…'
          : save.isError
            ? `Not saved: ${(save.error as Error).message}`
            : savedAt
              ? `Saved at ${new Date(savedAt).toLocaleTimeString()}`
              : 'Saved automatically as you type.'}
      </p>
    </div>
  );
}

function InterviewAttendancePanel({ interviewId }: { interviewId: string }) {
  const attendance = useInterviewAttendance(interviewId);

  if (attendance.isLoading) return <LoadingState label="Loading attendance…" className="py-6" />;
  if (attendance.isError) {
    return (
      <ErrorState
        error={attendance.error}
        onRetry={() => attendance.refetch()}
        title="Could not load attendance"
      />
    );
  }
  const data = attendance.data;
  if (!data || data.participants.length === 0) {
    return <EmptyState title="Nobody has joined yet" description="Attendance appears once someone connects." />;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {data.participants.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm text-green-950">
            <span className="min-w-0 truncate">
              {p.displayName}{' '}
              <span className="text-green-800">· {interviewRoleLabel(p.role)}</span>
            </span>
            <span className="shrink-0 text-xs text-green-800">
              {p.minutesPresent} min{p.leftAt ? '' : ' · still here'}
            </span>
          </li>
        ))}
      </ul>
      {!data.summary.applicantAttended && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          The applicant has not joined yet.
        </p>
      )}
    </div>
  );
}

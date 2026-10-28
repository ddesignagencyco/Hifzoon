'use client';

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Languages, Users } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadingState,
  ErrorState,
  PageHeader,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api/http';
import {
  teacherKeys,
  useOwnTeacherProfile,
  useRequestProfileChange,
  useTeacherIdentity,
  useTeacherPublicProfile,
  useTeacherRating,
} from '@/hooks/useTeacher';
import { useCourses } from '@/hooks/useCourses';
import { PublicTeacherProfile, TeacherRatingSummary } from '@/lib/api/modules/teacher';
import type { OwnTeacherProfile } from '@/lib/api/modules/teacher-me';
import { ProfileForm, ProfileFormValues, languageLabel } from './ProfileForm';

/** `/teacher/profile` — propose profile edits, see the public card and the family rating. */
export function ProfileScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const identity = useTeacherIdentity();
  // `GET /teachers/me` (M1) is the teacher's own row, current values and staged changes
  // included, at any hiring stage; the public profile is the fallback for prefill.
  const me = useOwnTeacherProfile(Boolean(identity.userId));
  const publicProfile = useTeacherPublicProfile(identity.userId);
  const rating = useTeacherRating(identity.teacherId);
  const request = useRequestProfileChange();
  const { courses, isLoading: coursesLoading } = useCourses();

  // `GET /teachers/public/:userId` now filters by user id (backend B3), so this is our own profile.
  const own = publicProfile.data ?? null;
  const mine = me.data ?? null;
  const notPublic = publicProfile.error instanceof ApiClientError && publicProfile.error.status === 404;
  const pending = mine?.pendingProfileChanges && Object.keys(mine.pendingProfileChanges).length > 0 ? mine.pendingProfileChanges : null;

  const source = mine ?? own;
  const initial: ProfileFormValues = {
    bio: source?.bio ?? '',
    photoUrl: source?.photoUrl ?? '',
    introVideoUrl: source?.introVideoUrl ?? '',
    recitationSampleUrl: source?.recitationSampleUrl ?? '',
    languages: source?.languages ?? [],
    subjects: source?.subjects ?? [],
    ageGroups: source?.ageGroups ?? [],
    qualifications: mine?.qualifications ?? [],
  };
  const formReady = !identity.userId || (!me.isLoading && !publicProfile.isLoading);
  const subjectOptions = courses.map((c) => ({ value: c.code, label: c.title, description: c.code }));

  return (
    <>
      <PageHeader
        title="Profile"
        description="How families see you. Changes are reviewed by the academy before they go live."
      />
      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Propose changes" description="Bio, media links, languages, subjects and age groups." />
            <CardBody>
              {pending && <PendingChanges pending={pending} />}
              {formReady ? (
                <ProfileForm
                  key={source?.id ?? 'blank'}
                  initial={initial}
                  subjectOptions={subjectOptions}
                  subjectsLoading={coursesLoading}
                  submitting={request.isPending}
                  onSubmit={(changes) =>
                    request.mutate(changes, {
                      onSuccess: (result) => {
                        // The PATCH answers with the full staged set; show it now, then re-read `/teachers/me`.
                        queryClient.setQueryData<OwnTeacherProfile>(teacherKeys.me, (prev) =>
                          prev ? { ...prev, pendingProfileChanges: result.pendingProfileChanges } : prev,
                        );
                        void queryClient.invalidateQueries({ queryKey: teacherKeys.me });
                        toast.success('Profile changes sent for approval.');
                      },
                      onError: (err) => toast.error(err),
                    })
                  }
                />
              ) : (
                <LoadingState />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Public card preview" description="What families see on the Teachers page." />
            <CardBody>
              {publicProfile.isLoading || !identity.userId ? (
                <LoadingState />
              ) : notPublic ? (
                <EmptyState title="Not public yet" description="Your profile is listed once you are fully cleared to teach." className="py-6" />
              ) : publicProfile.isError ? (
                <ErrorState error={publicProfile.error} onRetry={() => publicProfile.refetch()} />
              ) : own ? (
                <PublicCard profile={own} />
              ) : (
                <Alert tone="warning" title="Preview unavailable">
                  The public profile service returned a different teacher&apos;s profile, so it is not shown here.
                </Alert>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Family ratings" />
            <CardBody>
              {!identity.teacherId ? (
                identity.query.isLoading ? <LoadingState /> : <p className="text-sm text-muted">Ratings appear once you have students.</p>
              ) : rating.isLoading ? (
                <LoadingState />
              ) : rating.isError ? (
                <ErrorState error={rating.error} onRetry={() => rating.refetch()} />
              ) : rating.data ? (
                <RatingSummary rating={rating.data} />
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Staged edits as `GET /teachers/me` reports them (`pendingProfileChanges`). */
function PendingChanges({ pending }: { pending: Record<string, unknown> }) {
  return (
    <Alert tone="neutral" title="Submitted for approval" className="mb-4">
      <p>
        Awaiting review: {Object.keys(pending).map(humanize).join(', ')}. Your public profile changes once an admin approves
        them.
      </p>
    </Alert>
  );
}

function PublicCard({ profile }: { profile: PublicTeacherProfile }) {
  return (
    <article className="rounded-2xl border border-line overflow-hidden" aria-label={`Public profile of ${profile.user.name}`}>
      <div className="bg-green-950 px-4 py-5 flex items-center gap-3">
        {profile.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary teacher-supplied host
          <img src={profile.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-gold" />
        ) : (
          <span className="w-14 h-14 rounded-full bg-green-800 text-gold text-xl font-semibold flex items-center justify-center border-2 border-gold" aria-hidden>
            {profile.user.name.charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-fraunces text-lg text-white truncate">{profile.user.name}</p>
          {/* The live family rating is in the "Family ratings" card; `publicRatingAvg` is seed-only. */}
        </div>
      </div>
      <div className="p-4 space-y-3 text-sm">
        {profile.bio ? <p className="text-ink-2 whitespace-pre-line">{profile.bio}</p> : <p className="text-muted">No bio yet.</p>}
        {profile.subjects.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.subjects.map((s) => (
              <Badge key={s} tone="gold">{humanize(s)}</Badge>
            ))}
          </div>
        )}
        {profile.languages.length > 0 && (
          <p className="text-xs text-muted flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5" aria-hidden /> {profile.languages.map(languageLabel).join(', ')}
          </p>
        )}
        {profile.ageGroups.length > 0 && (
          <p className="text-xs text-muted flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" aria-hidden /> Ages {profile.ageGroups.join(', ')}
          </p>
        )}
        {profile.qualifications.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.qualifications.map((c, i) => (
              <Badge key={i} tone="green">✓ {c.title}</Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function RatingSummary({ rating }: { rating: TeacherRatingSummary }) {
  if (rating.count === 0) {
    return <p className="text-sm text-muted">No family ratings yet.</p>;
  }
  const max = Math.max(1, ...rating.distribution.map((d) => d.count));
  return (
    <div className="space-y-3">
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-ink tabular-nums">{rating.average?.toFixed(1) ?? '—'}</span>
        <span className="text-xs text-muted">from {rating.count} rating{rating.count === 1 ? '' : 's'}</span>
      </p>
      <ul className="space-y-1.5">
        {rating.distribution.map((d) => (
          <li key={d.stars} className="flex items-center gap-2 text-xs">
            <span className="w-8 text-muted tabular-nums">{d.stars}★</span>
            <span className="flex-1 h-2 rounded-full bg-sand overflow-hidden" aria-hidden>
              <span className="block h-full bg-gold rounded-full" style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="w-6 text-right text-ink-2 tabular-nums">
              <span className="sr-only">{d.stars} stars: </span>
              {d.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

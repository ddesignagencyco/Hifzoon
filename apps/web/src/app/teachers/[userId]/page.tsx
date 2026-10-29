'use client';

import React, { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Clock, Globe, ShieldCheck, Star, Users } from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/landing/Button';
import { RatingDistribution } from '@/components/qa/QaWidgets';
import { usePublicTeacher, usePublicTeacherRating } from '@/hooks/useTeachers';
import { ApiClientError } from '@/lib/api/http';
import { isHttpUrl, type PublicTeacherProfile } from '@/lib/api/modules/teacher';
import { humanize } from '@/components/ui/primitives';
import { TeacherTierBadge } from '@/components/shared/TeacherTierBadge';

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Direct video files play inline; anything else (YouTube, Vimeo, Drive…) opens in a new tab. */
function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url);
}

function TeacherFromUrl() {
  const { userId } = useParams<{ userId: string }>();
  const id = decodeURIComponent(userId);
  const profile = usePublicTeacher(id);

  if (profile.isLoading) return <PageLoading />;
  if (profile.isError || !profile.data) {
    const missing = profile.error instanceof ApiClientError && profile.error.status === 404;
    return (
      <div className="site-container py-24 text-center space-y-4">
        <h1 className="font-fraunces text-3xl text-[#10201b]">
          {missing ? 'This teacher is not taking new students' : 'This profile could not be loaded'}
        </h1>
        <p className="text-sm text-[#6b7772]">
          {missing
            ? 'Their profile may be paused or no longer public. Browse our other teachers instead.'
            : 'Please check your connection and try again.'}
        </p>
        <Button href="/teachers" variant="outline" size="sm">
          See all teachers
        </Button>
      </div>
    );
  }
  return <TeacherDetail profile={profile.data} />;
}

function TeacherDetail({ profile }: { profile: PublicTeacherProfile }) {
  const rating = usePublicTeacherRating(profile.id);
  const name = profile.user.name;
  const summary = rating.data;
  // The API accepts any absolute URL for media; only http(s) links are played or opened.
  const introVideoUrl = isHttpUrl(profile.introVideoUrl) ? profile.introVideoUrl : null;
  const recitationSampleUrl = isHttpUrl(profile.recitationSampleUrl) ? profile.recitationSampleUrl : null;

  return (
    <>
      <section className="bg-[#0f2c24] text-white py-12 md:py-16 border-b border-white/10">
        <div className="site-container">
          <Link href="/teachers" className="inline-flex items-center gap-1.5 text-xs text-[#c4d3cd] hover:text-white mb-6">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> All teachers
          </Link>
          <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-[#c49a55] bg-[#143a2f] shrink-0">
              {profile.photoUrl ? (
                <Image
                  src={profile.photoUrl}
                  alt={name}
                  fill
                  sizes="112px"
                  unoptimized={/^https?:/i.test(profile.photoUrl)}
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-fraunces text-4xl text-[#c49a55]" aria-hidden>
                  {name.charAt(0)}
                </span>
              )}
            </div>
            <div className="space-y-2 min-w-0">
              {profile.subjects.length > 0 && (
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#c49a55]">
                  {profile.subjects.map(humanize).join(' · ')}
                </p>
              )}
              <h1 className="font-fraunces text-3xl sm:text-4xl font-normal">{name}</h1>
              {profile.tier && <TeacherTierBadge tier={profile.tier} size="sm" showDescription={false} />}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#c4d3cd]">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> Hiring &amp; safeguarding cleared
                </span>
                {summary && summary.count > 0 && summary.average !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-[#c49a55] fill-current" aria-hidden />
                    <span className="font-semibold text-white">{summary.average.toFixed(1)}</span>· {summary.count} family rating
                    {summary.count === 1 ? '' : 's'}
                  </span>
                )}
                {profile.gender && <span>{profile.gender === 'FEMALE' ? 'Ustadha' : 'Ustadh'}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-container py-10 grid lg:grid-cols-[1fr_340px] gap-8 items-start">
        <div className="space-y-8">
          {introVideoUrl && (
            <div className="space-y-3">
              <h2 className="font-fraunces text-xl text-[#10201b]">Introduction</h2>
              {isVideoFile(introVideoUrl) ? (
                <video controls preload="metadata" src={introVideoUrl} className="w-full rounded-2xl bg-black aspect-video" />
              ) : (
                <a
                  href={introVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-sm font-semibold text-[#1c4c3e] underline underline-offset-4"
                >
                  Watch {name}&apos;s introduction video
                </a>
              )}
            </div>
          )}
          {recitationSampleUrl && (
            <div className="space-y-3">
              <h2 className="font-fraunces text-xl text-[#10201b]">Listen to a recitation</h2>
              <audio
                controls
                preload="none"
                src={recitationSampleUrl}
                aria-label={`Recitation sample by ${name}`}
                className="w-full"
              >
                <a href={recitationSampleUrl} target="_blank" rel="noopener noreferrer">
                  Open {name}&apos;s recitation sample
                </a>
              </audio>
            </div>
          )}
          <div className="space-y-3">
            <h2 className="font-fraunces text-xl text-[#10201b]">About</h2>
            <p className="text-sm text-[#3c4a45] leading-relaxed whitespace-pre-line">
              {profile.bio || `${name} has not added a biography yet.`}
            </p>
          </div>
          {(profile.qualifications ?? []).length > 0 && (
            <div className="space-y-3">
              <h2 className="font-fraunces text-xl text-[#10201b]">Certificates &amp; associations</h2>
              <ul className="grid sm:grid-cols-2 gap-3">
                {profile.qualifications.map((c, i) => (
                  <li key={`${c.title}-${i}`} className="bg-white rounded-2xl border border-[#e6dfd1] p-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a97f3c]">
                      <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Verified {humanize(c.type).toLowerCase()}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#10201b]">{c.title}</p>
                    <p className="text-xs text-[#6b7772]">{c.issuer}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-3">
            <h2 className="font-fraunces text-xl text-[#10201b]">Family ratings</h2>
            <div className="bg-white rounded-2xl border border-[#e6dfd1] p-5">
              {rating.isLoading ? (
                <p className="text-sm text-[#6b7772]">Loading ratings…</p>
              ) : summary ? (
                <RatingDistribution summary={summary} />
              ) : (
                <p className="text-sm text-[#6b7772]">Ratings are unavailable right now.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 space-y-4 text-sm text-[#3c4a45]">
          {profile.languages.length > 0 && (
            <p className="flex items-start gap-2">
              <Globe className="w-4 h-4 text-[#1c4c3e] shrink-0 mt-0.5" aria-hidden />
              <span>Teaches in {profile.languages.map(languageName).join(', ')}</span>
            </p>
          )}
          {profile.ageGroups.length > 0 && (
            <p className="flex items-start gap-2">
              <Users className="w-4 h-4 text-[#1c4c3e] shrink-0 mt-0.5" aria-hidden />
              <span>Ages {profile.ageGroups.join(', ')}</span>
            </p>
          )}
          {profile.user.timeZone && (
            <p className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-[#1c4c3e] shrink-0 mt-0.5" aria-hidden />
              <span>Based in the {profile.user.timeZone.replace(/_/g, ' ')} time zone; class times are shown in yours.</span>
            </p>
          )}
          <Button href={`/book-trial?teacher=${encodeURIComponent(profile.id)}`} className="w-full">
            Request a trial class
          </Button>
        </aside>
      </section>
    </>
  );
}

function PageLoading() {
  return <BrandLoader variant="page" label="Loading…" />;
}

/** `/teachers/[userId]` — a teacher's public profile (FR-TCH, `GET /teachers/public/:userId`). */
export default function TeacherProfilePage() {
  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between">
      <Header />
      <main className="flex-1">
        {/* The id comes from the URL, so the profile streams in after the static shell. */}
        <Suspense fallback={<PageLoading />}>
          <TeacherFromUrl />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

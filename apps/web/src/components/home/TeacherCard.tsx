'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Globe, Pause, Play, ShieldCheck, Star, Users } from 'lucide-react';
import { Button } from '@/components/landing/Button';
import { TeacherProfile } from '@/lib/types';
import { usePublicTeacherRating } from '@/hooks/useTeachers';

function initials(name: string): string {
  const parts = name.replace(/^(Ustadh|Ustadha|Sheikh|Shaykh)\s+/i, '').trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() || 'H';
}

/**
 * Public teacher card for an approved teacher from `GET /teachers/public`. Renders only
 * what the profile carries (no invented experience, reviews or qualifications).
 */
export function TeacherCard({ teacher }: { teacher: TeacherProfile }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggleAudio = () => {
    if (!teacher.audioSampleUrl) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (!audioRef.current) {
      const created = new Audio(teacher.audioSampleUrl);
      created.addEventListener('ended', () => setPlaying(false));
      audioRef.current = created;
    }
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const subtitle = teacher.title ?? (teacher.specializations.length > 0 ? teacher.specializations.join(' · ') : undefined);
  // The computed family rating with its count, hidden until someone has rated.
  const live = usePublicTeacherRating(teacher.id);
  const rating =
    live.data && live.data.count > 0 && live.data.average !== null
      ? { average: live.data.average, count: live.data.count }
      : null;
  const profileHref = teacher.userId ? `/teachers/${encodeURIComponent(teacher.userId)}` : null;

  return (
    <article className="bg-white rounded-[28px] overflow-hidden border border-[#e6dfd1] shadow-card flex flex-col justify-between group hover:border-[#c49a55]/50 transition-all duration-300">
      <div>
        <div className="relative h-[220px] w-full bg-[#f0f6f3] overflow-hidden">
          {teacher.photoUrl ? (
            <Image
              src={teacher.photoUrl}
              alt={teacher.name}
              unoptimized={/^https?:/i.test(teacher.photoUrl)}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#143a2f]" aria-hidden>
              <span className="font-fraunces text-5xl text-[#c49a55]">{initials(teacher.name)}</span>
            </div>
          )}
          <div className="absolute top-3 left-3 bg-white/95 rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1c4c3e]" aria-hidden />
            <span className="text-[10.5px] font-semibold text-[#143a2f]">Hiring &amp; safeguarding cleared</span>
          </div>
          {teacher.audioSampleUrl && (
            <button
              type="button"
              onClick={toggleAudio}
              aria-label={`${playing ? 'Pause' : 'Play'} recitation by ${teacher.name}`}
              aria-pressed={playing}
              className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-[#c49a55] text-[#0a1f19] flex items-center justify-center shadow-md hover:bg-[#b58c49] transition-all cursor-pointer"
            >
              {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
          )}
        </div>

        <div className="p-5">
          {subtitle && (
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#a97f3c] mb-1 line-clamp-1">{subtitle}</p>
          )}
          <h3 className="font-fraunces text-[20px] font-medium text-[#10201b] leading-tight mb-2">
            {profileHref ? (
              <Link href={profileHref} className="hover:text-[#1c4c3e] hover:underline underline-offset-4">
                {teacher.name}
              </Link>
            ) : (
              teacher.name
            )}
          </h3>
          {rating && (
            <p className="flex items-center gap-1 text-xs text-[#3c4a45] mb-2">
              <Star className="w-3.5 h-3.5 text-[#c49a55] fill-current" aria-hidden />
              <span className="font-semibold">{rating.average.toFixed(1)}</span>
              <span className="text-[#6b7772]">
                · {rating.count} family rating{rating.count === 1 ? '' : 's'}
              </span>
            </p>
          )}
          {teacher.bio && <p className="text-xs text-[#6b7772] line-clamp-3 leading-relaxed mb-4">{teacher.bio}</p>}

          <div className="space-y-2 pt-3 border-t border-[#f3eee4] text-xs text-[#6b7772]">
            {teacher.qualifications?.[0] && <p className="line-clamp-1">{teacher.qualifications[0]}</p>}
            {teacher.languages.length > 0 && (
              <p className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#1c4c3e] shrink-0" aria-hidden />
                <span>{teacher.languages.join(', ')}</span>
              </p>
            )}
            {teacher.ageGroups && teacher.ageGroups.length > 0 && (
              <p className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#1c4c3e] shrink-0" aria-hidden />
                <span>Ages {teacher.ageGroups.join(', ')}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 pt-0 space-y-2">
        {profileHref && (
          <Link
            href={profileHref}
            className="block text-center text-xs font-semibold text-[#1c4c3e] hover:underline underline-offset-4"
          >
            View full profile
          </Link>
        )}
        <Button
          variant="outline"
          size="sm"
          href={`/book-trial?teacher=${teacher.id}`}
          className="w-full text-xs"
        >
          Request a trial class
        </Button>
      </div>
    </article>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { trialBookingHref } from '@/lib/api/modules/public-booking';

/**
 * "Book a free trial yourself": the booking page with this child (and course, when known)
 * already chosen, so the family goes straight to the times. Styled as the primary button
 * because it is the quicker of the two ways to start a course; the other is asking the
 * academy to choose a teacher (`EnrolModal`).
 */
export function BookTrialLink({
  studentId,
  courseCode,
  size = 'md',
  children = 'Book a free trial yourself',
}: {
  studentId: string;
  courseCode?: string;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={trialBookingHref(studentId, courseCode)}
      className={
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors border ' +
        'bg-green-800 text-white hover:bg-green-700 border-green-800 ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ' +
        (size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-5 text-sm')
      }
    >
      <CalendarPlus className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden />
      {children}
    </Link>
  );
}

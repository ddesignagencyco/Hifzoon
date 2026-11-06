'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { detectTimeZone, parseBookingSelection } from '@/lib/api/modules/public-booking';
import { BookingFlow } from './BookingFlow';

/**
 * `/book-trial` reads its preselection (course, child, slot…) from the URL.
 *
 * With Cache Components on, Next keeps a page that was navigated away from mounted but
 * hidden (React `<Activity>`), so its state survives. Without care, a family that booked a
 * trial and then clicked "Book a free trial yourself" for another child came back to the
 * old "Trial class booked" screen. So a booking starts afresh when the preselection in the
 * URL changes (the flow is keyed by it), and after a completed booking once the page is
 * left (the effect cleanup below runs when the page is hidden as well as unmounted).
 */
export function BookingFromUrl() {
  const params = useSearchParams();
  const query = params.toString();
  const initial = useMemo(() => parseBookingSelection(new URLSearchParams(query)), [query]);
  const [detectedZone] = useState(() => detectTimeZone());
  const [round, setRound] = useState(0);
  const completed = useRef(false);

  useEffect(
    () => () => {
      if (!completed.current) return;
      completed.current = false;
      setRound((r) => r + 1);
    },
    [],
  );

  return (
    <BookingFlow
      key={`${query}#${round}`}
      initial={initial}
      detectedZone={detectedZone}
      onComplete={() => {
        completed.current = true;
      }}
    />
  );
}

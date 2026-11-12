// @vitest-environment jsdom
import React, { Activity, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookingSelection } from '@/lib/api/modules/public-booking';

// The address bar, as the page sees it.
let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));

/**
 * Stand-in for the real flow: it only keeps its own "step" state, which is what used to
 * leak from one visit to the next (a booked trial stayed on the success screen).
 */
vi.mock('@/components/booking/BookingFlow', () => ({
  BookingFlow: ({
    initial,
    onComplete,
  }: {
    initial: BookingSelection;
    onComplete?: () => void;
  }) => {
    const [done, setDone] = useState(false);
    return done ? (
      <p>Trial class booked</p>
    ) : (
      <div>
        <p>
          Booking {initial.course ?? 'any course'} for {initial.studentId ?? 'a learner'}
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(true);
            onComplete?.();
          }}
        >
          Confirm
        </button>
      </div>
    );
  },
}));

import { BookingFromUrl } from '@/components/booking/BookingFromUrl';

/** Next keeps a left page mounted but hidden (Cache Components), which `<Activity>` models. */
function Page({ visible }: { visible: boolean }) {
  return (
    <Activity mode={visible ? 'visible' : 'hidden'}>
      <BookingFromUrl />
    </Activity>
  );
}

describe('/book-trial starts a fresh booking', () => {
  beforeEach(() => {
    search = '';
  });

  it('when the family opens it again with another child preselected', async () => {
    search = 'course=HIFZ&studentId=stu-1';
    const { rerender } = render(<Page visible />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByText('Trial class booked')).toBeTruthy();

    // Off to the family portal, then "Book a free trial yourself" for the next child.
    rerender(<Page visible={false} />);
    search = 'course=IJAZAH&studentId=stu-2';
    rerender(<Page visible />);

    expect(screen.queryByText('Trial class booked')).toBeNull();
    expect(screen.getByText('Booking IJAZAH for stu-2')).toBeTruthy();
  });

  it('after a completed booking, even with the same link', async () => {
    search = 'course=HIFZ&studentId=stu-1';
    const { rerender } = render(<Page visible />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByText('Trial class booked')).toBeTruthy();

    await act(async () => rerender(<Page visible={false} />));
    await act(async () => rerender(<Page visible />));

    expect(screen.queryByText('Trial class booked')).toBeNull();
    expect(screen.getByText('Booking HIFZ for stu-1')).toBeTruthy();
  });

  it('but keeps a booking in progress when the page is only hidden', async () => {
    search = 'course=HIFZ&studentId=stu-1';
    const { rerender } = render(<Page visible />);
    await act(async () => rerender(<Page visible={false} />));
    await act(async () => rerender(<Page visible />));
    expect(screen.getByText('Booking HIFZ for stu-1')).toBeTruthy();
  });
});

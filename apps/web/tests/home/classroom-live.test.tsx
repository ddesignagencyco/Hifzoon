// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ClassroomLiveSection } from '@/components/home/ClassroomLiveSection';
import { AL_IKHLAS_AYAT, BISMILLAH } from '@/components/home/classroom-demo/verses';
import { MEANING, MISTAKE_SLOT, RECHECK_SLOT, TICK_MS, WORDS } from '@/components/home/classroom-demo/script';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** `wide` answers the demo's `(min-width: 640px)` query (laptop layout vs phone layout). */
function mockMedia(reduce: boolean, wide = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: (reduce && query.includes('prefers-reduced-motion')) || (wide && query.includes('min-width')),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

const markOf = (slot: number) => document.querySelector(`[data-word="${slot}"]`)?.getAttribute('data-mark');

afterEach(() => {
  vi.useRealTimers();
});

describe('ClassroomLiveSection', () => {
  it('renders the copy, CTA and a hidden, described, non-interactive device', () => {
    mockMedia(false);
    render(<ClassroomLiveSection />);
    expect(screen.getByRole('heading', { name: /virtual classroom built only for the quran/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /try it in a free trial/i }).getAttribute('href')).toBe('/book-trial');

    const device = screen.getByTestId('classroom-live-device');
    expect(device.getAttribute('aria-hidden')).toBe('true');
    // Passive demo: no buttons, links or focusable elements inside the device.
    expect(device.querySelectorAll('button, a, input, textarea, select, [tabindex], [role="button"]')).toHaveLength(0);

    const descId = device.closest('figure')?.getAttribute('aria-describedby');
    expect(descId && document.getElementById(descId)?.textContent).toMatch(/Illustration of a live Hifzoon class/);
    expect(screen.getByText('Surah Al-Ikhlas · Hafs ʿan ʿĀṣim')).toBeTruthy();
  });

  it('renders the verbatim verses word by word', () => {
    mockMedia(true);
    render(<ClassroomLiveSection />);
    expect(screen.getByText(BISMILLAH)).toBeTruthy();
    expect(WORDS).toHaveLength(15);
    expect(WORDS.map((w) => w.text).join(' ')).toBe(AL_IKHLAS_AYAT.join(' '));
    const rendered = Array.from(document.querySelectorAll('[data-word]')).map((el) => el.firstChild?.textContent);
    expect(rendered.join(' ')).toBe(AL_IKHLAS_AYAT.join(' '));
  });

  it('shows a static frame (logged mistake, word meaning) under reduced motion', () => {
    mockMedia(true);
    vi.useFakeTimers();
    render(<ClassroomLiveSection />);
    expect(screen.getByTestId('classroom-live-device').getAttribute('data-state')).toBe('static');
    expect(screen.getByText('Ayah 112:2')).toBeTruthy();
    expect(screen.getByText('Vowel / harakah')).toBeTruthy();
    expect(markOf(MISTAKE_SLOT)).toBe('mistake');
    expect(markOf(RECHECK_SLOT)).toBe('fixed');
    expect(screen.getByText(MEANING.en)).toBeTruthy();
    expect(screen.getByText(MEANING.ur)).toBeTruthy();
    expect(screen.getByText('18:42')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('18:42')).toBeTruthy();
  });

  it('uses the upright layout on phones and the laptop layout from sm', () => {
    mockMedia(true, false);
    const { unmount } = render(<ClassroomLiveSection />);
    expect(screen.getByTestId('classroom-live-device').getAttribute('data-layout')).toBe('compact');
    unmount();

    mockMedia(true, true);
    render(<ClassroomLiveSection />);
    expect(screen.getByTestId('classroom-live-device').getAttribute('data-layout')).toBe('wide');
    // The laptop panel also lists the mistake rechecked earlier in the class.
    expect(screen.getByText('Rechecked today')).toBeTruthy();
  });

  it('advances the session timer while playing', () => {
    mockMedia(false);
    vi.useFakeTimers();
    render(<ClassroomLiveSection />);
    expect(screen.getByTestId('classroom-live-device').getAttribute('data-state')).toBe('live');
    act(() => {
      vi.advanceTimersByTime(10);
    });
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('18:42')).toBeNull();
    expect(screen.getByText('18:48')).toBeTruthy();
  });

  it('plays the story: recheck and mark fixed, log a mistake, then the lesson card', () => {
    mockMedia(false);
    vi.useFakeTimers();
    render(<ClassroomLiveSection />);
    act(() => {
      vi.advanceTimersByTime(10);
    });
    // Recheck mistakes from the last class.
    expect(screen.getByText('Mark fixed')).toBeTruthy();
    expect(markOf(RECHECK_SLOT)).toBeNull();
    expect(screen.queryByText('Ayah 112:2')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(7 * TICK_MS);
    });
    expect(markOf(RECHECK_SLOT)).toBe('fixed');

    // The teacher taps a word to log today's mistake.
    act(() => {
      vi.advanceTimersByTime(10 * TICK_MS);
    });
    expect(markOf(MISTAKE_SLOT)).toBe('mistake');
    expect(screen.getByText('Ayah 112:2')).toBeTruthy();

    // The lesson card fills in with homework and a practice set for home.
    act(() => {
      vi.advanceTimersByTime(20 * TICK_MS);
    });
    expect(screen.getByText('Homework')).toBeTruthy();
    expect(screen.getByText('Recite 112:1–4 five times')).toBeTruthy();
    expect(screen.getByText('Practice set')).toBeTruthy();
  });
});

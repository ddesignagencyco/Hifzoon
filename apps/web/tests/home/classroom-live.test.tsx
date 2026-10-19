// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ClassroomLiveSection } from '@/components/home/ClassroomLiveSection';
import { AL_IKHLAS_AYAT, BISMILLAH } from '@/components/home/classroom-demo/verses';
import { WORDS } from '@/components/home/classroom-demo/script';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
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

afterEach(() => {
  vi.useRealTimers();
});

describe('ClassroomLiveSection', () => {
  it('renders the copy, CTA and a hidden, described, non-interactive device', () => {
    mockReducedMotion(false);
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
    mockReducedMotion(true);
    render(<ClassroomLiveSection />);
    expect(screen.getByText(BISMILLAH)).toBeTruthy();
    expect(WORDS).toHaveLength(15);
    expect(WORDS.map((w) => w.text).join(' ')).toBe(AL_IKHLAS_AYAT.join(' '));
    const rendered = Array.from(document.querySelectorAll('[data-word]')).map((el) => el.firstChild?.textContent);
    expect(rendered.join(' ')).toBe(AL_IKHLAS_AYAT.join(' '));
  });

  it('shows a static frame (tagged mistake, logged correction) under reduced motion', () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    render(<ClassroomLiveSection />);
    expect(screen.getByTestId('classroom-live-device').getAttribute('data-state')).toBe('static');
    expect(screen.getByText('Mistake tagged')).toBeTruthy();
    expect(screen.getByText('Harakah · v.2')).toBeTruthy();
    expect(screen.getByText(/Logged corrections/).textContent).toContain('1');
    expect(screen.getByText(/Live · 18:42/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/Live · 18:42/)).toBeTruthy();
  });

  it('advances the session timer while playing', () => {
    mockReducedMotion(false);
    vi.useFakeTimers();
    render(<ClassroomLiveSection />);
    expect(screen.getByTestId('classroom-live-device').getAttribute('data-state')).toBe('live');
    act(() => {
      vi.advanceTimersByTime(10);
    });
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText(/Live · 18:42/)).toBeNull();
    expect(screen.getByText(/Live · 18:48/)).toBeTruthy();
  });
});

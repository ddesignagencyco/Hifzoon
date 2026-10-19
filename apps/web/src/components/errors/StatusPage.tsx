import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export type StatusKind = 'not-found' | 'unauthorized' | 'forbidden' | 'error' | 'offline';

const COPY: Record<StatusKind, { code: string; title: string; body: string }> = {
  'not-found': {
    code: '404',
    title: 'We couldn’t find that page',
    body: 'The link may be broken, or the page may have been moved or unpublished.',
  },
  unauthorized: {
    code: '401',
    title: 'Please sign in to continue',
    body: 'This part of Hifzoon is only available to signed-in families, students and staff.',
  },
  forbidden: {
    code: '403',
    title: 'You don’t have access to this page',
    body: 'Your account doesn’t have the role needed for this area. If you think this is a mistake, contact the academy office.',
  },
  error: {
    code: '500',
    title: 'Something went wrong',
    body: 'An unexpected error stopped this page from loading. Please try again — if it keeps happening, let us know.',
  },
  offline: {
    code: '503',
    title: 'We can’t reach Hifzoon right now',
    body: 'Check your internet connection. If you are online, our servers may be briefly unavailable.',
  },
};

export interface StatusAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

/**
 * Full-page status screen shared by 404, 401, 403 and error boundaries.
 * Server-safe (no hooks), so it can be used from `not-found.tsx` and client boundaries alike.
 */
export function StatusPage({
  kind,
  title,
  body,
  actions,
  detail,
  fullScreen = true,
}: {
  kind: StatusKind;
  title?: string;
  body?: React.ReactNode;
  actions?: StatusAction[];
  /** Small print under the actions, e.g. an error digest for support. */
  detail?: React.ReactNode;
  fullScreen?: boolean;
}) {
  const copy = COPY[kind];
  const buttons = actions ?? [{ label: 'Go to homepage', href: '/', variant: 'primary' as const }];

  return (
    <div
      className={`relative overflow-hidden bg-cream flex items-center justify-center px-4 py-16 ${fullScreen ? 'min-h-screen' : 'min-h-[60vh]'}`}
    >
      <div className="absolute inset-0 bg-star-pattern-gold opacity-[0.07] pointer-events-none" aria-hidden />
      <div className="relative w-full max-w-lg text-center">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-10" aria-label="Hifzoon home">
          <span className="w-11 h-11 rounded-t-[16px] rounded-b-[5px] bg-white p-1.5 flex items-center justify-center shadow-card">
            <Image src="/logo.png" alt="" width={32} height={32} className="object-contain" />
          </span>
          <span className="font-fraunces text-2xl text-ink">Hifzoon</span>
        </Link>

        <p className="font-fraunces text-[88px] sm:text-[112px] leading-none text-gold/80 select-none" aria-hidden>
          {copy.code}
        </p>
        <h1 className="mt-4 text-2xl sm:text-3xl text-ink">{title ?? copy.title}</h1>
        <p className="mt-3 text-sm text-muted leading-relaxed max-w-md mx-auto">{body ?? copy.body}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {buttons.map((action) => {
            const cls =
              action.variant === 'secondary'
                ? 'bg-white text-ink border border-line hover:bg-sand'
                : 'bg-green-800 text-white border border-green-800 hover:bg-green-700';
            const base =
              'inline-flex items-center justify-center h-11 px-6 rounded-full text-sm font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2';
            return action.href ? (
              <Link key={action.label} href={action.href} className={`${base} ${cls}`}>
                {action.label}
              </Link>
            ) : (
              <button key={action.label} type="button" onClick={action.onClick} className={`${base} ${cls}`}>
                {action.label}
              </button>
            );
          })}
        </div>

        {detail && <p className="mt-6 text-[11px] text-muted">{detail}</p>}
      </div>
    </div>
  );
}

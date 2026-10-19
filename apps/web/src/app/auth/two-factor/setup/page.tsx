'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { EnrolTwoFactor } from '@/components/auth/TwoFactorEnrolment';
import { useAuth } from '@/hooks';
import { getDefaultRouteForRole, getSafeRedirectUrl, isStaffUser } from '@/lib/api/client';

/**
 * `/auth/two-factor/setup?next=…` — the step staff take straight after signing in when
 * they have no 2FA yet (FR-AUTH-01). Until they finish, the API answers every other call
 * with TWO_FACTOR_ENROLMENT_REQUIRED (backend M42), so this page is where they get stuck
 * on purpose — with an explanation and the QR code, not a settings page.
 */
function TwoFactorSetup() {
  const router = useRouter();
  const params = useSearchParams();
  const { currentUser, logout } = useAuth();
  const next = getSafeRedirectUrl(params.get('next'), '') || (currentUser ? getDefaultRouteForRole(currentUser.roles) : '/dashboard');
  const needsSetup = Boolean(currentUser && isStaffUser(currentUser.roles) && !currentUser.twoFactorEnabled);

  // Nothing to do here for families, students or staff who already use 2FA.
  useEffect(() => {
    if (currentUser && !needsSetup) router.replace(next);
  }, [currentUser, needsSetup, next, router]);

  if (!currentUser || !needsSetup) {
    return <Loader2 className="w-8 h-8 animate-spin text-gold" aria-label="Loading" />;
  }

  return (
    <div className="max-w-2xl w-full bg-white rounded-3xl border border-line p-6 sm:p-8 shadow-card space-y-6">
      <div className="flex items-start gap-4">
        <span className="shrink-0 w-12 h-12 rounded-2xl bg-green-50 text-green-800 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-600">One more step</p>
          <h1 className="text-2xl font-fraunces text-ink">Secure your staff account</h1>
          <p className="mt-1 text-sm text-muted">
            Assalamu alaikum {currentUser.name?.split(' ')[0] ?? ''}. Teacher and staff accounts can see children&apos;s
            records, so Hifzoon requires two-factor authentication before your account can be used. It takes about a
            minute, and next time you&apos;ll only need the 6-digit code from your app.
          </p>
        </div>
      </div>

      <ol className="grid sm:grid-cols-3 gap-3 text-xs text-ink-2">
        {[
          'Install an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password or Authy.',
          'Confirm your password, then scan the QR code (or type the key).',
          'Save your recovery codes, then enter the 6-digit code to finish.',
        ].map((text, i) => (
          <li key={text} className="rounded-xl border border-line bg-cream px-3 py-2.5">
            <span className="block text-[11px] font-semibold text-gold-600">Step {i + 1}</span>
            {text}
          </li>
        ))}
      </ol>

      <EnrolTwoFactor startOpen onEnabled={() => router.replace(next)} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <span>Signed in as {currentUser.email}</span>
        <button
          type="button"
          onClick={() => logout(false)}
          className="inline-flex items-center gap-1.5 font-semibold text-green-800 hover:underline"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );
}

export default function TwoFactorSetupPage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between">
      <Header />
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6">
        <ProtectedRoute>
          <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-gold" />}>
            <TwoFactorSetup />
          </Suspense>
        </ProtectedRoute>
      </main>
      <Footer />
    </div>
  );
}

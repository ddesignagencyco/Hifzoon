'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { completeOAuth, consumeOAuthReturnPath, type OAuthProviderName } from '@/lib/api/client';
import { postLoginDestination } from '@/lib/portal/nav';
import { Role } from '@/lib/types';
import { useToast } from '@/components/ui/toast';

/** Finishes a Google / Apple sign-in started on /login or linked from /account/security. */
function CompleteOAuth() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const started = useRef(false);

  const provider = params.get('provider') as OAuthProviderName | null;
  const code = params.get('code');
  const state = params.get('state');
  const providerError = params.get('error');

  // Problems visible in the URL itself are derived, not stored.
  const urlError = providerError
    ? providerError === 'access_denied' || providerError === 'user_cancelled_authorize'
      ? 'Sign-in was cancelled.'
      : params.get('error_description') || 'The provider could not complete sign-in.'
    : !provider || !code || !state
      ? 'This sign-in link is incomplete. Please start again.'
      : null;
  const error = urlError ?? exchangeError;

  useEffect(() => {
    // The state is single-use: never send it twice (React dev mode runs effects twice).
    if (urlError || !provider || !code || !state || started.current) return;
    started.current = true;

    completeOAuth(provider, { code, state }).then((res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['auth'] });
        toast.success('Signed in.');
        router.replace(postLoginDestination(consumeOAuthReturnPath(), (res.user?.roles ?? []) as Role[], res.user?.twoFactorEnabled));
      } else {
        setExchangeError(res.error ?? 'Sign-in could not be completed.');
      }
    });
  }, [urlError, provider, code, state, queryClient, router, toast]);

  if (!error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
        Completing sign-in…
      </div>
    );
  }

  return (
    <div className="max-w-md w-full bg-white rounded-3xl border border-line p-8 shadow-card space-y-4 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto text-red" />
      <h1 className="text-2xl font-fraunces text-ink">Sign-in not completed</h1>
      <p className="text-sm text-muted">{error}</p>
      <Link
        href="/login"
        className="inline-flex h-11 items-center justify-center rounded-full bg-green-950 px-6 text-sm font-semibold text-white hover:bg-green-900"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export default function OAuthCompletePage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between">
      <Header />
      <main className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6">
        <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-gold" />}>
          <CompleteOAuth />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

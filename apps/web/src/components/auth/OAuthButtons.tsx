'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  fetchOAuthProviders,
  rememberOAuthReturnPath,
  startOAuth,
  type OAuthProviderName,
} from '@/lib/api/client';
import { useToast } from '@/components/ui/toast';

const LABELS: Record<OAuthProviderName, string> = { google: 'Google', apple: 'Apple' };

export const oauthProviderKeys = ['auth', 'oauth-providers'] as const;

/** Configured sign-in providers (`GET /auth/oauth/providers`); empty while loading or offline. */
export function useOAuthProviders() {
  return useQuery({
    queryKey: oauthProviderKeys,
    queryFn: fetchOAuthProviders,
    staleTime: 10 * 60 * 1000,
    select: (rows) => rows.filter((p) => p.configured).map((p) => p.name),
  });
}

/**
 * "Continue with Google / Apple" (FR-AUTH-01). Signed out it signs in; on a signed-in page
 * (`mode="link"`) the backend links the identity to the current account — the link is
 * decided at `/start` from the access token.
 */
export function OAuthButtons({
  mode = 'signin',
  returnTo,
}: {
  mode?: 'signin' | 'link';
  /** Where to land afterwards; defaults to the user's portal. */
  returnTo?: string;
}) {
  const toast = useToast();
  const providers = useOAuthProviders();
  const [pending, setPending] = useState<OAuthProviderName | null>(null);

  if (!providers.data?.length) return null;

  const go = async (provider: OAuthProviderName) => {
    setPending(provider);
    const res = await startOAuth(provider);
    if (res.success && res.authorizationUrl) {
      if (returnTo) rememberOAuthReturnPath(returnTo);
      window.location.assign(res.authorizationUrl);
      return;
    }
    setPending(null);
    toast.error(res.error ?? `Sign in with ${LABELS[provider]} is unavailable right now.`);
  };

  return (
    <div className="space-y-2">
      {mode === 'signin' && (
        <div className="flex items-center gap-3 text-[11px] text-muted uppercase tracking-wider">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      <div className={mode === 'signin' ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
        {providers.data.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => go(provider)}
            disabled={pending !== null}
            className="h-11 px-5 rounded-full border border-line bg-white text-sm font-medium text-ink hover:bg-sand disabled:opacity-60 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {pending === provider && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signin' ? `Continue with ${LABELS[provider]}` : `Link ${LABELS[provider]}`}
          </button>
        ))}
      </div>
    </div>
  );
}

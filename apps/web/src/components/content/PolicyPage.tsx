'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ContentBody } from '@/components/content/ContentBody';
import { LoadErrorToast } from '@/components/content/LoadErrorToast';
import { useContentPage } from '@/hooks/useContent';
import { ApiClientError } from '@/lib/api/http';
import { POLICY_DRAFTS, POLICY_DRAFT_UPDATED, PolicySlug } from './policy-drafts';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Public policy page (CR-12). Shows the CMS version from `GET /content/:slug` when one is
 * published; on 404 falls back to the built-in draft, clearly labelled as pending legal
 * review (CR-13).
 */
export function PolicyPage({ slug }: { slug: PolicySlug }) {
  const page = useContentPage(slug);
  const notFound = page.error instanceof ApiClientError && page.error.status === 404;
  const draft = POLICY_DRAFTS[slug];

  let content: React.ReactNode;
  if (page.isLoading) {
    content = (
      <div role="status" className="flex items-center gap-2 py-16 justify-center text-sm text-[#6b7772]">
        <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> Loading…
      </div>
    );
  } else if (page.data) {
    const updated = page.data.updatedAt ?? page.data.publishedAt;
    content = (
      <article>
        {updated && (
          <p className="text-[11px] font-medium text-[#6b7772] mb-2">Last updated {formatDate(updated)}</p>
        )}
        <h1 className="font-fraunces text-3xl sm:text-5xl font-normal text-[#10201b] tracking-tight mb-8">{page.data.title}</h1>
        <ContentBody body={page.data.body} />
      </article>
    );
  } else if (page.isError && !notFound) {
    content = (
      <div className="text-center py-16 space-y-3">
        <h1 className="font-fraunces text-3xl text-[#10201b]">Could not load this page</h1>
        <LoadErrorToast error={page.error} />
        <button type="button" onClick={() => page.refetch()} className="text-sm font-semibold underline cursor-pointer">
          Try again
        </button>
      </div>
    );
  } else {
    content = (
      <article>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="inline-flex items-center rounded-full border border-[#c49a55]/40 bg-[#f6ecd9] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#a97f3c]">
            Draft — pending legal review (CR-13)
          </span>
          <span className="text-[11px] font-medium text-[#6b7772]">Last updated {formatDate(POLICY_DRAFT_UPDATED)}</span>
        </div>
        <h1 className="font-fraunces text-3xl sm:text-5xl font-normal text-[#10201b] tracking-tight mb-8">{draft.title}</h1>
        <ContentBody body={draft.body} />
      </article>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between">
      <Header />
      <main className="flex-1">
        <div className="site-container py-12 md:py-16">
          <div className="max-w-[760px] mx-auto">{content}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

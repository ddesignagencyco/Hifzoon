'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ContentBody } from '@/components/content/ContentBody';
import { useContentPage } from '@/hooks/useContent';
import { ApiClientError } from '@/lib/api/http';
import { LoadErrorToast } from '@/components/content/LoadErrorToast';

const TYPE_LABEL = { BLOG: 'Article', PRINTABLE: 'Printable', LANDING: 'Guide' } as const;

function ResourceLoading() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 py-24 justify-center text-sm text-[#6b7772]"
    >
      <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> Loading…
    </div>
  );
}

export default function ResourcePage() {
  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between">
      <Header />
      <main className="flex-1">
        {/* The slug comes from the URL, so the article streams in after the static shell. */}
        <Suspense fallback={<ResourceLoading />}>
          <ResourceFromUrl />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

function ResourceFromUrl() {
  const { slug } = useParams<{ slug: string }>();
  const page = useContentPage(slug);
  const notFound = page.error instanceof ApiClientError && page.error.status === 404;

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-12 md:py-16">
      <Link
        href="/resources"
        className="inline-flex items-center gap-1.5 text-xs text-[#6b7772] hover:text-[#10201b] mb-6 print:hidden"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> All resources
      </Link>

      {page.isLoading ? (
        <div
          role="status"
          className="flex items-center gap-2 py-16 justify-center text-sm text-[#6b7772]"
        >
          <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> Loading…
        </div>
      ) : page.isError || !page.data ? (
        <div className="text-center py-16 space-y-3">
          <h1 className="font-fraunces text-3xl text-[#10201b]">
            {notFound ? 'Page not found' : 'Could not load this page'}
          </h1>
          {notFound && (
            <p className="text-sm text-[#6b7772]">It may have been unpublished or moved.</p>
          )}
          {!notFound && page.isError && <LoadErrorToast error={page.error} />}
          {!notFound && (
            <button
              type="button"
              onClick={() => page.refetch()}
              className="text-sm font-semibold underline cursor-pointer"
            >
              Try again
            </button>
          )}
        </div>
      ) : (
        <article>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#a97f3c] mb-2">
            {TYPE_LABEL[page.data.type] ?? 'Resource'}
            {page.data.publishedAt && (
              <span className="text-[#6b7772] font-medium normal-case tracking-normal">
                {' · '}
                {new Date(page.data.publishedAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
          </p>
          <h1 className="font-fraunces text-3xl sm:text-5xl font-normal text-[#10201b] tracking-tight mb-8">
            {page.data.title}
          </h1>
          {page.data.type === 'PRINTABLE' && (
            <button
              type="button"
              onClick={() => window.print()}
              className="mb-6 inline-flex items-center gap-2 h-10 px-5 rounded-full border border-[#e6dfd1] bg-white text-sm font-medium text-[#10201b] hover:bg-[#f3eee4] cursor-pointer print:hidden"
            >
              <Printer className="w-4 h-4" aria-hidden /> Print
            </button>
          )}
          <ContentBody body={page.data.body} />
        </article>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PillTabs } from '@/components/landing/PillTabs';
import { FaqAskForm } from '@/components/content/FaqAskForm';
import { useContentList } from '@/hooks/useContent';
import { useFaqs } from '@/hooks';
import { LoadErrorToast } from '@/components/content/LoadErrorToast';
import { ContentType, excerpt } from '@/lib/api/modules/content-public';

const TABS: Array<{ id: '' | ContentType; label: string }> = [
  { id: '', label: 'Everything' },
  { id: 'BLOG', label: 'Articles' },
  { id: 'PRINTABLE', label: 'Printables' },
];

const TYPE_LABEL: Record<ContentType, string> = { BLOG: 'Article', PRINTABLE: 'Printable', LANDING: 'Guide' };

export default function ResourcesPage() {
  const [type, setType] = useState<'' | ContentType>('');
  const posts = useContentList({ type: type || undefined, limit: 50 });
  const { faqs } = useFaqs();

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between">
      <Header />
      <main className="flex-1">
        <section className="bg-[#0f2c24] text-white py-16 md:py-24 px-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="max-w-[1360px] mx-auto text-center relative z-10">
            <h1 className="text-3xl sm:text-5xl font-fraunces font-normal tracking-tight mb-4">Resources for families</h1>
            <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Guidance from our teachers on memorisation, revision and learning at home, plus printable trackers.
            </p>
          </div>
        </section>

        <div className="site-container py-14 space-y-16">
          <section aria-labelledby="articles-heading">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <h2 id="articles-heading" className="font-fraunces text-2xl sm:text-3xl text-[#10201b]">
                Articles &amp; printables
              </h2>
              <PillTabs items={TABS} activeId={type} onChange={(id) => setType(id as '' | ContentType)} />
            </div>

            {posts.isLoading ? (
              <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-[#6b7772]">
                <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> Loading resources…
              </div>
            ) : posts.isError ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-sm text-[#10201b] font-semibold">Could not load resources</p>
                <LoadErrorToast error={posts.error} />
                <button type="button" onClick={() => posts.refetch()} className="text-xs font-semibold underline cursor-pointer">
                  Try again
                </button>
              </div>
            ) : !posts.data || posts.data.length === 0 ? (
              <p className="text-center py-12 text-sm text-[#6b7772]">Nothing published here yet. Check back soon.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.data.map((post) => (
                  <article key={post.id} className="bg-white rounded-[24px] border border-[#e6dfd1] shadow-card p-6 flex flex-col">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#a97f3c]">
                      {TYPE_LABEL[post.type]}
                      {post.publishedAt && (
                        <span className="text-[#6b7772] font-medium normal-case tracking-normal">
                          {' · '}
                          {new Date(post.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </p>
                    <h3 className="font-fraunces text-xl text-[#10201b] mt-2 mb-2">
                      <Link href={`/resources/${post.slug}`} className="hover:underline underline-offset-4">
                        {post.title}
                      </Link>
                    </h3>
                    <p className="text-sm text-[#6b7772] leading-relaxed flex-1">{excerpt(post.body)}</p>
                    <Link
                      href={`/resources/${post.slug}`}
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#143a2f] hover:underline"
                      aria-label={`Read ${post.title}`}
                    >
                      Read <ArrowRight className="w-4 h-4 text-[#c49a55]" aria-hidden />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="faq-heading" className="grid lg:grid-cols-[1.2fr_0.8fr] gap-10 items-start">
            <div>
              <h2 id="faq-heading" className="font-fraunces text-2xl sm:text-3xl text-[#10201b] mb-6">
                Frequently asked questions
              </h2>
              {faqs.length === 0 ? (
                <p className="text-sm text-[#6b7772]">No answered questions yet.</p>
              ) : (
                <div className="space-y-3">
                  {faqs.map((faq) => (
                    <details key={faq.q} className="group bg-white rounded-2xl border border-[#e6dfd1] p-5">
                      <summary className="cursor-pointer font-semibold text-[#10201b] text-sm list-none flex justify-between gap-4">
                        {faq.q}
                        <span className="text-[#c49a55] group-open:rotate-45 transition-transform" aria-hidden>
                          +
                        </span>
                      </summary>
                      <p className="text-sm text-[#3c4a45] leading-relaxed mt-3">{faq.a}</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
            <FaqAskForm />
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

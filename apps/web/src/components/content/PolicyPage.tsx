'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Loader2, 
  ShieldCheck, 
  Lock, 
  FileText, 
  RefreshCw, 
  ChevronRight, 
  ExternalLink,
  Mail,
  Printer
} from 'lucide-react';
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

const POLICY_NAV: Array<{
  slug: PolicySlug;
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { slug: 'child-safety-policy', href: '/child-safety', label: 'Child Safeguarding Code', shortLabel: 'Safeguarding', icon: ShieldCheck },
  { slug: 'privacy-policy', href: '/privacy', label: 'Privacy Policy (COPPA/GDPR)', shortLabel: 'Privacy', icon: Lock },
  { slug: 'terms-of-service', href: '/terms', label: 'Terms of Service', shortLabel: 'Terms', icon: FileText },
  { slug: 'refund-policy', href: '/refunds', label: 'Refund & Reschedule Terms', shortLabel: 'Refunds', icon: RefreshCw },
];

/**
 * Public policy page (CR-12). Shows the CMS version from `GET /content/:slug` when one is
 * published; on 404 falls back to the built-in draft, clearly labelled as pending legal
 * review (CR-13). Full-width layout with responsive policy navigation sidebar.
 */
export function PolicyPage({ slug }: { slug: PolicySlug }) {
  const page = useContentPage(slug);
  const notFound = page.error instanceof ApiClientError && page.error.status === 404;
  const draft = POLICY_DRAFTS[slug];

  const pageTitle = page.data ? page.data.title : draft.title;
  const lastUpdated = page.data
    ? page.data.updatedAt ?? page.data.publishedAt
    : POLICY_DRAFT_UPDATED;

  let bodyContent: React.ReactNode;
  if (page.isLoading) {
    bodyContent = (
      <div role="status" className="flex flex-col items-center gap-3 py-24 justify-center text-sm text-[#6b7772]">
        <Loader2 className="w-6 h-6 animate-spin text-[#c49a55]" aria-hidden /> 
        <span>Loading policy documentation…</span>
      </div>
    );
  } else if (page.data) {
    bodyContent = (
      <article>
        {lastUpdated && (
          <p className="text-[11px] font-medium text-[#6b7772] mb-3">Last updated {formatDate(lastUpdated)}</p>
        )}
        <h1 className="font-fraunces text-3xl sm:text-4xl lg:text-5xl font-normal text-[#10201b] tracking-tight mb-8">
          {page.data.title}
        </h1>
        <ContentBody body={page.data.body} />
      </article>
    );
  } else if (page.isError && !notFound) {
    bodyContent = (
      <div className="text-center py-16 space-y-4">
        <h1 className="font-fraunces text-3xl text-[#10201b]">Could not load this page</h1>
        <LoadErrorToast error={page.error} />
        <button 
          type="button" 
          onClick={() => page.refetch()} 
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#143a2f] text-white text-xs font-semibold hover:bg-[#0f2c24] cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  } else {
    bodyContent = (
      <article>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="inline-flex items-center rounded-full border border-[#c49a55]/40 bg-[#f6ecd9] px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#a97f3c]">
            Draft — pending legal review (CR-13)
          </span>
          <span className="text-[11px] font-medium text-[#6b7772]">
            Last updated {formatDate(POLICY_DRAFT_UPDATED)}
          </span>
        </div>
        <h1 className="font-fraunces text-3xl sm:text-4xl lg:text-5xl font-normal text-[#10201b] tracking-tight mb-8">
          {draft.title}
        </h1>
        <ContentBody body={draft.body} />
      </article>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1">
        {/* Full-Width Grand Policy Hero */}
        <section className="bg-[#0f2c24] text-white py-14 md:py-20 relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="site-container relative z-10">
            
            {/* Breadcrumb Navigation */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#c4d3cd] mb-6">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              <span className="text-[#c4d3cd]">Safeguarding &amp; Governance</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              <span className="text-[#c49a55] font-medium truncate max-w-[200px] sm:max-w-none">{pageTitle}</span>
            </nav>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div className="max-w-3xl space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[#c49a55] text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Academy Governance &amp; Safeguarding Standards</span>
                </div>
                <div className="font-fraunces text-3xl sm:text-5xl font-normal tracking-tight text-white leading-tight">
                  {pageTitle}
                </div>
                <p className="text-[#c4d3cd] text-sm sm:text-base leading-relaxed">
                  Clear, transparent rules safeguarding every student, parent, and scholar across the Hifzoon digital learning ecosystem.
                </p>
              </div>

              {/* Quick Actions (e.g. Print) */}
              <div className="shrink-0 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.print();
                  }}
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-medium border border-white/15 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#c49a55]" />
                  <span>Print Document</span>
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* Mobile Horizontal Policy Tabs */}
        <div className="lg:hidden bg-white border-b border-[#e6dfd1] px-4 py-3 sticky top-16 z-20 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 min-w-max">
            {POLICY_NAV.map((item) => {
              const active = item.slug === slug;
              const Icon = item.icon;
              return (
                <Link
                  key={item.slug}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    active
                      ? 'bg-[#143a2f] text-white shadow-xs'
                      : 'bg-[#faf7f1] text-[#3c4a45] hover:bg-[#f3eee4]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Full-Width 2-Column Document Layout */}
        <div className="site-container py-10 md:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* Left Policy Navigation Sidebar (3 cols on large screens) */}
            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-24 space-y-6">
              <div className="bg-white rounded-[24px] border border-[#e6dfd1] p-5 shadow-card space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a97f3c] px-3">
                  Policy Documents
                </h3>
                <nav className="space-y-1">
                  {POLICY_NAV.map((item) => {
                    const active = item.slug === slug;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.slug}
                        href={item.href}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                          active
                            ? 'bg-[#143a2f] text-white shadow-xs'
                            : 'text-[#3c4a45] hover:bg-[#faf7f1] hover:text-[#10201b]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${active ? 'text-[#c49a55]' : 'text-[#6b7772]'}`} />
                          <span>{item.label}</span>
                        </div>
                        {active && <ChevronRight className="w-3.5 h-3.5 text-[#c49a55]" />}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Safeguarding Lead Contact Card */}
              <div className="bg-[#f0f6f3] rounded-[24px] border border-[#c4d3cd] p-5 space-y-3">
                <div className="flex items-center gap-2 text-[#143a2f]">
                  <ShieldCheck className="w-4 h-4" />
                  <h4 className="font-semibold text-xs uppercase tracking-wider">Designated Safeguarding</h4>
                </div>
                <p className="text-xs text-[#3c4a45] leading-relaxed">
                  Have a confidential child protection concern or safeguarding inquiry? Reach our Designated Safeguarding Officer directly:
                </p>
                <div className="pt-1">
                  <a
                    href="mailto:safeguarding@hifzoon.com"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#143a2f] hover:underline"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#c49a55]" />
                    <span>safeguarding@hifzoon.com</span>
                  </a>
                </div>
              </div>

              {/* Regulatory Assurance */}
              <div className="p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] text-[11px] text-[#6b7772] space-y-1.5">
                <p className="font-semibold text-[#10201b]">Regulatory Standards</p>
                <p>
                  Complies with UK Children&apos;s Code (Age Appropriate Design Code), US COPPA (16 CFR Part 312), and EU/UK GDPR student protections.
                </p>
              </div>
            </aside>

            {/* Right Main Document Body (9 cols on large screens) */}
            <div className="lg:col-span-8 xl:col-span-9">
              <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 lg:p-12 shadow-card">
                {bodyContent}
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

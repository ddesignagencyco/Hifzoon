'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Loader2, 
  Printer, 
  ChevronRight, 
  BookOpen, 
  Calendar, 
  CheckCircle2, 
  Award, 
  ArrowRight,
  ShieldCheck,
  GraduationCap
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ContentBody } from '@/components/content/ContentBody';
import { useContentPage } from '@/hooks/useContent';
import { ApiClientError } from '@/lib/api/http';
import { LoadErrorToast } from '@/components/content/LoadErrorToast';
import { Button } from '@/components/landing/Button';

const TYPE_LABEL = { BLOG: 'Academic Article', PRINTABLE: 'Downloadable Printable', LANDING: 'Curriculum Guide' } as const;

function ResourceLoading() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 py-28 justify-center text-sm text-[#6b7772]"
    >
      <Loader2 className="w-6 h-6 animate-spin text-[#c49a55]" aria-hidden />
      <span>Loading educational resource…</span>
    </div>
  );
}

export default function ResourcePage() {
  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />
      <main className="flex-1">
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

  if (page.isLoading) {
    return <ResourceLoading />;
  }

  if (page.isError || !page.data) {
    return (
      <div className="site-container py-20 text-center space-y-4">
        <h1 className="font-fraunces text-3xl sm:text-4xl text-[#10201b]">
          {notFound ? 'Resource Not Found' : 'Could Not Load This Resource'}
        </h1>
        <p className="text-sm text-[#6b7772] max-w-md mx-auto">
          {notFound
            ? 'The educational article or printable guide you are looking for may have been moved or updated.'
            : 'An unexpected connection error occurred while retrieving this publication.'}
        </p>
        {!notFound && page.isError && <LoadErrorToast error={page.error} />}
        <div className="pt-4 flex items-center justify-center gap-3">
          <Link
            href="/resources"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#143a2f] text-white text-xs font-semibold hover:bg-[#1a4a3c] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to Resources Hub
          </Link>
          {!notFound && (
            <button
              type="button"
              onClick={() => page.refetch()}
              className="text-xs font-semibold text-[#143a2f] underline cursor-pointer"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  const { title, body, type, publishedAt } = page.data;

  return (
    <div>
      {/* Full-Width Grand Hero Banner strictly aligned to .site-container */}
      <section className="bg-[#0f2c24] text-white py-12 md:py-16 relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
        <div className="site-container relative z-10">
          
          {/* Breadcrumb Navigation */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#c4d3cd] mb-6 print:hidden">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            <Link href="/resources" className="hover:text-white transition-colors">Resources</Link>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            <span className="text-[#c49a55] font-medium truncate max-w-[200px] sm:max-w-none">{title}</span>
          </nav>

          <div className="max-w-3xl space-y-4">
            <div className="text-xs font-semibold tracking-wider uppercase text-[#c49a55] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#c49a55]" aria-hidden />
              <span>{TYPE_LABEL[type] ?? 'Curriculum Resource'}</span>
              {publishedAt && (
                <>
                  <span className="text-white/40">·</span>
                  <span className="text-[#c4d3cd] font-normal normal-case">
                    {new Date(publishedAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </>
              )}
            </div>

            <h1 className="font-fraunces text-3xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-white leading-[1.1]">
              {title}
            </h1>

            {/* Scholarly Attribution Chips */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                <GraduationCap className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                Hifzoon Academic Advisory Board
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                <ShieldCheck className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                Curriculum Verified
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* Main Educational Reading Workspace (Strictly aligned to .site-container) */}
      <div className="site-container py-10 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Main Article Body Plaque (8 cols) */}
          <article className="lg:col-span-8 bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 lg:p-12 shadow-card space-y-8">
            
            {type === 'PRINTABLE' && (
              <div className="flex items-center justify-between pb-6 border-b border-[#f3eee4] print:hidden">
                <span className="text-xs text-[#6b7772]">
                  Authorized for home and family study printing.
                </span>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-xs font-semibold text-[#10201b] hover:bg-white hover:border-[#c49a55] transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-[#143a2f]" aria-hidden /> Print Document
                </button>
              </div>
            )}

            <div className="prose max-w-none text-[#3c4a45]">
              <ContentBody body={body} />
            </div>

            <div className="pt-8 border-t border-[#f3eee4] flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
              <Link
                href="/resources"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#143a2f] hover:underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to all articles &amp; guides
              </Link>
              <span className="text-[11px] text-[#6b7772]">
                Published by Hifzoon Academy Academic Department
              </span>
            </div>
          </article>

          {/* Sticky Sidebar (4 cols) */}
          <aside className="lg:col-span-4 sticky top-28 space-y-6 print:hidden">
            
            {/* Admissions Diagnostic Callout Card */}
            <div className="bg-[#0f2c24] text-white rounded-[28px] p-6 sm:p-8 shadow-large border border-[#143a2f] relative overflow-hidden space-y-5">
              <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
              
              <div className="relative z-10 space-y-4">
                <span className="text-[#c49a55] text-xs font-semibold uppercase tracking-wider block">
                  Complimentary Assessment
                </span>
                <h3 className="text-xl sm:text-2xl font-fraunces font-normal text-white">
                  Experience Hifzoon With a Free 1-on-1 Class
                </h3>
                <p className="text-xs text-[#c4d3cd] font-light leading-relaxed">
                  Have a certified Ustadh or Ustadha evaluate your child&apos;s current recitation and design an individualized study pathway.
                </p>

                <ul className="space-y-2 text-xs text-[#c4d3cd] pt-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#c49a55]" />
                    <span>30-minute private evaluation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#c49a55]" />
                    <span>Written diagnostic report &amp; pathway</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#c49a55]" />
                    <span>Zero payment or credit card required</span>
                  </li>
                </ul>

                <div className="pt-2">
                  <Button
                    variant="gold"
                    size="default"
                    href="/book-trial"
                    className="w-full font-semibold justify-center shadow-md min-h-[46px]"
                  >
                    Book Diagnostic Class
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Pathways Navigation Card */}
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 shadow-card space-y-4">
              <h4 className="font-fraunces text-base font-medium text-[#10201b]">
                Academic Pathways
              </h4>
              <div className="space-y-2 text-xs">
                <Link
                  href="/courses"
                  className="flex items-center justify-between p-3 rounded-xl bg-[#faf7f1] hover:bg-[#f0f6f3] text-[#10201b] font-medium transition-colors"
                >
                  <span>Explore All 4 Structured Courses</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#143a2f]" />
                </Link>
                <Link
                  href="/teachers"
                  className="flex items-center justify-between p-3 rounded-xl bg-[#faf7f1] hover:bg-[#f0f6f3] text-[#10201b] font-medium transition-colors"
                >
                  <span>Meet Our Verified Scholars</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#143a2f]" />
                </Link>
                <Link
                  href="/pricing"
                  className="flex items-center justify-between p-3 rounded-xl bg-[#faf7f1] hover:bg-[#f0f6f3] text-[#10201b] font-medium transition-colors"
                >
                  <span>Tuition &amp; Family Study Plans</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#143a2f]" />
                </Link>
              </div>
            </div>

          </aside>

        </div>
      </div>
    </div>
  );
}

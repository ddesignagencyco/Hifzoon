'use client';

import { Suspense } from 'react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CourseDetailView } from '@/components/content/CourseDetailView';

function CourseFromUrl() {
  const { code } = useParams<{ code: string }>();
  return <CourseDetailView code={decodeURIComponent(code)} />;
}

function CourseLoading() {
  return <BrandLoader variant="page" label="Loading…" />;
}

export default function CourseDetailPage() {
  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between">
      <Header />
      <main className="flex-1">
        {/* The course code comes from the URL, so it streams in after the static shell. */}
        <Suspense fallback={<CourseLoading />}>
          <CourseFromUrl />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

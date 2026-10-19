'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CourseDetailView } from '@/components/content/CourseDetailView';

function CourseFromUrl() {
  const { code } = useParams<{ code: string }>();
  return <CourseDetailView code={decodeURIComponent(code)} />;
}

function CourseLoading() {
  return (
    <div role="status" className="flex items-center gap-2 py-24 justify-center text-sm text-[#6b7772]">
      <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> Loading…
    </div>
  );
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

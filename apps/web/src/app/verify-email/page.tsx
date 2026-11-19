'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { verifyEmail } from '@/lib/api/client';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Capture token in memory and strip it from the URL so it does not linger in browser history.
  const [token] = useState(() => searchParams.get('token') ?? '');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(
    token ? 'verifying' : 'error',
  );
  const [message, setMessage] = useState(
    token
      ? 'Verifying your email address…'
      : 'This verification link is missing a token. Please open the full link from your email.',
  );
  const started = useRef(false);

  useEffect(() => {
    if (searchParams.has('token')) {
      router.replace('/verify-email', { scroll: false });
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    let cancelled = false;
    void verifyEmail(token).then((result) => {
      if (cancelled) return;
      setStatus(result.success ? 'success' : 'error');
      setMessage(result.message);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 md:p-10 border border-[#0f2c24]/10 shadow-xl shadow-[#0f2c24]/5 text-center">
          <Link href="/" className="inline-flex items-center justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Hifzoon"
              width={48}
              height={48}
              className="h-12 w-auto object-contain"
              priority
            />
          </Link>

          {status === 'verifying' && (
            <div className="space-y-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-[#0f2c24]/5 flex items-center justify-center text-[#0f2c24]">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <h1 className="text-2xl font-fraunces text-[#0f2c24]">Verifying Your Email</h1>
              <p className="text-sm text-[#4a5b55] leading-relaxed">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-5">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-fraunces text-[#0f2c24]">Email Verified</h1>
              <p className="text-sm text-[#4a5b55] leading-relaxed">{message}</p>
              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f2c24] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#173d33] transition-colors"
              >
                Sign In to Your Account
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-5">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
                <XCircle className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-fraunces text-[#0f2c24]">Verification Failed</h1>
              <p className="text-sm text-[#4a5b55] leading-relaxed">{message}</p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f2c24] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#173d33] transition-colors"
                >
                  Go to Sign In
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/"
                  className="text-sm font-medium text-[#0f2c24]/70 hover:text-[#0f2c24] transition-colors"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<BrandLoader variant="fullscreen" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

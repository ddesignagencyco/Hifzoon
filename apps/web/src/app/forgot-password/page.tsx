'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Mail, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  KeyRound, 
  Clock 
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setEmailError(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    const res = await forgotPassword(email.trim().toLowerCase());
    setIsLoading(false);

    if (res.success) {
      setSubmitted(true);
    } else {
      setErrorMessage(res.error || 'Unable to submit password reset request. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between selection:bg-gold/20 selection:text-green-950">
      <Header />

      <main className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-line p-8 sm:p-10 shadow-card space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="relative w-14 h-14 mx-auto rounded-t-2xl rounded-b-lg bg-gold p-2 flex items-center justify-center shadow-sm">
              <Image
                src="/logo.png"
                alt="Hifzoon"
                width={48}
                height={48}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-fraunces font-normal text-ink tracking-tight">
              Reset Your Password
            </h1>
            <p className="text-xs text-muted leading-relaxed">
              Enter the email address registered with your Hifzoon account to receive a secure recovery link.
            </p>
          </div>

          {submitted ? (
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-green-50 border border-green-200 text-green-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-fraunces font-semibold text-ink">
                  Recovery Email Dispatched
                </h2>
                <p className="text-xs text-muted leading-relaxed">
                  If an account exists for <strong className="text-ink">{email}</strong>, a one-time password reset token has been delivered to your inbox.
                </p>
              </div>

              <div className="p-3.5 bg-cream rounded-2xl border border-line text-left space-y-2 text-xs text-ink-2">
                <div className="flex items-center gap-2 text-green-900 font-semibold">
                  <Clock className="w-4 h-4 text-gold" />
                  <span>30-Minute Security Window</span>
                </div>
                <p className="text-[11px] text-muted">
                  For your security (NFR-SEC-04), reset links expire exactly 30 minutes after generation and revoke all existing sessions upon use.
                </p>
              </div>

              <Link
                href="/login"
                className="w-full h-11 rounded-full font-semibold text-xs text-white bg-green-950 hover:bg-green-900 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Sign In</span>
              </Link>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      placeholder="parent@example.com"
                      className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${
                        emailError ? 'border-red-400' : 'border-line'
                      }`}
                    />
                  </div>
                  {emailError && <p className="text-[11px] text-red-600 mt-1 pl-3">{emailError}</p>}
                </div>

                <div className="p-3 bg-cream rounded-2xl border border-line text-xs text-muted flex items-start gap-2">
                  <KeyRound className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-relaxed">
                    Account lockout and password reset limits are strictly enforced (NFR-SEC-04). Resetting your password will terminate all active logins across devices.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-full font-semibold text-sm text-white bg-green-950 hover:bg-green-900 disabled:opacity-60 shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Instructions...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Reset Link</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-4 border-t border-line text-center text-xs text-muted">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-green-800 font-semibold hover:underline">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </Link>
              </div>
            </>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}

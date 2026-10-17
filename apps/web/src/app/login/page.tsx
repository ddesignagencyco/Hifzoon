'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Lock,
  Mail,
  ShieldCheck,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Smartphone
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks';
import { getSafeRedirectUrl } from '@/lib/api/client';
import { postLoginDestination } from '@/lib/portal/nav';
import { Role } from '@/lib/types';
import { useToast } from '@/components/ui/toast';
import { OAuthButtons } from '@/components/auth/OAuthButtons';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = getSafeRedirectUrl(searchParams.get('redirect'), '/dashboard');

  const { login, isAuthenticated, currentUser } = useAuth();
  const toast = useToast();

  const [roleTab, setRoleTab] = useState<'PARENT' | 'STUDENT' | 'TEACHER' | 'STAFF'>('PARENT');
  const [studentMode, setStudentMode] = useState<'ACCOUNT' | 'KIDS_PIN'>('ACCOUNT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showTwoFactorField, setShowTwoFactorField] = useState(false);
  /** Recovery codes are 8 characters (base64url); TOTP codes are 6 digits. */
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Quick field-level validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // If already authenticated, redirect straight to target portal
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      router.replace(postLoginDestination(redirectTarget, currentUser.roles));
    }
  }, [isAuthenticated, currentUser, router, redirectTarget]);

  const validateForm = (): boolean => {
    setEmailError(null);
    setPasswordError(null);

    const problems: string[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      const msg = 'Please enter a valid email address.';
      setEmailError(msg);
      problems.push(msg);
    }

    if (!password) {
      const msg = 'Password is required.';
      setPasswordError(msg);
      problems.push(msg);
    }
    // No length rule here: that is a sign-up policy. Sign-in sends what was typed and the
    // server decides (an older account may predate the current minimum).

    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : 'Please fix the highlighted fields');
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (roleTab === 'STUDENT' && studentMode === 'KIDS_PIN') return;

    if (showTwoFactorField) {
      const valid = useRecoveryCode ? twoFactorCode.trim().length >= 6 : /^\d{6}$/.test(twoFactorCode.trim());
      if (!valid) {
        setTwoFactorError(true);
        toast.error(useRecoveryCode ? 'Enter one of your saved recovery codes.' : 'Please enter the 6-digit verification code.');
        return;
      }
    } else {
      if (!validateForm()) {
        return;
      }

    }

    setIsLoading(true);

    // Include client device fingerprint for session registry (FR-AUTH-07)
    const deviceId = typeof window !== 'undefined' ? `${navigator.userAgent.slice(0, 32)}-web` : undefined;

    const res = await login({
      email: email.trim().toLowerCase(),
      password,
      twoFactorCode: showTwoFactorField && twoFactorCode.trim() ? twoFactorCode.trim() : undefined,
      deviceId,
    });

    setIsLoading(false);

    if (res.twoFactorRequired) {
      // Step 2: the password was right and the account has 2FA on.
      setShowTwoFactorField(true);
      setTwoFactorCode('');
      setTwoFactorError(false);
      return;
    }

    if (res.twoFactorInvalid) {
      setTwoFactorError(true);
      toast.error(res.error ?? 'That code is not valid.');
      return;
    }

    if (res.success) {
      toast.success(`Welcome back, ${res.user?.name || 'User'}!`);
      router.push(postLoginDestination(redirectTarget, (res.user?.roles ?? []) as Role[]));
    } else {
      toast.error(res.error || 'Authentication failed. Please verify your credentials or check lockout status.');
    }
  };

  const leaveTwoFactorStep = () => {
    setShowTwoFactorField(false);
    setTwoFactorCode('');
    setUseRecoveryCode(false);
    setTwoFactorError(false);
  };

  return (
    <div className="max-w-md w-full bg-white rounded-3xl border border-line p-8 sm:p-10 shadow-card space-y-6">

      {/* Header Brand Badge */}
      <div className="text-center space-y-3">
        <div className="relative w-14 h-14 mx-auto rounded-t-2xl rounded-b-lg bg-white p-2 flex items-center justify-center shadow-sm">
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
          {showTwoFactorField ? 'Two-Factor Verification' : 'Sign In to Hifzoon'}
        </h1>
        <p className="text-xs text-muted leading-relaxed">
          {showTwoFactorField
            ? 'Enter the code from your authenticator app to complete sign-in'
            : 'Family academic portal, synchronized Mushaf, and faculty timetable'}
        </p>
      </div>

      {/* Step 1: Role switcher (only shown when not on the 2FA challenge) */}
      {!showTwoFactorField && (
        <>
          {/* Role Switcher Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-sand rounded-full text-xs font-medium text-center">
            {(['PARENT', 'STUDENT', 'TEACHER', 'STAFF'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRoleTab(r);
                  setEmailError(null);
                  setPasswordError(null);
                }}
                className={`py-2 px-1 rounded-full transition-all cursor-pointer ${roleTab === r
                    ? 'bg-green-800 text-white shadow-sm font-semibold'
                    : 'text-ink-2 hover:text-ink'
                  }`}
              >
                {r === 'PARENT' ? 'Parent' : r === 'STUDENT' ? 'Student' : r === 'TEACHER' ? 'Faculty' : 'Staff'}
              </button>
            ))}
          </div>

        </>
      )}

      {/* Student Sub-Mode Selector */}
      {!showTwoFactorField && roleTab === 'STUDENT' && (
        <div className="flex p-1 bg-sand rounded-xl text-xs font-medium gap-1">
          <button
            type="button"
            onClick={() => {
              setStudentMode('ACCOUNT');
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer ${studentMode === 'ACCOUNT' ? 'bg-white shadow-xs font-semibold text-ink' : 'text-muted hover:text-ink'
              }`}
          >
            Student Account (Email)
          </button>
          <button
            type="button"
            onClick={() => {
              setStudentMode('KIDS_PIN');
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer ${studentMode === 'KIDS_PIN' ? 'bg-white shadow-xs font-semibold text-ink' : 'text-muted hover:text-ink'
              }`}
          >
            Kids Mode
          </button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        {showTwoFactorField ? (
          /* Step 2: 2FA Verification Challenge */
          <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
            <div className="p-4 rounded-2xl bg-sand/60 border border-line text-center space-y-1.5">
              <div className="w-10 h-10 mx-auto rounded-full bg-green-100 text-green-800 flex items-center justify-center mb-1">
                <ShieldCheck className="w-5 h-5 text-green-900" />
              </div>
              <p className="text-xs font-medium text-ink">
                Authentication required for <span className="font-semibold text-green-900">{email}</span>
              </p>
              <p className="text-[11px] text-muted leading-relaxed">
                {useRecoveryCode
                  ? 'Enter one of the recovery codes you saved when you set up 2FA. Each code works once.'
                  : 'Open your authenticator app (e.g. Google Authenticator, Authy, 1Password) and enter your current 6-digit code.'}
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="login-2fa-code" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-gold" />
                  <span>{useRecoveryCode ? 'Recovery code' : 'Authenticator code'}</span>
                </label>
                <span className="text-[10px] text-muted font-mono">{useRecoveryCode ? '8 characters' : '6 digits'}</span>
              </div>
              <div className="relative max-w-[240px] mx-auto">
                <input
                  id="login-2fa-code"
                  type="text"
                  inputMode={useRecoveryCode ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={useRecoveryCode ? 32 : 6}
                  value={twoFactorCode}
                  onChange={(e) => {
                    setTwoFactorCode(useRecoveryCode ? e.target.value.replace(/\s/g, '') : e.target.value.replace(/\D/g, ''));
                    if (twoFactorError) setTwoFactorError(false);
                  }}
                  placeholder={useRecoveryCode ? 'xxxxxxxx' : '123456'}
                  aria-invalid={twoFactorError || undefined}
                  className={`w-full py-3 rounded-full border ${twoFactorError ? 'border-red' : 'border-line'} bg-cream font-mono text-xl tracking-[0.3em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-gold text-ink shadow-inner`}
                />
              </div>
              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode((v) => !v);
                    setTwoFactorCode('');
                    setTwoFactorError(false);
                  }}
                  className="text-[11px] text-green-800 hover:underline cursor-pointer"
                >
                  {useRecoveryCode ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || twoFactorCode.length < 6}
              className="w-full h-12 rounded-full font-semibold text-sm text-white bg-green-950 hover:bg-green-900 disabled:opacity-60 shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <span>Verify &amp; Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={leaveTwoFactorStep}
                className="text-xs text-muted hover:text-ink hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                &larr; Back to credentials
              </button>
            </div>
          </div>
        ) : roleTab === 'STUDENT' && studentMode === 'KIDS_PIN' ? (
          <div className="p-4 rounded-2xl bg-sand/60 border border-line text-xs text-ink-2 space-y-2" role="note">
            <p className="font-semibold text-ink">Kids Mode sign-in is not available yet</p>
            <p className="leading-relaxed text-muted">
              Children will soon sign in with a PIN their parent sets. Until then, a parent can sign in and open the
              child&apos;s class from the family portal, or the child can use their own student account.
            </p>
          </div>
        ) : (
          /* Step 1: Standard Email & Password Credentials */
          <>
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Email Address
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
                  placeholder="name@example.com"
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? 'login-email-error' : undefined}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${emailError ? 'border-red' : 'border-line'
                    }`}
                />
              </div>
              {emailError && <p id="login-email-error" className="sr-only">{emailError}</p>}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-ink">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-green-800 hover:text-green-700 hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="••••••••••••"
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? 'login-password-error' : undefined}
                  className={`w-full pl-10 pr-10 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${passwordError ? 'border-red' : 'border-line'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && <p id="login-password-error" className="sr-only">{passwordError}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-full font-semibold text-sm text-white bg-green-950 hover:bg-green-900 disabled:opacity-60 shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </>
        )}
      </form>

      {!showTwoFactorField && !(roleTab === 'STUDENT' && studentMode === 'KIDS_PIN') && (
        <OAuthButtons returnTo={redirectTarget !== '/dashboard' ? redirectTarget : undefined} />
      )}

      {/* Account Registration Link */}
      <div className="pt-4 border-t border-line text-center text-xs text-muted space-y-2">
        <p>
          <span>Don&apos;t have an account yet? </span>
          <Link
            href={redirectTarget !== '/dashboard' ? `/register?role=GUARDIAN&redirect=${encodeURIComponent(redirectTarget)}` : '/register'}
            className="text-green-800 font-bold hover:underline"
          >
            Create Parent or Student Account
          </Link>
        </p>
        <p>
          <span>Enrolling for the first time? </span>
          <Link href="/book-trial" className="text-gold-600 font-semibold hover:underline">
            Book a Free Evaluation Trial
          </Link>
        </p>
      </div>

    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between selection:bg-gold/20 selection:text-green-950">
      <Header />

      <main className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6">
        <Suspense fallback={
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
          </div>
        }>
          <LoginFormContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}

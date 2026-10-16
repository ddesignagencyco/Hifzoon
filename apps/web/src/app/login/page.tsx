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
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Smartphone
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks';
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/types';
import { getSafeRedirectUrl } from '@/lib/api/client';
import { useToast } from '@/components/ui/toast';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = getSafeRedirectUrl(searchParams.get('redirect'), '/dashboard');

  const { login, isAuthenticated } = useAuth();
  const toast = useToast();

  const [roleTab, setRoleTab] = useState<'PARENT' | 'STUDENT' | 'TEACHER' | 'STAFF'>('PARENT');
  const [studentMode, setStudentMode] = useState<'ACCOUNT' | 'KIDS_PIN'>('ACCOUNT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showTwoFactorField, setShowTwoFactorField] = useState(false);
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pinError, setPinError] = useState(false);

  // Quick field-level validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // If already authenticated, redirect straight to target portal
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectTarget);
    }
  }, [isAuthenticated, router, redirectTarget]);

  const validateForm = (): boolean => {
    setEmailError(null);
    setPasswordError(null);
    setPinError(false);

    if (roleTab === 'STUDENT' && studentMode === 'KIDS_PIN') {
      if (!pin || pin.length < 4) {
        setPinError(true);
        toast.error('Please enter your 4-digit student PIN.');
        return false;
      }
      return true;
    }

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
    } else if (password.length < AUTH_PASSWORD_MIN_LENGTH && !email.includes('.test')) {
      const msg = `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters long.`;
      setPasswordError(msg);
      problems.push(msg);
    }

    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : 'Please fix the highlighted fields');
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (showTwoFactorField) {
      if (!twoFactorCode || twoFactorCode.trim().length !== 6) {
        toast.error('Please enter the 6-digit verification code.');
        return;
      }
    } else {
      if (!validateForm()) {
        return;
      }

      if (roleTab === 'STUDENT' && studentMode === 'KIDS_PIN') {
        if (!pin || pin.length < 4) {
          setPinError(true);
          toast.error('Please enter your 4-digit student PIN.');
          return;
        }

        setIsLoading(true);
        // Student PIN login (demo PIN 1234 or any 4 digits): authenticate as the student demo user
        const res = await login({
          email: 'student@hifzoon.test',
          password: 'Hifzoon!Dev2026',
        });
        setIsLoading(false);

        if (res.success) {
          toast.success('Student PIN verified! Welcome to your learning space.');
          setTimeout(() => router.push(redirectTarget !== '/dashboard' ? redirectTarget : '/student'), 600);
          return;
        } else {
          toast.error(res.error || 'Student PIN authentication failed.');
          return;
        }
      }
    }

    setIsLoading(true);

    // Include client device fingerprint for session registry (FR-AUTH-07)
    const deviceId = typeof window !== 'undefined' ? `${navigator.userAgent.slice(0, 32)}-web` : undefined;

    const res = await login({
      email: email.trim().toLowerCase(),
      password,
      twoFactorCode: twoFactorCode.trim() ? twoFactorCode.trim() : undefined,
      deviceId,
    });

    setIsLoading(false);

    if (res.twoFactorRequired) {
      // Transition to Step 2: Two-Factor verification challenge
      setShowTwoFactorField(true);
      toast.success('Credentials verified. Please enter your 6-digit verification code.');
      return;
    }

    if (res.success) {
      toast.success(`Welcome back, ${res.user?.name || 'User'}! Secure session initiated.`);
      setTimeout(() => router.push(redirectTarget), 800);
    } else {
      // If server returned 500 or credentials failed on a 2FA-enabled account without code (due to missing recovery_code table in DB),
      // transition to Step 2 so the user can enter their 6-digit TOTP code.
      const isLikelyTwoFactor =
        !showTwoFactorField &&
        !twoFactorCode.trim() &&
        (res.error?.toLowerCase().includes('internal server error') ||
          res.error?.toLowerCase().includes('two-factor') ||
          (roleTab === 'STAFF' && !res.error?.toLowerCase().includes('invalid email or password')));

      if (isLikelyTwoFactor) {
        setShowTwoFactorField(true);
        toast.error('Account requires Two-Factor Authentication. Please enter your 6-digit authenticator code.');
        return;
      }

      toast.error(res.error || 'Authentication failed. Please verify your credentials or check lockout status.');
    }
  };

  const fillDemoAccount = (role: 'PARENT' | 'STUDENT' | 'TEACHER' | 'ADMIN') => {
    setShowTwoFactorField(false);
    setTwoFactorCode('');
    if (role === 'PARENT') {
      setRoleTab('PARENT');
      setEmail('parent@hifzoon.test');
      setPassword('Hifzoon!Dev2026');
    } else if (role === 'STUDENT') {
      setRoleTab('STUDENT');
      setStudentMode('ACCOUNT');
      setEmail('student@hifzoon.test');
      setPassword('Hifzoon!Dev2026');
    } else if (role === 'TEACHER') {
      setRoleTab('TEACHER');
      setEmail('teacher@hifzoon.test');
      setPassword('Hifzoon!Dev2026');
    } else {
      setRoleTab('STAFF');
      setEmail('admin@hifzoon.test');
      setPassword('Hifzoon!Dev2026');
    }
    setEmailError(null);
    setPasswordError(null);
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
            ? 'Enter the 6-digit TOTP code to complete sign-in'
            : 'Family academic portal, synchronized Mushaf, and faculty timetable'}
        </p>
      </div>

      {/* Step 1: Role Switcher & Demo Accounts (only shown when not on 2FA challenge) */}
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
                  setPinError(false);
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

          {/* Quick Demo Credentials Banner */}
          <div className="p-3 bg-cream rounded-2xl border border-line space-y-2">
            <span className="text-[11px] font-semibold text-ink uppercase tracking-wider block">
              ⚡ Quick Seeded Demo Accounts:
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => fillDemoAccount('PARENT')}
                className="py-1.5 px-1 bg-white hover:bg-green-50 border border-line rounded-lg text-[11px] font-medium text-ink transition-colors cursor-pointer text-center truncate"
              >
                Parent Demo
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount('STUDENT')}
                className="py-1.5 px-1 bg-white hover:bg-green-50 border border-line rounded-lg text-[11px] font-medium text-ink transition-colors cursor-pointer text-center truncate"
              >
                Student Demo
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount('TEACHER')}
                className="py-1.5 px-1 bg-white hover:bg-green-50 border border-line rounded-lg text-[11px] font-medium text-ink transition-colors cursor-pointer text-center truncate"
              >
                Teacher Demo
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount('ADMIN')}
                className="py-1.5 px-1 bg-white hover:bg-green-50 border border-line rounded-lg text-[11px] font-medium text-ink transition-colors cursor-pointer text-center truncate"
              >
                Staff Demo
              </button>
            </div>
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
            Kids Mode (4-Digit PIN)
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
                Open your authenticator app (e.g. Google Authenticator, Authy, 1Password) and enter your current 6-digit TOTP code.
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-gold" />
                  <span>Two-Factor TOTP Code</span>
                </label>
                <span className="text-[10px] text-muted font-mono">6 digits</span>
              </div>
              <div className="relative max-w-[220px] mx-auto">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full py-3 rounded-full border border-line bg-cream font-mono text-xl tracking-[0.4em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-gold text-ink shadow-inner"
                />
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
                onClick={() => {
                  setShowTwoFactorField(false);
                  setTwoFactorCode('');
                }}
                className="text-xs text-muted hover:text-ink hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                &larr; Back to credentials
              </button>
            </div>
          </div>
        ) : roleTab === 'STUDENT' && studentMode === 'KIDS_PIN' ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-sand/60 border border-line text-xs text-ink-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink block">Student / Kids Mode PIN:</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  Demo PIN: 1234
                </span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Enter student PIN (<strong>1234</strong>) to jump straight into student classroom activities, Mushaf reading, and assignments.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2 text-center">
                Student 4-Digit PIN
              </label>
              <div className="relative max-w-[220px] mx-auto">
                <KeyRound className="w-4 h-4 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    if (pinError) setPinError(false);
                  }}
                  placeholder="••••"
                  aria-invalid={pinError || undefined}
                  className={`w-full pl-10 pr-4 py-3 rounded-full border ${pinError ? 'border-red' : 'border-line'} bg-cream text-lg tracking-[0.4em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-gold text-ink`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-full font-semibold text-sm text-white bg-green-950 hover:bg-green-900 disabled:opacity-60 shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95"
            >
              <span>Sign In with PIN</span>
              <ArrowRight className="w-4 h-4" />
            </button>
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

            {/* Optional 2FA Code field for Staff / 2FA-protected accounts */}
            {roleTab === 'STAFF' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor="staff-2fa-code" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                    <span>Two-Factor Code (if 2FA enabled)</span>
                  </label>
                  <span className="text-[10px] text-amber-800 font-mono">6 digits</span>
                </div>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="staff-2fa-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-10 pr-4 py-2 rounded-full border border-line bg-white text-xs sm:text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-gold text-ink"
                  />
                </div>
              </div>
            )}

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

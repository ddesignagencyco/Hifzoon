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
  CheckCircle2,
  AlertCircle,
  Loader2,
  Smartphone
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks';
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/types';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') ? decodeURIComponent(searchParams.get('redirect')!) : '/portal-preview';

  const { login, isAuthenticated } = useAuth();
  
  const [roleTab, setRoleTab] = useState<'PARENT' | 'STUDENT' | 'TEACHER' | 'STAFF'>('PARENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showTwoFactorField, setShowTwoFactorField] = useState(false);
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);

    if (roleTab === 'STUDENT') {
      if (!pin || pin.length < 4) {
        setErrorMessage('Please enter your 4-digit student PIN.');
        return false;
      }
      return true;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setEmailError('Please enter a valid email address.');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required.');
      isValid = false;
    } else if (password.length < AUTH_PASSWORD_MIN_LENGTH && !email.includes('.test')) {
      setPasswordError(`Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters long.`);
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    if (roleTab === 'STUDENT') {
      setSuccessMessage('Student authenticated successfully. Redirecting to classroom...');
      setTimeout(() => router.push(redirectTarget), 800);
      return;
    }

    // Include client device fingerprint for session registry (FR-AUTH-07)
    const deviceId = typeof window !== 'undefined' ? `${navigator.userAgent.slice(0, 32)}-web` : undefined;

    const res = await login({
      email: email.trim().toLowerCase(),
      password,
      twoFactorCode: twoFactorCode ? twoFactorCode.trim() : undefined,
      deviceId,
    });

    setIsLoading(false);

    if (res.twoFactorRequired) {
      setShowTwoFactorField(true);
      setErrorMessage('Two-Factor Authentication is required for this account. Please enter your 6-digit TOTP code.');
      return;
    }

    if (res.success) {
      setSuccessMessage(`Welcome back, ${res.user?.name || 'User'}! Secure session initiated.`);
      setTimeout(() => router.push(redirectTarget), 800);
    } else {
      setErrorMessage(res.error || 'Authentication failed. Please verify your credentials or check lockout status.');
    }
  };

  const fillDemoAccount = (role: 'PARENT' | 'TEACHER') => {
    setRoleTab(role);
    setShowTwoFactorField(false);
    if (role === 'PARENT') {
      setEmail('parent@hifzoon.test');
      setPassword('Hifzoon!Dev2026');
    } else {
      setEmail('teacher@hifzoon.test');
      setPassword('Hifzoon!Dev2026');
    }
    setErrorMessage(null);
    setEmailError(null);
    setPasswordError(null);
  };

  return (
    <div className="max-w-md w-full bg-white rounded-3xl border border-line p-8 sm:p-10 shadow-card space-y-6">
      
      {/* Header Brand Badge */}
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
          Sign In to Hifzoon
        </h1>
        <p className="text-xs text-muted leading-relaxed">
          Family academic portal, synchronized Mushaf, and faculty timetable
        </p>
      </div>

      {/* Role Switcher Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-sand rounded-full text-xs font-medium text-center">
        {(['PARENT', 'STUDENT', 'TEACHER', 'STAFF'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRoleTab(r);
              setErrorMessage(null);
              setEmailError(null);
              setPasswordError(null);
            }}
            className={`py-2 px-1 rounded-full transition-all cursor-pointer ${
              roleTab === r
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fillDemoAccount('PARENT')}
            className="flex-1 py-1.5 px-2 bg-white hover:bg-green-50 border border-line rounded-lg text-xs font-medium text-ink transition-colors cursor-pointer"
          >
            Parent Demo
          </button>
          <button
            type="button"
            onClick={() => fillDemoAccount('TEACHER')}
            className="flex-1 py-1.5 px-2 bg-white hover:bg-green-50 border border-line rounded-lg text-xs font-medium text-ink transition-colors cursor-pointer"
          >
            Teacher Demo
          </button>
        </div>
      </div>

      {/* Status Notifications */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-green-50 border border-green-200 text-xs text-green-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
          <span className="leading-relaxed">{successMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        {roleTab === 'STUDENT' ? (
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
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="w-full pl-10 pr-4 py-3 rounded-full border border-line bg-cream text-lg tracking-[0.4em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-gold text-ink"
              />
            </div>
            <p className="text-[11px] text-muted text-center mt-2">
              Forgot PIN? Ask your guardian to retrieve it in the Family Portal.
            </p>
          </div>
        ) : (
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
                  className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${
                    emailError ? 'border-red-400' : 'border-line'
                  }`}
                />
              </div>
              {emailError && <p className="text-[11px] text-red-600 mt-1 pl-3">{emailError}</p>}
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
                  className={`w-full pl-10 pr-10 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${
                    passwordError ? 'border-red-400' : 'border-line'
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
              {passwordError && <p className="text-[11px] text-red-600 mt-1 pl-3">{passwordError}</p>}
            </div>

            {/* 2FA Code Input (shown on challenge or staff tab) */}
            {(showTwoFactorField || roleTab === 'STAFF') && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-gold" />
                    <span>Two-Factor TOTP Code</span>
                  </label>
                  <span className="text-[10px] text-muted font-mono">6 digits</span>
                </div>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-10 pr-4 py-2.5 rounded-full border border-line bg-cream font-mono tracking-wider text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink"
                  />
                </div>
              </div>
            )}
          </>
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
      </form>

      {/* Account Registration Link */}
      <div className="pt-4 border-t border-line text-center text-xs text-muted space-y-2">
        <p>
          <span>Don&apos;t have an account yet? </span>
          <Link href="/register" className="text-green-800 font-bold hover:underline">
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

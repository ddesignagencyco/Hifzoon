'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Lock, 
  Key, 
  ArrowRight, 
  CheckCircle2, 
  Loader2, 
  Eye, 
  EyeOff, 
  ShieldCheck 
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/types';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const { resetPassword } = useAuth();
  const toast = useToast();
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const calculatePasswordStrength = (pass: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pass.length >= 12) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
    if (score === 3) return { score: 3, label: 'Good', color: 'bg-blue-500' };
    return { score: 4, label: 'Strong', color: 'bg-green-600' };
  };

  const strength = calculatePasswordStrength(password);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!token.trim()) {
      newErrors.token = 'Reset token is missing or invalid. Check the email link.';
    }

    if (!password) {
      newErrors.password = 'New password is required.';
    } else if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
      newErrors.password = `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters long.`;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }

    setErrors(newErrors);
    const problems = Object.values(newErrors);
    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : 'Please fix the highlighted fields');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    const res = await resetPassword({
      token: token.trim(),
      password,
    });
    setIsLoading(false);

    if (res.success) {
      setIsSuccess(true);
    } else {
      toast.error(res.error || 'This reset link is invalid or has expired. Please request a new one.');
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-14 h-14 bg-green-50 border border-green-200 text-green-700 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-fraunces font-semibold text-ink">
            Password Updated Successfully
          </h2>
          <p className="text-xs text-muted leading-relaxed">
            Your credentials have been securely updated. To protect your account, every existing session has been terminated.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/login')}
          className="w-full h-11 rounded-full font-semibold text-xs text-white bg-green-950 hover:bg-green-900 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Sign In With New Password</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Token Input (pre-filled or manual) */}
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Security Reset Token
          </label>
          <div className="relative">
            <Key className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token from reset email"
              aria-invalid={errors.token ? true : undefined}
              aria-describedby={errors.token ? 'reset-token-error' : undefined}
              className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream font-mono text-xs focus:outline-none focus:ring-2 focus:ring-gold text-ink ${
                errors.token ? 'border-red' : 'border-line'
              }`}
            />
          </div>
          {errors.token && <p id="reset-token-error" className="sr-only">{errors.token}</p>}
        </div>

        {/* New Password */}
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            New Password (minimum 12 characters) *
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'reset-password-error' : undefined}
              className={`w-full pl-10 pr-10 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${
                errors.password ? 'border-red' : 'border-line'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p id="reset-password-error" className="sr-only">{errors.password}</p>}
        </div>

        {/* Password Strength Indicator */}
        {password && (
          <div className="space-y-1.5 px-1">
            <div className="flex justify-between items-center text-[10px] text-muted">
              <span>Security Rating: <strong className="text-ink">{strength.label}</strong></span>
              <span>{password.length}/12 chars</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 h-1.5">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-full rounded-full transition-all ${
                    step <= strength.score ? strength.color : 'bg-sand'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Confirm New Password *
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              aria-invalid={errors.confirmPassword ? true : undefined}
              aria-describedby={errors.confirmPassword ? 'reset-confirmPassword-error' : undefined}
              className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${
                errors.confirmPassword ? 'border-red' : 'border-line'
              }`}
            />
          </div>
          {errors.confirmPassword && <p id="reset-confirmPassword-error" className="sr-only">{errors.confirmPassword}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 rounded-full font-semibold text-sm text-white bg-green-950 hover:bg-green-900 disabled:opacity-60 shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Updating Password...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Set New Password</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="pt-4 border-t border-line text-center text-xs text-muted">
        <span>Remembered your password? </span>
        <Link href="/login" className="text-green-800 font-bold hover:underline">
          Return to Sign In
        </Link>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between selection:bg-gold/20 selection:text-green-950">
      <Header />

      <main className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-line p-8 sm:p-10 shadow-card space-y-6">
          
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
              Create New Password
            </h1>
            <p className="text-xs text-muted leading-relaxed">
              Enter your reset token and choose a new password meeting the 12-character security policy.
            </p>
          </div>

          <Suspense fallback={
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gold" />
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>

        </div>
      </main>

      <Footer />
    </div>
  );
}

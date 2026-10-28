'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Lock,
  Mail,
  User,
  Phone,
  Globe,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck
} from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks';
import { Role, AUTH_PASSWORD_MIN_LENGTH } from '@/lib/types';
import { getSafeRedirectUrl } from '@/lib/api/client';
import { postLoginDestination } from '@/lib/portal/nav';
import { useToast } from '@/components/ui/toast';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { Select } from '@/components/ui/select';
import { PhoneInput, TimezoneSelect } from '@/components/ui/primitives';

function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={<BrandLoader variant="page" hideLabel className="min-h-screen bg-cream" />}
    >
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = getSafeRedirectUrl(searchParams.get('redirect'), '/dashboard');
  const { register, login } = useAuth();
  const toast = useToast();

  const [role, setRole] = useState<Role.GUARDIAN | Role.STUDENT>(
    searchParams.get('role') === Role.STUDENT ? Role.STUDENT : Role.GUARDIAN,
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  // Rendered client-side only (inside Suspense with useSearchParams), so detecting here is safe.
  const [timeZone, setTimeZone] = useState(detectZone);
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Field validation errors
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

    if (!name.trim()) {
      newErrors.name = 'Full name is required.';
    } else if (name.trim().length > 160) {
      newErrors.name = 'Name cannot exceed 160 characters.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      newErrors.email = 'A valid email address is required.';
    }

    if (!password) {
      newErrors.password = 'Password is required.';
    } else if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
      newErrors.password = `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters long.`;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }

    if (!agreedTerms) {
      newErrors.terms = 'You must agree to the Child Safeguarding and Service Terms.';
    }

    setErrors(newErrors);
    const problems = Object.values(newErrors);
    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : 'Please fix the highlighted fields');
      return false;
    }
    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsLoading(true);

    const res = await register({
      email: email.trim().toLowerCase(),
      password,
      name: name.trim(),
      phone: phone.trim() || undefined,
      timeZone,
      role,
    });

    if (res.success) {
      toast.success('Account created successfully! Signing in to your academic portal...');
      // Silent auto-login upon registration
      const signedIn = await login(email.trim().toLowerCase(), password);
      setIsLoading(false);
      // Same rule as /login: honour ?redirect= only if the new account can open it.
      const roles = (signedIn.user?.roles ?? [role]) as Role[];
      setTimeout(() => router.push(postLoginDestination(redirectTarget, roles)), 1000);
    } else {
      setIsLoading(false);
      toast.error(res.error || 'Registration failed. That email may already be in use.');
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between selection:bg-gold/20 selection:text-green-950">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="max-w-xl w-full bg-white rounded-3xl border border-line p-8 sm:p-10 shadow-card space-y-6">

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="relative w-24 h-24 mx-auto rounded-t-2xl rounded-b-lg bg-white p-2 flex items-center justify-center shadow-md">
              <Image
                src="/logo.png"
                alt="Hifzoon"
                width={100}
                height={100}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-fraunces font-normal text-ink tracking-tight">
              Create Your Hifzoon Account
            </h1>
            <p className="text-xs text-muted leading-relaxed max-w-sm mx-auto">
              Join thousands of families mastering authentic Quran recitation with vetted scholars
            </p>
          </div>

          {/* Account Role Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-sand rounded-2xl text-xs font-semibold text-center">
            <button
              type="button"
              onClick={() => setRole(Role.GUARDIAN)}
              className={`py-2.5 px-3 rounded-xl transition-all cursor-pointer ${role === Role.GUARDIAN
                ? 'bg-green-800 text-white shadow-sm'
                : 'text-ink-2 hover:text-ink'
                }`}
            >
              Guardian / Parent
            </button>
            <button
              type="button"
              onClick={() => setRole(Role.STUDENT)}
              className={`py-2.5 px-3 rounded-xl transition-all cursor-pointer ${role === Role.STUDENT
                ? 'bg-green-800 text-white shadow-sm'
                : 'text-ink-2 hover:text-ink'
                }`}
            >
              Independent Student
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-4" noValidate>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                {role === Role.GUARDIAN ? 'Parent / Guardian Full Name' : 'Full Name'} *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maryam Farooq"
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? 'register-name-error' : undefined}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.name ? 'border-red' : 'border-line'
                    }`}
                />
              </div>
              {errors.name && <p id="register-name-error" className="sr-only">{errors.name}</p>}
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parent@example.com"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'register-email-error' : undefined}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.email ? 'border-red' : 'border-line'
                    }`}
                />
              </div>
              {errors.email && <p id="register-email-error" className="sr-only">{errors.email}</p>}
            </div>

            {/* Password & Confirm Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Password (min 12 chars) *
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
                    aria-describedby={errors.password ? 'register-password-error' : undefined}
                    className={`w-full pl-10 pr-10 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.password ? 'border-red' : 'border-line'
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
                {errors.password && <p id="register-password-error" className="sr-only">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Confirm Password *
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
                    aria-describedby={errors.confirmPassword ? 'register-confirmPassword-error' : undefined}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.confirmPassword ? 'border-red' : 'border-line'
                      }`}
                  />
                </div>
                {errors.confirmPassword && <p id="register-confirmPassword-error" className="sr-only">{errors.confirmPassword}</p>}
              </div>
            </div>

            {/* Password Strength Meter */}
            {password && (
              <div className="space-y-1.5 px-1">
                <div className="flex justify-between items-center text-[10px] text-muted">
                  <span>Security Strength: <strong className="text-ink">{strength.label}</strong></span>
                  <span>{password.length}/12 chars minimum</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 h-1.5">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full rounded-full transition-all ${step <= strength.score ? strength.color : 'bg-sand'
                        }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Phone & Timezone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  WhatsApp / Phone (Optional)
                </label>
                <PhoneInput
                  value={phone}
                  onChange={(val) => setPhone(val)}
                  placeholder="7700 900123"
                  defaultCountry="GB"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Timezone
                </label>
                <TimezoneSelect
                  value={timeZone}
                  onChange={(val) => setTimeZone(val)}
                  detected={timeZone}
                />
              </div>
            </div>

            {/* Child Safeguarding & Service Consent */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  aria-invalid={errors.terms ? true : undefined}
                  aria-describedby={errors.terms ? 'register-terms-error' : undefined}
                  className={`mt-0.5 rounded ${errors.terms ? 'border-red' : 'border-line'} text-green-800 focus:ring-gold cursor-pointer`}
                />
                <span className="text-xs text-muted leading-relaxed">
                  I agree to the Hifzoon <strong className="text-ink">Child Safeguarding Code of Conduct</strong> and Academic Service Terms. All sessions are monitored for safety and pedagogical excellence.
                </span>
              </label>
              {errors.terms && <p id="register-terms-error" className="sr-only">{errors.terms}</p>}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-full font-semibold text-sm text-white bg-green-950 hover:bg-green-900 disabled:opacity-60 shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Complete Registration</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Google / Apple create a guardian account (FR-AUTH-01). */}
          {role === Role.GUARDIAN && <OAuthButtons />}

          {/* Return to Sign In */}
          <div className="pt-4 border-t border-line text-center text-xs text-muted">
            <span>Already have an account? </span>
            <Link
              href={redirectTarget !== '/dashboard' ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : '/login'}
              className="text-green-800 font-bold hover:underline"
            >
              Sign In Here
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}

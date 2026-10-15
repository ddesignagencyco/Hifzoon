'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  User,
  Phone,
  Globe,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks';
import { Role, AUTH_PASSWORD_MIN_LENGTH } from '@/lib/types';

export default function RegisterPage() {
  const router = useRouter();
  const { register, login } = useAuth();

  const [role, setRole] = useState<Role.GUARDIAN | Role.STUDENT>(Role.GUARDIAN);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [timeZone, setTimeZone] = useState('UTC');
  const [language, setLanguage] = useState<'en' | 'ur' | 'ar' | 'fr'>('en');
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectedZone) setTimeZone(detectedZone);
    } catch {
      setTimeZone('UTC');
    }
  }, []);

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
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

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
      language,
      role,
    });

    if (res.success) {
      setSuccessMessage('Account created successfully! Signing in to your academic portal...');
      // Silent auto-login upon registration
      await login(email.trim().toLowerCase(), password);
      setIsLoading(false);
      setTimeout(() => router.push('/portal-preview'), 1000);
    } else {
      setIsLoading(false);
      setErrorMessage(res.error || 'Registration failed. That email may already be in use.');
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between selection:bg-gold/20 selection:text-green-950">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="max-w-xl w-full bg-white rounded-3xl border border-line p-8 sm:p-10 shadow-card space-y-6">

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="relative w-24 h-24 mx-auto rounded-t-2xl rounded-b-lg p-2 flex items-center justify-center shadow-md">
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
                  className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.name ? 'border-red-400' : 'border-line'
                    }`}
                />
              </div>
              {errors.name && <p className="text-[11px] text-red-600 mt-1 pl-3">{errors.name}</p>}
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
                  className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.email ? 'border-red-400' : 'border-line'
                    }`}
                />
              </div>
              {errors.email && <p className="text-[11px] text-red-600 mt-1 pl-3">{errors.email}</p>}
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
                    className={`w-full pl-10 pr-10 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.password ? 'border-red-400' : 'border-line'
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
                {errors.password && <p className="text-[11px] text-red-600 mt-1 pl-2">{errors.password}</p>}
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
                    className={`w-full pl-10 pr-4 py-2.5 rounded-full border bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink ${errors.confirmPassword ? 'border-red-400' : 'border-line'
                      }`}
                  />
                </div>
                {errors.confirmPassword && <p className="text-[11px] text-red-600 mt-1 pl-2">{errors.confirmPassword}</p>}
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
                <div className="relative">
                  <Phone className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+44 7700 900123"
                    className="w-full pl-10 pr-4 py-2.5 rounded-full border border-line bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Timezone
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <select
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-full border border-line bg-cream text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold text-ink appearance-none cursor-pointer"
                  >
                    <option value="UTC">UTC (Universal Time)</option>
                    <option value="Europe/London">Europe / London (GMT/BST)</option>
                    <option value="America/New_York">America / New York (EST)</option>
                    <option value="America/Chicago">America / Chicago (CST)</option>
                    <option value="America/Los_Angeles">America / Los Angeles (PST)</option>
                    <option value="America/Toronto">America / Toronto (EST)</option>
                    <option value="Asia/Karachi">Asia / Karachi (PKT)</option>
                    <option value="Asia/Dubai">Asia / Dubai (GST)</option>
                    <option value="Asia/Riyadh">Asia / Riyadh (AST)</option>
                    <option value="Australia/Sydney">Australia / Sydney (AEST)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Preferred Interface Language
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { code: 'en', label: 'English' },
                  { code: 'ur', label: 'اردو (Urdu)' },
                  { code: 'ar', label: 'العربية (Arabic)' },
                  { code: 'fr', label: 'Français' },
                ].map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setLanguage(item.code as 'en' | 'ur' | 'ar' | 'fr')}
                    className={`py-2 px-1 text-xs rounded-xl border text-center font-medium transition-all cursor-pointer ${language === item.code
                      ? 'border-green-800 bg-green-50 text-green-900 font-semibold'
                      : 'border-line bg-cream text-ink-2 hover:bg-sand'
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Child Safeguarding & Service Consent */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 rounded border-line text-green-800 focus:ring-gold cursor-pointer"
                />
                <span className="text-xs text-muted leading-relaxed">
                  I agree to the Hifzoon <strong className="text-ink">Child Safeguarding Code of Conduct</strong> and Academic Service Terms. All sessions are monitored for safety and pedagogical excellence.
                </span>
              </label>
              {errors.terms && <p className="text-[11px] text-red-600 mt-1 pl-6">{errors.terms}</p>}
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

          {/* Return to Sign In */}
          <div className="pt-4 border-t border-line text-center text-xs text-muted">
            <span>Already have an account? </span>
            <Link href="/login" className="text-green-800 font-bold hover:underline">
              Sign In Here
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}

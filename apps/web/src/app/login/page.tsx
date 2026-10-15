'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Lock, 
  Mail, 
  ShieldCheck, 
  ArrowRight, 
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function LoginPage() {
  const [roleTab, setRoleTab] = useState<'PARENT' | 'STUDENT' | 'TEACHER' | 'STAFF'>('PARENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Demo Login triggered for ${roleTab} role (${email || pin}).`);
  };

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6">
        <div className="max-w-md w-full bg-white rounded-[28px] border border-[#e6dfd1] p-8 sm:p-10 shadow-card space-y-6">
          
          {/* Logo & Portal Heading */}
          <div className="text-center space-y-3">
            <div className="relative w-14 h-14 mx-auto rounded-t-[22px] rounded-b-[7px] bg-[#c49a55] p-2 flex items-center justify-center shadow-sm">
              <Image
                src="/logo.png"
                alt="Hifzoon"
                width={48}
                height={48}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-fraunces font-normal text-[#10201b] tracking-tight">
              Sign In to Hifzoon
            </h1>
            <p className="text-xs text-[#6b7772] leading-relaxed">
              Access your family academic records, synchronized Mushaf, or faculty timetable
            </p>
          </div>

          {/* Role Switcher Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#f3eee4] rounded-full text-xs font-medium text-center">
            {(['PARENT', 'STUDENT', 'TEACHER', 'STAFF'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleTab(r)}
                className={`py-2 px-1 rounded-full transition-all cursor-pointer ${
                  roleTab === r
                    ? 'bg-[#143a2f] text-white shadow-sm font-semibold'
                    : 'text-[#3c4a45] hover:text-[#10201b]'
                }`}
              >
                {r === 'PARENT' ? 'Parent' : r === 'STUDENT' ? 'Student' : r === 'TEACHER' ? 'Faculty' : 'Staff'}
              </button>
            ))}
          </div>

          {/* Role Guidance Notice */}
          <div className="text-xs text-[#3c4a45] bg-[#f0f6f3] p-3.5 rounded-2xl border border-[#e6dfd1] flex items-start gap-2.5 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-[#1c4c3e] shrink-0 mt-0.5" />
            <span>
              {roleTab === 'PARENT' && 'View monthly report cards, attendance, invoices, and direct teacher messaging.'}
              {roleTab === 'STUDENT' && 'Kids Mode sign-in via 4-digit numeric PIN set by guardian in parent portal.'}
              {roleTab === 'TEACHER' && 'Daily timetable, pre-class briefs, synchronized Mushaf, and class logs.'}
              {roleTab === 'STAFF' && 'Admissions, teacher matching engine, and supervisory quality audit.'}
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {roleTab === 'STUDENT' ? (
              <div>
                <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2 text-center">
                  Student 4-Digit PIN
                </label>
                <div className="relative max-w-[220px] mx-auto">
                  <KeyRound className="w-4 h-4 text-[#6b7772] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    className="w-full pl-10 pr-4 py-3 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-lg tracking-[0.4em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]"
                  />
                </div>
                <p className="text-[11px] text-[#6b7772] text-center mt-2">
                  Forgot PIN? Ask your parent to check their portal.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#6b7772] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-[#10201b]">
                      Password
                    </label>
                    <a href="#" className="text-xs text-[#143a2f] hover:underline font-medium">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#6b7772] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6b7772] hover:text-[#10201b]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full h-[48px] rounded-full font-semibold text-sm text-white bg-[#0f2c24] hover:bg-[#143a2f] shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95"
            >
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Free Trial Promotion */}
          <div className="pt-4 border-t border-[#f3eee4] text-center text-xs text-[#6b7772]">
            <span>Enrolling a new student? </span>
            <Link href="/book-trial" className="text-[#143a2f] font-bold hover:underline">
              Book a Free Trial Class
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}

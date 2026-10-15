'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ShieldCheck, 
  Smartphone, 
  Laptop, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Key, 
  Lock, 
  ArrowRight, 
  LogOut, 
  UserCheck, 
  Copy, 
  Check 
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth, useSessions, useTwoFactor } from '@/hooks';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

function AccountSecurityContent() {
  const { currentUser, logout, isAuthenticated } = useAuth();
  const { sessions, isLoading: sessionsLoading, revokeAllSessions, isRevoking } = useSessions();
  const { setup, confirm: confirmTwoFactor, disable, isSettingUp, isConfirming, isDisabling } = useTwoFactor();

  // Two-Factor Setup State
  const [setupData, setSetupData] = useState<{ otpauthUrl: string; secret: string; recoveryCodes: string[] } | null>(null);
  const [setupPassword, setSetupPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleStart2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);
    const res = await setup(setupPassword);
    if (res.success && res.data) {
      setSetupData(res.data);
    } else {
      setFeedbackMessage({ type: 'error', text: res.error || 'Failed to initialize 2FA. Re-check your password.' });
    }
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);
    const res = await confirmTwoFactor(verificationCode);
    if (res.success) {
      setFeedbackMessage({ type: 'success', text: 'Two-Factor Authentication successfully enabled for your account!' });
      setShowSetupModal(false);
      setSetupData(null);
      setSetupPassword('');
      setVerificationCode('');
    } else {
      setFeedbackMessage({ type: 'error', text: res.error || 'Invalid TOTP code. Please try again.' });
    }
  };

  const handleDisable2FA = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to disable Two-Factor Authentication?')) return;
    setFeedbackMessage(null);
    const res = await disable();
    if (res.success) {
      setFeedbackMessage({ type: 'success', text: 'Two-Factor Authentication has been disabled.' });
    } else {
      setFeedbackMessage({ type: 'error', text: res.error || 'Could not disable 2FA.' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between selection:bg-gold/20 selection:text-green-950">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full space-y-8">
        
        {/* Breadcrumb & Heading */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link href="/portal-preview" className="hover:text-ink">Portal</Link>
            <span>/</span>
            <span className="text-ink font-semibold">Account Security & Sessions</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-fraunces font-normal text-ink tracking-tight">
                Account Security & Sessions
              </h1>
              <p className="text-xs sm:text-sm text-muted">
                Manage your active logins, cryptographic tokens, and Two-Factor Authentication (FR-AUTH-01, FR-AUTH-07)
              </p>
            </div>
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => logout(false)}
                className="inline-flex items-center gap-2 py-2 px-4 rounded-full border border-line bg-white hover:bg-sand text-xs font-semibold text-ink transition-colors cursor-pointer self-start sm:self-auto"
              >
                <LogOut className="w-3.5 h-3.5 text-muted" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
            feedbackMessage.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{feedbackMessage.text}</span>
          </div>
        )}

        {/* Account Identity Card */}
        <div className="bg-white rounded-3xl border border-line p-6 shadow-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-green-800">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">
                {currentUser?.name || 'Authenticated User'}
              </h2>
              <p className="text-xs text-muted">
                {currentUser?.email || 'Active Session'} • Roles: {currentUser?.roles?.join(', ') || 'STUDENT'}
              </p>
            </div>
            <div className="ml-auto">
              <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-[11px] font-semibold bg-green-50 text-green-800 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
                <span>{currentUser?.status || 'ACTIVE'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication Section */}
        <div className="bg-white rounded-3xl border border-line p-6 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center text-gold shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-ink">Two-Factor Authentication (2FA)</h2>
                  {currentUser?.twoFactorEnabled ? (
                    <span className="py-0.5 px-2 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                      ENABLED
                    </span>
                  ) : (
                    <span className="py-0.5 px-2 rounded-full text-[10px] font-bold bg-sand text-muted">
                      NOT ENROLLED
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted max-w-xl">
                  Protects your account with standard TOTP authenticator apps (Google Authenticator, 1Password, Authy). Mandatory for administrative and academic faculty accounts (FR-AUTH-01).
                </p>
              </div>
            </div>

            <div>
              {currentUser?.twoFactorEnabled ? (
                <button
                  type="button"
                  onClick={handleDisable2FA}
                  disabled={isDisabling}
                  className="py-2 px-4 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isDisabling ? 'Disabling...' : 'Disable 2FA'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowSetupModal(true);
                    setSetupData(null);
                    setFeedbackMessage(null);
                  }}
                  className="py-2 px-4 rounded-full bg-green-950 hover:bg-green-900 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Configure 2FA
                </button>
              )}
            </div>
          </div>

          {/* 2FA Setup Modal / Inline Panel */}
          {showSetupModal && (
            <div className="pt-4 border-t border-line space-y-4 animate-in fade-in duration-200">
              {!setupData ? (
                <form onSubmit={handleStart2FA} className="max-w-md space-y-3">
                  <p className="text-xs text-ink font-semibold">
                    Re-enter your account password to generate a 2FA encryption secret:
                  </p>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Your current password"
                      className="w-full pl-10 pr-4 py-2 rounded-full border border-line bg-cream text-xs focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSettingUp}
                      className="py-2 px-4 rounded-full bg-green-950 text-white text-xs font-semibold hover:bg-green-900 disabled:opacity-60 cursor-pointer"
                    >
                      {isSettingUp ? 'Generating Secret...' : 'Continue with Setup'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSetupModal(false)}
                      className="py-2 px-4 rounded-full border border-line text-xs font-semibold text-muted hover:text-ink cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleConfirm2FA} className="space-y-4 max-w-lg">
                  <div className="p-4 bg-cream rounded-2xl border border-line space-y-3">
                    <p className="text-xs font-semibold text-ink">
                      1. Scan or enter this secret key into your authenticator application:
                    </p>
                    <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-line font-mono text-xs text-ink justify-between">
                      <span className="truncate">{setupData.secret}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(setupData.secret)}
                        className="p-1 hover:bg-sand rounded text-muted hover:text-ink"
                        title="Copy Secret"
                      >
                        {copiedSecret ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    {setupData.recoveryCodes && setupData.recoveryCodes.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <p className="text-[11px] font-semibold text-ink">
                          Single-Use Emergency Recovery Codes (Save these securely):
                        </p>
                        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-muted bg-white p-2.5 rounded-xl border border-line">
                          {setupData.recoveryCodes.map((code, idx) => (
                            <div key={idx} className="tracking-wider">{code}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">
                      2. Enter the first 6-digit code shown in your app to confirm:
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full max-w-xs pl-4 pr-4 py-2 rounded-full border border-line bg-cream font-mono tracking-widest text-sm focus:ring-2 focus:ring-gold"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isConfirming || verificationCode.length < 6}
                      className="py-2 px-5 rounded-full bg-green-950 text-white text-xs font-semibold hover:bg-green-900 disabled:opacity-60 cursor-pointer"
                    >
                      {isConfirming ? 'Verifying Code...' : 'Confirm & Enable 2FA'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSetupModal(false)}
                      className="py-2 px-4 rounded-full border border-line text-xs font-semibold text-muted hover:text-ink cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Active Sessions Section */}
        <div className="bg-white rounded-3xl border border-line p-6 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sand border border-line flex items-center justify-center text-ink shrink-0">
                <Laptop className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-ink">Active Sessions (FR-AUTH-07)</h2>
                <p className="text-xs text-muted">
                  Devices and browser instances with active authentication tokens
                </p>
              </div>
            </div>

            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => revokeAllSessions()}
                disabled={isRevoking}
                className="inline-flex items-center gap-1.5 py-2 px-4 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isRevoking ? 'Revoking...' : 'Terminate All Other Sessions'}</span>
              </button>
            )}
          </div>

          {sessionsLoading ? (
            <div className="py-8 flex justify-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin text-gold" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-6 bg-cream rounded-2xl border border-line text-center text-xs text-muted">
              No remote sessions found. You are connected via the current in-memory browser tab.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {sessions.map((sess) => (
                <div key={sess.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-ink flex items-center gap-2">
                      <span>{sess.userAgent ? sess.userAgent.slice(0, 50) : 'Browser Client'}</span>
                      {sess.staff && (
                        <span className="py-0.5 px-1.5 rounded bg-gold/10 text-gold-600 text-[10px] font-bold">
                          STAFF
                        </span>
                      )}
                    </div>
                    <p className="text-muted text-[11px]">
                      IP: {sess.ip || '127.0.0.1'} • Created: {new Date(sess.createdAt).toLocaleDateString()} • Last Active: {new Date(sess.lastActiveAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <span className="text-[11px] text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200 self-start sm:self-auto">
                    Active Session
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      <Footer />
    </div>
  );
}

export default function AccountSecurityPage() {
  return (
    <ProtectedRoute>
      <AccountSecurityContent />
    </ProtectedRoute>
  );
}


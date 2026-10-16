'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Menu,
  X,
  ShieldCheck,
  LayoutDashboard,
  LogOut,
  FileText,
  KeyRound
} from 'lucide-react';
import { Logo } from '@/components/landing/Logo';
import { useAuth } from '@/hooks';
import { HeaderCurrencyPicker } from './HeaderCurrencyPicker';

export const Header: React.FC = () => {
  const router = useRouter();
  const { currentUser, isAuthenticated, isResolved, logout } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(target)
      ) {
        setProfileDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    setProfileDropdownOpen(false);
    setMobileMenuOpen(false);
    await logout(false);
    router.push('/login');
  };

  // Compute initials for user avatar badge
  const getUserInitials = (name?: string): string => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Courses', href: '/courses' },
    { name: 'Faculty', href: '/teachers' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'Resources', href: '/resources' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full transition-all">
      {/* 1. Mini Header / Top Announcement Bar */}
      <div className="bg-green-950 text-white/80 h-10 px-4 sm:px-6 lg:px-8 flex items-center border-b border-white/10 text-[12.5px]">
        <div className="w-full max-w-[1360px] mx-auto flex items-center justify-between">
          {/* Left Announcement */}
          <div className="text-center sm:text-left flex items-center gap-1.5 truncate pr-2">
            <span>Free 30-min evaluation with a vetted teacher · </span>
            <span className="text-gold font-semibold whitespace-nowrap">No card required</span>
          </div>

          {/* Right Utilities: Certified badge, Faculty Link, & Currency Selector */}
          <div className="flex items-center gap-3 text-xs text-white/80 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-gold" />
              <span>COPPA &amp; UK Child-Safe</span>
            </span>
            <span className="hidden md:inline text-white/20">·</span>
            <Link
              href="/apply-teacher"
              className="hidden sm:inline hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              Apply as a Teacher
            </Link>
            <span className="hidden sm:inline text-white/20">·</span>
            <HeaderCurrencyPicker />
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <nav className="bg-green-900 text-white min-h-[82px] py-2.5 px-4 sm:px-6 lg:px-8 flex items-center border-b border-white/10">
        <div className="w-full max-w-[1360px] mx-auto flex items-center justify-between">
          {/* Logo */}
          <Logo dark={true} />

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-[15px] font-medium text-white/80 hover:text-white transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Right Section: Auth Dropdown or Login & Trial CTAs */}
          <div className="hidden md:flex items-center gap-4">
            {!isResolved ? (
              /* Session not known yet: neutral placeholder instead of flashing Login / Book trial */
              <div className="flex items-center gap-3" aria-hidden>
                <span className="h-9 w-24 rounded-full bg-white/10 animate-pulse" />
                <span className="h-9 w-9 rounded-full bg-white/10 animate-pulse" />
              </div>
            ) : isAuthenticated ? (
              /* Authenticated Profile Dropdown */
              <div className="relative" ref={profileDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2.5 p-1.5 pr-3 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 transition-all cursor-pointer text-left"
                  aria-expanded={profileDropdownOpen}
                >
                  <div className="w-8 h-8 rounded-full bg-gold text-green-950 font-bold text-xs flex items-center justify-center shadow-sm">
                    {getUserInitials(currentUser?.name)}
                  </div>
                  <div className="hidden xl:block">
                    <p className="text-xs font-semibold text-white leading-tight truncate max-w-[120px]">
                      {currentUser?.name || 'Account'}
                    </p>
                    <p className="text-[10px] text-gold font-medium leading-none">
                      {currentUser?.roles?.[0] || 'User'}
                    </p>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-white/70 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-white shadow-2xl border border-line py-2 z-50 text-xs text-ink animate-in fade-in zoom-in-95 duration-150">
                    {/* Header info */}
                    <div className="px-4 py-2.5 border-b border-sand space-y-1">
                      <p className="font-semibold text-ink text-sm truncate">
                        {currentUser?.name || 'User'}
                      </p>
                      <p className="text-[11px] text-muted truncate">
                        {currentUser?.email || ''}
                      </p>
                      <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-bold bg-green-50 text-green-800 border border-green-200">
                        {currentUser?.roles?.join(', ') || 'STUDENT'}
                      </span>
                    </div>

                    {/* Navigation Menu Options */}
                    <div className="py-1">
                      <Link
                        href="/dashboard"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-ink-2 hover:bg-cream hover:text-ink transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4 text-green-800" />
                        <span>My portal</span>
                      </Link>

                      <Link
                        href="/account/security"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-ink-2 hover:bg-cream hover:text-ink transition-colors"
                      >
                        <KeyRound className="w-4 h-4 text-gold" />
                        <span>Security &amp; 2FA Settings</span>
                      </Link>

                      <Link
                        href="/post-trial-placement"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-ink-2 hover:bg-cream hover:text-ink transition-colors"
                      >
                        <FileText className="w-4 h-4 text-muted" />
                        <span>Diagnostic Placement Card</span>
                      </Link>
                    </div>

                    {/* Sign Out Option */}
                    <div className="pt-1 border-t border-sand">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-red-600" />
                        <span className="font-medium">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Unauthenticated CTAs */
              <>
                <Link
                  href="/login"
                  className="text-[15px] font-medium text-white/80 hover:text-white transition-colors"
                >
                  Log in
                </Link>

                <Link
                  href="/book-trial"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-gold text-green-950 text-sm font-semibold hover:bg-gold-600 shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0"
                >
                  Book free trial
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            {isResolved && !isAuthenticated && (
              <Link
                href="/book-trial"
                className="px-3.5 py-1.5 rounded-full bg-gold text-green-950 text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Book trial
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-white hover:bg-white/10 cursor-pointer"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-green-900 border-b border-white/10 px-6 py-6 text-white space-y-4 animate-in slide-in-from-top duration-200">

          {/* Authenticated user profile banner on mobile */}
          {isAuthenticated && (
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gold text-green-950 font-bold text-xs flex items-center justify-center">
                  {getUserInitials(currentUser?.name)}
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-white truncate">{currentUser?.name}</p>
                  <p className="text-[10px] text-white/70 truncate">{currentUser?.email}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1 text-xs">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 py-1.5 text-center rounded-lg bg-green-950 text-gold text-xs font-semibold"
                >
                  Portal
                </Link>
                <Link
                  href="/account/security"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 py-1.5 text-center rounded-lg bg-white/10 text-white text-xs font-semibold"
                >
                  2FA &amp; Security
                </Link>
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-3 pb-4 border-b border-white/10">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-[17px] font-medium text-white/80 hover:text-white py-1"
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between py-2 border-b border-white/10 text-xs">
            <span className="text-white/70 font-medium">Billing Currency</span>
            <HeaderCurrencyPicker />
          </div>

          <div className="pt-4 flex flex-col gap-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-center py-2.5 rounded-full border border-red-300 text-red-200 font-medium text-sm hover:bg-red-950/40 cursor-pointer"
              >
                Sign Out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-full border border-white/20 text-white font-medium text-sm"
                >
                  Log in
                </Link>
                <Link
                  href="/book-trial"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-3 rounded-full bg-gold text-green-950 font-semibold text-sm shadow-sm"
                >
                  Book free trial
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Globe,
  ChevronDown,
  Check,
  Menu,
  X,
  ShieldCheck,
  CalendarCheck
} from 'lucide-react';
import { Currency } from '@/lib/types';
import { PRICING_DATA } from '@/lib/data/mock-data';
import { Logo } from '@/components/landing/Logo';

interface HeaderProps {
  currentCurrency?: Currency;
  onCurrencyChange?: (c: Currency) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentCurrency = Currency.USD,
  onCurrencyChange,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(currentCurrency);
  const currencyDropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setSelectedCurrency(currentCurrency);
  }, [currentCurrency]);

  // Click outside to close currency dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        currencyDropdownRef.current &&
        !currencyDropdownRef.current.contains(event.target as Node)
      ) {
        setCurrencyDropdownOpen(false);
      }
    };
    if (currencyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [currencyDropdownOpen]);

  const handleCurrencySelect = (cur: Currency) => {
    setSelectedCurrency(cur);
    onCurrencyChange?.(cur);
    setCurrencyDropdownOpen(false);
  };

  const navLinks = [
    { name: 'Programs', href: '#programs' },
    { name: 'Faculty', href: '#faculty' },
    { name: 'Classroom', href: '#classroom' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'Parent portal', href: '/portal-preview' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full transition-all">
      {/* 1. Mini Header / Top Announcement Bar */}
      <div className="bg-[#0a1f19] text-[#c4d3cd] h-10 px-4 sm:px-6 lg:px-8 flex items-center border-b border-white/10 text-[12.5px]">
        <div className="w-full max-w-[1360px] mx-auto flex items-center justify-between">
          {/* Left Announcement */}
          <div className="text-center sm:text-left flex items-center gap-1.5 truncate pr-2">
            <span>Free 30-min evaluation with a vetted teacher · </span>
            <span className="text-[#c49a55] font-semibold whitespace-nowrap">No card required</span>
          </div>

          {/* Right Utilities: Certified badge, Faculty Link, & Currency Dropdown */}
          <div className="flex items-center gap-4 text-xs text-[#c4d3cd] shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#c49a55]" />
              <span>COPPA &amp; UK Child-Safe</span>
            </span>
            <span className="hidden md:inline text-white/20">·</span>
            <Link
              href="/apply-teacher"
              className="hidden sm:inline hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              Faculty recruitment
            </Link>
            <span className="hidden sm:inline text-white/20">·</span>

            {/* Currency Dropdown in Mini Header */}
            <div className="relative" ref={currencyDropdownRef}>
              <button
                type="button"
                onClick={() => setCurrencyDropdownOpen(!currencyDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-white/90 text-[11.5px] border border-white/15 transition-colors cursor-pointer whitespace-nowrap"
                aria-label="Select Currency"
                aria-expanded={currencyDropdownOpen}
              >
                <Globe className="w-3.5 h-3.5 text-[#c49a55]" />
                <span className="font-semibold tracking-wide">
                  {selectedCurrency} {PRICING_DATA[selectedCurrency]?.symbol.trim()}
                </span>
                <ChevronDown className={`w-3 h-3 text-[#c4d3cd] transition-transform duration-200 ${currencyDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {currencyDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-2xl bg-white shadow-2xl border border-[#e6dfd1] py-1.5 z-50 text-xs text-[#10201b] animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3.5 py-1.5 text-[10px] font-bold text-[#6b7772] uppercase tracking-wider border-b border-[#f3eee4]">
                    Select Billing Currency
                  </div>
                  {(Object.keys(PRICING_DATA) as Currency[]).map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => handleCurrencySelect(cur)}
                      className={`w-full text-left px-3.5 py-2 flex items-center justify-between transition-colors cursor-pointer ${
                        selectedCurrency === cur ? 'bg-[#f0f6f3] text-[#143a2f] font-bold' : 'hover:bg-[#faf7f1] text-[#3c4a45]'
                      }`}
                    >
                      <span>
                        {cur} — {PRICING_DATA[cur].currencyName}
                      </span>
                      {selectedCurrency === cur && (
                        <Check className="w-3.5 h-3.5 text-[#143a2f] stroke-[2.5]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <nav className="bg-[#0f2c24] text-white min-h-[82px] py-2.5 px-4 sm:px-6 lg:px-8 flex items-center border-b border-white/10">
        <div className="w-full max-w-[1360px] mx-auto flex items-center justify-between">
          {/* Logo */}
          <Logo dark={true} />

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-[15px] font-medium text-[#c4d3cd] hover:text-white transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Right CTAs */}
          <div className="hidden md:flex items-center gap-6">
            {/* Log in */}
            <Link
              href="/login"
              className="text-[15px] font-medium text-[#c4d3cd] hover:text-white transition-colors"
            >
              Log in
            </Link>

            {/* Gold "Book free trial" button */}
            <Link
              href="/book-trial"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#c49a55] text-[#0a1f19] text-sm font-semibold hover:bg-[#b58c49] shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0"
            >
              Book free trial
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <Link
              href="/book-trial"
              className="px-3.5 py-1.5 rounded-full bg-[#c49a55] text-[#0a1f19] text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Book trial
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-white hover:bg-white/10"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0f2c24] border-b border-white/10 px-6 py-6 text-white space-y-4 animate-in slide-in-from-top duration-200">
          <div className="flex flex-col space-y-3 pb-4 border-b border-white/10">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-[17px] font-medium text-[#c4d3cd] hover:text-white py-1"
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-[#c4d3cd]">Currency</span>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(PRICING_DATA) as Currency[]).map((cur) => (
                <button
                  key={cur}
                  onClick={() => handleCurrencySelect(cur)}
                  className={`text-xs px-2.5 py-1 rounded-full ${
                    selectedCurrency === cur
                      ? 'bg-[#c49a55] text-[#0a1f19] font-bold'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-3">
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
              className="w-full text-center py-3 rounded-full bg-[#c49a55] text-[#0a1f19] font-semibold text-sm shadow-sm"
            >
              Book free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { Currency } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface CurrencyItem {
  code: Currency;
  symbol: string;
  name: string;
  flag: string;
}

export const HEADER_CURRENCIES: CurrencyItem[] = [
  { code: Currency.USD, symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  { code: Currency.GBP, symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  { code: Currency.CAD, symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: Currency.AUD, symbol: 'AU$', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: Currency.AED, symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: Currency.PKR, symbol: '₨', name: 'Pakistani Rupee', flag: '🇵🇰' },
];

export function HeaderCurrencyPicker({ className }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = HEADER_CURRENCIES.find((c) => c.code === currency) ?? HEADER_CURRENCIES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative inline-block text-left', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-[12px] font-medium transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-gold"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select billing currency"
      >
        <span className="text-sm leading-none" aria-hidden>{active.flag}</span>
        <span>{active.code}</span>
        <span className="text-white/60 text-[11px]">({active.symbol})</span>
        <ChevronDown className={cn('w-3 h-3 text-white/70 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-56 rounded-2xl bg-[#0d221c] border border-white/20 shadow-2xl py-1.5 z-50 text-white backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          role="listbox"
          aria-label="Currency options"
        >
          <div className="px-3 py-1.5 border-b border-white/10 text-[10px] font-semibold uppercase tracking-wider text-white/50">
            Select Currency
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {HEADER_CURRENCIES.map((c) => {
              const isSelected = c.code === currency;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setCurrency(c.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer text-left',
                    isSelected ? 'bg-white/15 text-gold font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white'
                  )}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base" aria-hidden>{c.flag}</span>
                    <div>
                      <span className="font-medium text-white">{c.code}</span>
                      <span className="text-white/50 ml-1.5 text-[11px]">({c.symbol})</span>
                      <p className="text-[10px] text-white/60 leading-tight">{c.name}</p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-gold shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

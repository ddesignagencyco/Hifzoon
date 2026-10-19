'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Currency } from '@/lib/types';

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
}

const STORAGE_KEY = 'hifzoon_preferred_currency';

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: Currency.USD,
  setCurrency: () => undefined,
});

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(Currency.USD);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Currency | null;
      if (saved && Object.values(Currency).includes(saved)) {
        setCurrencyState(saved);
      }
    } catch {
      // Ignore localStorage errors
    }
    setMounted(true);
  }, []);

  const setCurrency = (next: Currency) => {
    setCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency: mounted ? currency : Currency.USD, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}

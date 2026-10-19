'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';

import { CurrencyProvider } from '@/context/CurrencyContext';

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        {/* Site-wide toasts: every page reports errors and confirmations via useToast(). */}
        <ToastProvider>
          {children}
        </ToastProvider>
      </CurrencyProvider>
    </QueryClientProvider>
  );
};

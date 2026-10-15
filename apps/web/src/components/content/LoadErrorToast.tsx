'use client';

import { useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/http';

/** Announces a load failure as an error toast instead of printing it in the page. Renders nothing. */
export function LoadErrorToast({ error }: { error: unknown }) {
  const toast = useToast();
  const message = getErrorMessage(error);
  useEffect(() => {
    toast.error(message);
  }, [message, toast]);
  return null;
}

'use client';

import { useEffect } from 'react';
import { StatusPage } from '@/components/errors/StatusPage';

/** Route-level error boundary: an unexpected render error anywhere below the root layout. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      kind="error"
      actions={[
        { label: 'Try again', onClick: reset, variant: 'primary' },
        { label: 'Go to homepage', href: '/', variant: 'secondary' },
      ]}
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
    />
  );
}

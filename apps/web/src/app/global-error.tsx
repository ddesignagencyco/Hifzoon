'use client';

import './globals.css';
import { StatusPage } from '@/components/errors/StatusPage';

/** Last-resort boundary when the root layout itself fails; must render its own <html>/<body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-cream text-ink font-sans">
        <StatusPage
          kind="error"
          actions={[
            { label: 'Try again', onClick: reset, variant: 'primary' },
            { label: 'Go to homepage', href: '/', variant: 'secondary' },
          ]}
          detail={error.digest ? `Reference: ${error.digest}` : undefined}
        />
      </body>
    </html>
  );
}

import Link from 'next/link';

/**
 * `/interview` — where a reschedule or cancellation email points when the plaintext join
 * token is no longer held by the server (only its HMAC is stored, so it can never be
 * re-sent). The applicant's original link still works; this page says so.
 */
export default function InterviewLinkHelpPage() {
  return (
    <main className="min-h-screen bg-cream px-4 py-16">
      <div className="mx-auto w-full max-w-xl space-y-4 rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="font-fraunces text-2xl text-ink">Your interview link</h1>
        <p className="text-sm text-ink-2">
          Open the link in the first email the academy sent you about your interview — it still
          works, even if the time has changed since. For security we cannot send that link again,
          so if you no longer have the email, reply to any message from the academy and they will
          book you a fresh one.
        </p>
        <p className="text-xs text-muted">
          <Link href="/" className="font-semibold text-green-700 hover:underline">
            Back to Hifzoon
          </Link>
        </p>
      </div>
    </main>
  );
}

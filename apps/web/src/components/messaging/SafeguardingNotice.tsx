import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { MessagingSide } from '@/lib/api/modules/messaging';

/** Standing reminder of the messaging safeguarding rules (FR-PAR-06). */
export function SafeguardingNotice({ side }: { side: MessagingSide }) {
  return (
    <aside
      aria-label="Safeguarding notice"
      className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold-100/60 px-4 py-3 text-xs text-ink-2"
    >
      <ShieldCheck className="w-4 h-4 mt-0.5 text-gold-600 shrink-0" aria-hidden />
      <p className="leading-relaxed">
        <span className="font-semibold text-ink">Messages are kept on record</span> and can be reviewed by
        the Hifzoon safeguarding team. Keep conversations about lessons and progress, and don&apos;t share
        phone numbers, emails or social media.{' '}
        {side === 'guardian'
          ? 'Each conversation is about one child with the teacher who teaches them.'
          : 'Families start conversations; you can reply in threads with families you teach.'}
      </p>
    </aside>
  );
}

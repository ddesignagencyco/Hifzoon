'use client';

import Link from 'next/link';
import { Timer } from 'lucide-react';
import { CaseBoard } from '@/components/cases/CaseBoard';

export default function SafeguardingBoardPage() {
  return (
    <CaseBoard
      basePath="/safeguarding/cases"
      eyebrow="Safeguarding"
      title="Case board"
      description="Complaints and safeguarding concerns. Overdue cases sort to the top of each status."
      actions={
        <Link
          href="/safeguarding/sla"
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-line bg-white text-sm font-semibold text-ink hover:bg-sand"
        >
          <Timer className="w-4 h-4" aria-hidden /> SLA monitor
        </Link>
      }
    />
  );
}

'use client';

import { useParams } from 'next/navigation';
import { CaseDetailView } from '@/components/cases/CaseDetailView';

export default function SafeguardingCasePage() {
  const { id } = useParams<{ id: string }>();
  return <CaseDetailView id={id} backHref="/safeguarding" />;
}

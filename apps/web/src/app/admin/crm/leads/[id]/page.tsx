'use client';

import { useParams } from 'next/navigation';
import { LeadDetailView } from '@/components/admin/crm/LeadDetailView';

export default function AdminLeadDetailPage() {
  const params = useParams<{ id: string }>();
  return <LeadDetailView leadId={params.id} />;
}

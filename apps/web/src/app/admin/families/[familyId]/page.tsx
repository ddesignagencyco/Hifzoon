'use client';

import { useParams } from 'next/navigation';
import { FamilyDetailScreen } from '@/components/admin/ops/FamilyDetailScreen';

export default function Page() {
  const { familyId } = useParams<{ familyId: string }>();
  return <FamilyDetailScreen familyId={familyId} />;
}

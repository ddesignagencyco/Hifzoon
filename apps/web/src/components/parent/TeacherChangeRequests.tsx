'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, ErrorState, StatusBadge, formatDate } from '@/components/ui/primitives';
import { useMyTeacherChanges } from '@/hooks/useParentEnrolments';

/**
 * The family's teacher-change requests and where each one stands (`GET /teacher-changes`,
 * own families only). Rendered only once the family has made a request, so it adds nothing to
 * the Children page until it is useful.
 */
export function TeacherChangeRequests({ familyId }: { familyId: string }) {
  const changes = useMyTeacherChanges();
  if (changes.isLoading) return null;
  if (changes.isError) {
    return (
      <Card>
        <CardHeader title="Teacher-change requests" />
        <CardBody>
          <ErrorState error={changes.error} onRetry={() => changes.refetch()} title="Requests could not be loaded" />
        </CardBody>
      </Card>
    );
  }
  const rows = (changes.data ?? [])
    .filter((r) => r.familyId === familyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Teacher-change requests"
        description="Classes continue with the current teacher until the academy confirms a change."
      />
      <CardBody>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="py-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{r.studentName ?? 'Your child'}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-muted">
                Requested {formatDate(r.createdAt)}
                {r.resolvedAt && ` · decided ${formatDate(r.resolvedAt)}`}
                {r.resolvedBy && ` by ${r.resolvedBy.name}`}
              </p>
              <p className="text-xs text-ink-2 line-clamp-2 whitespace-pre-line">{r.reason}</p>
              <Link
                href={`/parent/children/${encodeURIComponent(r.studentId)}?tab=courses`}
                className="inline-block text-xs font-semibold text-green-700 hover:underline"
              >
                View courses
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

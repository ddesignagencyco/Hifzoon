'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LoadingState } from '@/components/ui/primitives';
import { useAuth } from '@/hooks';
import { classroomPathFor } from '@/lib/portal/classroom-link';

/**
 * `/classroom/:classId` — the join link in class reminder emails/WhatsApp
 * (`class-reminder.service.ts` builds `${APP_WEB_URL}/classroom/:id`). Sends each person to
 * their own portal's classroom: teacher, student, or guardian (watch-only).
 */
function ClassroomRedirect() {
  const router = useRouter();
  const { classId } = useParams<{ classId: string }>();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser || !classId) return;
    router.replace(classroomPathFor(classId, currentUser.roles));
  }, [currentUser, classId, router]);

  return <LoadingState label="Opening the classroom…" className="min-h-screen" />;
}

export default function ClassroomLinkPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingState className="min-h-screen" />}>
        <ClassroomRedirect />
      </Suspense>
    </ProtectedRoute>
  );
}

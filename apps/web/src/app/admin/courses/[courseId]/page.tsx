import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/primitives';
import { CourseDetailRoute } from '@/components/admin/courses/CoursesAdmin';

/**
 * `useParams` suspends for request-time params under Cache Components, so the
 * client screen is rendered inside a Suspense boundary.
 */
export default function AdminCourseDetailPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading course…" />}>
      <CourseDetailRoute />
    </Suspense>
  );
}

import { redirect } from 'next/navigation';

/** Old address of the revision-request oversight list; questions now live in Messages. */
export default function SupervisorRevisionRequestsPage() {
  redirect('/supervisor');
}

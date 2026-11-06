import { redirect } from 'next/navigation';

/**
 * Old address of the teacher's revision-request queue (still linked from earlier emails).
 * Families' questions about a lesson card now arrive in Messages, where the teacher replies.
 */
export default function TeacherRevisionRequestsPage() {
  redirect('/teacher/messages');
}

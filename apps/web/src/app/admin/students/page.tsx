import { redirect } from 'next/navigation';

/**
 * Students have no list page of their own — a student is opened from Users search (or from a
 * family page) into `students/[studentId]`. The bare path is sent to Users search so a stray
 * link or typed URL does not hit a 404.
 */
export default function AdminStudentsIndexPage() {
  redirect('/admin/users');
}

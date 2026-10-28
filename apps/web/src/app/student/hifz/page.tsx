import { redirect } from 'next/navigation';

/** Old address of the student Hifz tracker; progress now covers every course. */
export default function StudentHifzPage() {
  redirect('/student/progress');
}

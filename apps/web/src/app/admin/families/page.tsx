import { redirect } from 'next/navigation';

/**
 * Families have no list page of their own — a family is opened from Users search (family
 * hits carry their id) into `families/[familyId]`. The bare path is sent there so a stray
 * link or typed URL does not hit a 404.
 */
export default function AdminFamiliesIndexPage() {
  redirect('/admin/users');
}

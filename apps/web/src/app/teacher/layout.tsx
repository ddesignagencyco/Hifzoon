import { PortalShell } from '@/components/portal/PortalShell';

// Portal pages render from the in-memory session (client-side auth), so they can never
// prerender a meaningful shell: navigations here are allowed to block (Cache Components).
export const instant = false;

export default function TeacherPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="teacher">{children}</PortalShell>;
}

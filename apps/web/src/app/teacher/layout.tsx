import { PortalShell } from '@/components/portal/PortalShell';
import { TeacherOnboardingGate } from '@/components/teacher/TeacherOnboardingGate';

// Portal pages render from the in-memory session (client-side auth), so they can never
// prerender a meaningful shell: navigations here are allowed to block (Cache Components).
export const instant = false;

export default function TeacherPortalLayout({ children }: { children: React.ReactNode }) {
  // Until the one-time profile setup is done, every teacher page redirects to it.
  return (
    <PortalShell portal="teacher">
      <TeacherOnboardingGate>{children}</TeacherOnboardingGate>
    </PortalShell>
  );
}

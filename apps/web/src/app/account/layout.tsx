import { AccountShell } from '@/components/portal/AccountShell';

// Portal pages render from the in-memory session (client-side auth), so they can never
// prerender a meaningful shell: navigations here are allowed to block (Cache Components).
export const instant = false;

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}

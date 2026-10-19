// Portal pages render from the in-memory session (client-side auth), so they can never
// prerender a meaningful shell: navigations here are allowed to block (Cache Components).
export const instant = false;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}

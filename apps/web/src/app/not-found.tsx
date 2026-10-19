import { StatusPage } from '@/components/errors/StatusPage';

export const metadata = {
  title: 'Page not found — Hifzoon',
};

/** Global 404 (also rendered by `notFound()` anywhere in the app). */
export default function NotFound() {
  return (
    <StatusPage
      kind="not-found"
      actions={[
        { label: 'Go to homepage', href: '/', variant: 'primary' },
        { label: 'Browse programmes', href: '/courses', variant: 'secondary' },
        { label: 'My portal', href: '/dashboard', variant: 'secondary' },
      ]}
    />
  );
}

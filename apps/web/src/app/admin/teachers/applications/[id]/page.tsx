import { redirect } from 'next/navigation';

/** Applications moved to `/admin/hiring`; links already sent by email keep working. */
export default async function LegacyApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const qs = query.toString();
  redirect(`/admin/hiring/applications/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`);
}

/**
 * Teacher photos and media uploaded at profile setup are stored as a stable API path
 * (`/api/v1/teachers/files/<profileId>/<file>`) that redirects to a short-lived signed link.
 * With the dev proxy (`NEXT_PUBLIC_API_URL=/api/v1`) that path works as-is; when the API is
 * on another origin it is resolved against it. Absolute links pass through unchanged.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function mediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/api/')) return null;
  if (/^https?:\/\//i.test(API_BASE_URL)) return `${new URL(API_BASE_URL).origin}${value}`;
  return value;
}

/** next/image must not try to optimise a link it cannot fetch itself (remote or redirecting). */
export function skipImageOptimisation(src: string): boolean {
  return /^https?:/i.test(src) || src.startsWith('/api/');
}

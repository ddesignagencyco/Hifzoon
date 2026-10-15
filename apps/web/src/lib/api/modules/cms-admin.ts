import { http } from '../http';

export const CMS_POST_TYPES = ['BLOG', 'PRINTABLE', 'LANDING'] as const;
export type CmsPostType = (typeof CMS_POST_TYPES)[number];
export const CMS_POST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type CmsPostStatus = (typeof CMS_POST_STATUSES)[number];

/** Full Prisma `CmsPost` row (`GET /content-admin`, `POST /content-admin`, `DELETE`). */
export interface CmsPost {
  id: string;
  type: CmsPostType;
  slug: string;
  locale: string;
  title: string;
  body: string;
  countryCode: string | null;
  city: string | null;
  status: CmsPostStatus;
  publishedAt: string | null;
  authorId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Zod `savePostBody`. Supplying `id` updates; omitting it creates. */
export interface SavePostInput {
  id?: string;
  type: CmsPostType;
  slug: string;
  locale: string;
  title: string;
  body: string;
  countryCode?: string;
  city?: string;
  status?: CmsPostStatus;
  meta?: Record<string, unknown>;
}

/** Prisma `FaqItem`. */
export interface FaqItem {
  id: string;
  locale: string;
  question: string;
  answer: string;
  approved: boolean;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmsFilters {
  type?: CmsPostType | '';
  status?: CmsPostStatus | '';
  locale?: string;
}

export const cmsAdminApi = {
  /** Editorial list incl. drafts/archived, newest edit first (server caps at 50). */
  list: (filters: CmsFilters = {}) =>
    http.get<CmsPost[]>('/content-admin', {
      query: { type: filters.type, status: filters.status, locale: filters.locale?.trim() },
    }),
  save: (body: SavePostInput) => http.post<CmsPost>('/content-admin', body),
  /** Soft delete: the API archives the post and stamps `deletedAt`. */
  remove: (id: string) => http.delete<CmsPost>(`/content-admin/${encodeURIComponent(id)}`),
  /** Public, approved-only FAQ list for a locale. */
  publicFaq: (locale = 'en') => http.get<FaqItem[]>('/faq', { query: { locale } }),
  moderateFaq: (id: string, approved: boolean) =>
    http.post<FaqItem>(`/faq-admin/${encodeURIComponent(id)}/moderate`, { approved }),
};

export type PostFormValues = {
  id?: string;
  type: CmsPostType;
  slug: string;
  locale: string;
  title: string;
  body: string;
  countryCode: string;
  city: string;
  status: CmsPostStatus;
};

export type PostErrors = Partial<Record<keyof PostFormValues, string>>;

/** Mirrors `savePostBody` exactly. Returns the request body when valid. */
export function validatePost(values: PostFormValues): { errors: PostErrors; body?: SavePostInput } {
  const errors: PostErrors = {};
  const slug = values.slug.trim();
  if (!slug) errors.slug = 'Slug is required.';
  else if (slug.length > 160) errors.slug = 'Slug must be at most 160 characters.';
  else if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = 'Slug must be lowercase kebab-case (a-z, 0-9, -).';

  const locale = values.locale.trim();
  if (locale.length < 2 || locale.length > 5) errors.locale = 'Locale must be 2–5 characters (e.g. en, ur, ar).';

  const title = values.title.trim();
  if (!title) errors.title = 'Title is required.';
  else if (title.length > 240) errors.title = 'Title must be at most 240 characters.';

  if (!values.body.trim()) errors.body = 'Body is required.';

  const country = values.countryCode.trim();
  if (country && !/^[A-Za-z]{2}$/.test(country)) errors.countryCode = 'Country must be a 2-letter code (e.g. GB).';

  const city = values.city.trim();
  if (city.length > 120) errors.city = 'City must be at most 120 characters.';

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    body: {
      ...(values.id ? { id: values.id } : {}),
      type: values.type,
      slug,
      locale,
      title,
      body: values.body,
      ...(country ? { countryCode: country.toUpperCase() } : {}),
      ...(city ? { city } : {}),
      status: values.status,
    },
  };
}

/** "Choosing a Teacher!" → "choosing-a-teacher". */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

/**
 * Marketing CMS and public help content (FR-ADM-06, FR-ADM-07, FR-ADM-08).
 *
 * Two rules that this whole module exists to enforce:
 *
 *   - **Drafts are invisible to the public, always.** Every public read filters on
 *     `status: PUBLISHED` in the query rather than filtering after fetching, because
 *     filtering afterwards is the classic way an unpublished price rise ends up in a
 *     search index.
 *   - **Locales are explicit, never guessed.** An Urdu or Arabic page is not a
 *     translated copy of the English one; publishing a post with `locale: en` does not
 *     make it appear for `locale: ur`, so a missing translation shows nothing instead
 *     of showing the wrong language. The only fallback allowed is to the requested
 *     locale itself, never to a default.
 */
@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Public listing. Public route, no auth, published only. */
  async listPublic(input: {
    type?: 'BLOG' | 'PRINTABLE' | 'LANDING';
    locale: string;
    country?: string;
    limit?: number;
  }) {
    const take = Math.min(Math.max(input.limit ?? 20, 1), 50);

    return this.prisma.cmsPost.findMany({
      where: {
        status: 'PUBLISHED',
        locale: input.locale,
        ...(input.type ? { type: input.type } : {}),
        // A post tagged for a country must not appear to families in other countries;
        // an untagged post is global and does appear everywhere.
        ...(input.country ? { OR: [{ countryCode: null }, { countryCode: input.country }] } : {}),
        publishedAt: { lte: new Date() },
      },
      orderBy: { publishedAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        slug: true,
        locale: true,
        title: true,
        body: true,
        countryCode: true,
        city: true,
        meta: true,
        publishedAt: true,
      },
    });
  }

  async getPublic(slug: string, locale: string) {
    const post = await this.prisma.cmsPost.findFirst({
      where: { slug, status: 'PUBLISHED', locale, publishedAt: { lte: new Date() } },
    });
    if (!post) throw AppError.notFound('Page');
    return post;
  }

  /** Editorial list, including drafts (FR-ADM-06). */
  async listAll(input: { type?: string; status?: string; locale?: string; limit?: number }) {
    return this.prisma.cmsPost.findMany({
      where: {
        ...(input.type ? { type: input.type as never } : {}),
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(input.limit ?? 50, 1), 100),
    });
  }

  /**
   * Creates or updates a post.
   *
   * Publishing sets `publishedAt` once and then never clears it, so re-publishing an
   * edit keeps the original date. A CMS that resets the date on every save makes
   * "latest articles" order by whoever edited last, not by what is actually recent.
   */
  async save(input: {
    id?: string;
    type: 'BLOG' | 'PRINTABLE' | 'LANDING';
    slug: string;
    locale: string;
    title: string;
    body: string;
    countryCode?: string;
    city?: string;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    meta?: unknown;
    actorId: string;
  }) {
    const existing = input.id
      ? await this.prisma.cmsPost.findUnique({ where: { id: input.id } })
      : null;

    if (input.id && !existing) throw AppError.notFound('Post');

    const publishing = input.status === 'PUBLISHED';

    const data = {
      type: input.type,
      slug: input.slug,
      locale: input.locale,
      title: input.title,
      body: input.body,
      countryCode: input.countryCode ?? null,
      city: input.city ?? null,
      status: input.status ?? ('DRAFT' as const),
      meta: (input.meta ?? null) as never,
      // Only set on first publish; preserved thereafter.
      publishedAt:
        publishing && existing?.publishedAt ? existing.publishedAt : publishing ? new Date() : null,
    };

    const post = existing
      ? await this.prisma.cmsPost.update({ where: { id: existing.id }, data })
      : await this.prisma.cmsPost.create({ data: { ...data, authorId: input.actorId } });

    await this.audit.record({
      actorId: input.actorId,
      action: existing ? 'adm.cms.update' : 'adm.cms.create',
      targetType: 'cms_post',
      targetId: post.id,
      before: existing ? { status: existing.status, title: existing.title } : undefined,
      after: { status: post.status, title: post.title, slug: post.slug },
    });

    return post;
  }

  async remove(id: string, actorId: string) {
    const post = await this.prisma.cmsPost.findUnique({ where: { id } });
    if (!post) throw AppError.notFound('Post');

    // Soft delete: a published URL that 404s after an edit is worse than an archived
    // page, and the row is still needed to resolve old inbound links.
    const deleted = await this.prisma.cmsPost.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });

    await this.audit.record({
      actorId,
      action: 'adm.cms.archive',
      targetType: 'cms_post',
      targetId: id,
      before: { status: post.status },
      after: { status: deleted.status },
    });

    return deleted;
  }

  /** Public FAQ, approved items only (FR-ADM-07). */
  async listFaq(locale: string) {
    return this.prisma.faqItem.findMany({
      where: { locale, approved: true },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Submits a candidate FAQ. `approved` is always false — nothing a parent submits
   * appears publicly without a human reading it first (FR-ADM-07).
   */
  async submitFaq(input: { locale: string; question: string; answer?: string }) {
    return this.prisma.faqItem.create({
      data: {
        locale: input.locale,
        question: input.question,
        answer: input.answer ?? '',
        approved: false,
      },
    });
  }

  async moderateFaq(input: { id: string; approved: boolean; actorId: string }) {
    const item = await this.prisma.faqItem.findUnique({ where: { id: input.id } });
    if (!item) throw AppError.notFound('FAQ item');

    const updated = await this.prisma.faqItem.update({
      where: { id: input.id },
      data: { approved: input.approved },
    });

    await this.audit.record({
      actorId: input.actorId,
      action: input.approved ? 'adm.faq.approve' : 'adm.faq.reject',
      targetType: 'faq_item',
      targetId: input.id,
      before: { approved: item.approved },
      after: { approved: updated.approved },
    });

    return updated;
  }
}

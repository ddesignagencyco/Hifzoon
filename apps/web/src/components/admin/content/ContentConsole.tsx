'use client';

import React, { useState } from 'react';
import { CONTENT_LOCALES, localeLabel } from '@/lib/api/modules/families';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { CheckCircle2, EyeOff, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  QueryState,
  Select,
  StatusBadge,
  Tabs,
  TextInput,
  UiButton,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCmsPosts, useDeleteCmsPost, useModerateFaq, usePublishedFaq } from '@/hooks/useCms';
import {
  CMS_POST_STATUSES,
  CMS_POST_TYPES,
  CmsFilters,
  CmsPost,
  CmsPostStatus,
  CmsPostType,
  FaqItem,
} from '@/lib/api/modules/cms-admin';
import { isUuid } from '@/lib/api/modules/courses-admin';
import { ConfirmDialog, CopyId } from '../system/shared';
import { PostEditor } from './PostEditor';

type Tab = 'posts' | 'faq';

/** /admin/content — CMS posts (FR-ADM-06) and FAQ moderation (FR-ADM-07). */
export function ContentConsole() {
  const [tab, setTab] = useState<Tab>('posts');
  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Content & FAQ"
        description="Blog posts, printables and landing pages, plus moderation of the public FAQ."
      />
      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'posts', label: 'Posts' },
          { value: 'faq', label: 'FAQ moderation' },
        ]}
      />
      {tab === 'posts' ? <PostsPanel /> : <FaqPanel />}
    </>
  );
}

function PostsPanel() {
  const toast = useToast();
  const [filters, setFilters] = useState<CmsFilters>({ type: '', status: '', locale: '', page: 1, limit: 25 });
  const query = useCmsPosts(filters);
  const remove = useDeleteCmsPost();
  const [editing, setEditing] = useState<CmsPost | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<CmsPost | null>(null);

  const openEditor = (post: CmsPost | null) => {
    setEditing(post);
    setEditorOpen(true);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(`“${deleting.title}” archived and removed`);
        setDeleting(null);
      },
      onError: (err) => {
        toast.error(err);
        setDeleting(null);
      },
    });
  };

  return (
    <Card>
      <CardHeader
        title="Posts"
        description="Includes drafts and archived posts. Most recently edited first (up to 50)."
        action={
          <UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => openEditor(null)}>
            New post
          </UiButton>
        }
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-3 mb-4" role="search" aria-label="Filter posts">
          <Field label="Type" htmlFor="cms-filter-type">
            <Select
              id="cms-filter-type"
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as CmsPostType | '', page: 1 }))}
            >
              <option value="">All types</option>
              {CMS_POST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="cms-filter-status">
            <Select
              id="cms-filter-status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as CmsPostStatus | '', page: 1 }))}
            >
              <option value="">All statuses</option>
              {CMS_POST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language" htmlFor="cms-filter-locale">
            <Select id="cms-filter-locale" value={filters.locale} onChange={(e) => setFilters((f) => ({ ...f, locale: e.target.value, page: 1 }))}>
              <option value="">All languages</option>
              {CONTENT_LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="-mx-5 sm:mx-0">
          <QueryState
            query={query}
            isEmpty={(d) => d.items.length === 0}
            empty={
              <EmptyState
                title="No posts match"
                action={
                  <UiButton size="sm" variant="secondary" onClick={() => openEditor(null)}>
                    Create a post
                  </UiButton>
                }
              />
            }
          >
            {(data) => (
              <>
              <DataTable
                paginate={false}
                rows={data.items}
                rowKey={(p) => p.id}
                columns={[
                  {
                    key: 'title',
                    header: 'Title',
                    render: (p) => (
                      <div className="min-w-[180px]">
                        <p className="font-medium text-ink">{p.title}</p>
                        <p className="text-[11px] text-muted font-mono break-all">/{p.slug}</p>
                      </div>
                    ),
                  },
                  { key: 'type', header: 'Type', render: (p) => <Badge>{humanize(p.type)}</Badge> },
                  {
                    key: 'country',
                    header: 'Language · country',
                    render: (p) => (
                      <span className="text-xs">
                        {localeLabel(p.locale)} · {p.countryCode ?? 'Global'}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (p) => (
                      <span className="flex flex-wrap gap-1">
                        <StatusBadge status={p.status} />
                        {p.deletedAt && <Badge tone="red">Deleted</Badge>}
                      </span>
                    ),
                  },
                  {
                    key: 'dates',
                    header: 'Updated',
                    render: (p) => (
                      <span className="text-xs whitespace-nowrap">
                        {formatDate(p.updatedAt)}
                        {p.publishedAt && <span className="block text-muted">Published {formatDate(p.publishedAt)}</span>}
                      </span>
                    ),
                  },
                  {
                    key: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    className: 'text-right whitespace-nowrap',
                    render: (p) => (
                      <span className="inline-flex gap-1">
                        <UiButton
                          size="sm"
                          variant="ghost"
                          icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}
                          onClick={() => openEditor(p)}
                          aria-label={`Edit ${p.title}`}
                        >
                          Edit
                        </UiButton>
                        {!p.deletedAt && (
                          <UiButton
                            size="sm"
                            variant="ghost"
                            className="text-red"
                            icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />}
                            onClick={() => setDeleting(p)}
                            aria-label={`Delete ${p.title}`}
                          >
                            Delete
                          </UiButton>
                        )}
                      </span>
                    ),
                  },
                ]}
              />
              <Pagination
                page={data.meta.page}
                limit={data.meta.limit}
                total={data.meta.total}
                onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
                onLimitChange={(limit) => setFilters((f) => ({ ...f, limit, page: 1 }))}
                itemName="posts"
                className="px-5 sm:px-0"
              />
              </>
            )}
          </QueryState>
        </div>
      </CardBody>

      <PostEditor post={editing} open={editorOpen} onClose={() => setEditorOpen(false)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this post?"
        description={deleting ? `“${deleting.title}” (/${deleting.slug})` : undefined}
        confirmLabel="Delete post"
        pending={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        <p className="text-sm text-ink-2">
          The post is archived and hidden from the public site. The record is kept so old links resolve, and the slug
          stays reserved.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

function FaqPanel() {
  const toast = useToast();
  const [locale, setLocale] = useState('en');
  const query = usePublishedFaq(locale);
  const moderate = useModerateFaq();
  const [target, setTarget] = useState<{ id: string; approved: boolean; label: string } | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  const ask = (approved: boolean) => {
    if (!isUuid(lookupId)) {
      setLookupError('Paste a valid FAQ item reference.');
      return;
    }
    setLookupError(null);
    setTarget({ id: lookupId.trim(), approved, label: 'the FAQ item with that reference' });
  };

  const run = () => {
    if (!target) return;
    moderate.mutate(
      { id: target.id, approved: target.approved },
      {
        onSuccess: (item: FaqItem) => {
          toast.success(item.approved ? 'FAQ approved and published' : 'FAQ rejected — hidden from the public site');
          setTarget(null);
          setLookupId('');
        },
        onError: (err) => {
          toast.error(err);
          setTarget(null);
        },
      },
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
      <Card>
        <CardHeader
          title="Published FAQ"
          description="Approved entries visible on the public site."
          action={
            <FilterSelect
              id="faq-locale"
              label="Language"
              value={locale}
              onChange={setLocale}
              options={CONTENT_LOCALES}
            />
          }
        />
        <CardBody>
          <QueryState query={query} empty={<EmptyState title="No published FAQ entries yet" />}>
            {(items) => (
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{item.question}</p>
                      {item.answer ? (
                        <p className="text-xs text-ink-2 mt-1 whitespace-pre-wrap">{item.answer}</p>
                      ) : (
                        <p className="text-xs text-amber mt-1">No answer recorded</p>
                      )}
                      <div className="mt-1">
                        <CopyId value={item.id} label="FAQ item reference" />
                      </div>
                    </div>
                    <UiButton
                      size="sm"
                      variant="secondary"
                      icon={<EyeOff className="w-3.5 h-3.5" aria-hidden />}
                      onClick={() => setTarget({ id: item.id, approved: false, label: item.question })}
                      aria-label={`Unpublish: ${item.question}`}
                      className="shrink-0"
                    >
                      Unpublish
                    </UiButton>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Moderation queue" description="Suggested questions awaiting review." />
        <CardBody className="space-y-4">
          <Alert tone="warning" title="This queue isn't available yet">
            There is no endpoint that lists pending suggestions, and moderation can only approve or reject — it cannot
            write an answer. If you have a suggestion&apos;s reference, you can moderate it here.
          </Alert>
          <Field
            label="FAQ item reference"
            htmlFor="faq-moderate-id"
            error={lookupError}
            hint="Paste it from “Copy reference” on a published entry above. Submitted suggestions can't be looked up here yet."
          >
            <TextInput
              id="faq-moderate-id"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Paste reference"
              aria-invalid={Boolean(lookupError)}
              autoComplete="off"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <UiButton icon={<CheckCircle2 className="w-4 h-4" aria-hidden />} onClick={() => ask(true)} disabled={moderate.isPending}>
              Approve
            </UiButton>
            <UiButton
              variant="secondary"
              icon={<XCircle className="w-4 h-4" aria-hidden />}
              onClick={() => ask(false)}
              disabled={moderate.isPending}
            >
              Reject
            </UiButton>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={target !== null}
        title={target?.approved ? 'Approve and publish this FAQ?' : 'Hide this FAQ from the public site?'}
        description={target?.label}
        confirmLabel={target?.approved ? 'Approve' : 'Reject'}
        tone={target?.approved ? 'primary' : 'danger'}
        pending={moderate.isPending}
        onConfirm={run}
        onClose={() => setTarget(null)}
      >
        <p className="text-sm text-ink-2">
          {target?.approved
            ? 'The entry appears publicly exactly as submitted, including its answer (which may be empty).'
            : 'The entry stays in the database but is no longer shown publicly. You can approve it again later with its reference.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}

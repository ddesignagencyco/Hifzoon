'use client';

import React, { useState } from 'react';
import { Field, Modal, Select, TextInput, UiButton, CountrySelect, humanize } from '@/components/ui/primitives';
import { RichBodyEditor } from './RichBodyEditor';
import { CONTENT_LOCALES } from '@/lib/api/modules/families';
import { useToast } from '@/components/ui/toast';
import { useSaveCmsPost } from '@/hooks/useCms';
import { ApiClientError } from '@/lib/api/http';
import {
  CMS_POST_STATUSES,
  CMS_POST_TYPES,
  CmsPost,
  CmsPostStatus,
  CmsPostType,
  PostErrors,
  PostFormValues,
  slugify,
  validatePost,
} from '@/lib/api/modules/cms-admin';

function initialValues(post: CmsPost | null): PostFormValues {
  if (!post) {
    return { type: 'BLOG', slug: '', locale: 'en', title: '', body: '', countryCode: '', city: '', status: 'DRAFT' };
  }
  return {
    id: post.id,
    type: post.type,
    slug: post.slug,
    locale: post.locale,
    title: post.title,
    body: post.body,
    countryCode: post.countryCode ?? '',
    city: post.city ?? '',
    status: post.status,
  };
}

/** Create / edit a CMS post (`POST /content-admin`, Zod `savePostBody`). */
export function PostEditor({ post, open, onClose }: { post: CmsPost | null; open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={post ? 'Edit post' : 'New post'}
      description={
        post
          ? 'Saving replaces every field. Publishing keeps the original publish date.'
          : 'Drafts are never visible on the public site.'
      }
    >
      {/* Keyed so the form resets when switching between posts. */}
      <PostForm key={post?.id ?? 'new'} post={post} onDone={onClose} />
    </Modal>
  );
}

function PostForm({ post, onDone }: { post: CmsPost | null; onDone: () => void }) {
  const toast = useToast();
  const save = useSaveCmsPost();
  const [values, setValues] = useState<PostFormValues>(() => initialValues(post));
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [errors, setErrors] = useState<PostErrors>({});

  const set = <K extends keyof PostFormValues>(key: K, value: PostFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validatePost(values);
    setErrors(result.errors);
    if (!result.body) return toast.error(Object.values(result.errors).find(Boolean) ?? 'Please fix the highlighted fields');
    save.mutate(result.body, {
      onSuccess: (saved) => {
        toast.success(`${post ? 'Updated' : 'Created'} “${saved.title}” (${humanize(saved.status)})`);
        onDone();
      },
      onError: (err) => {
        // A duplicate slug comes back as 409 CONFLICT: mark the field, not just a toast.
        if (err instanceof ApiClientError && err.status === 409) {
          const message = 'This slug is already used by another post. Choose a different one.';
          setErrors((current) => ({ ...current, slug: message }));
          return toast.error(message);
        }
        toast.error(err);
      },
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={post ? 'Edit post' : 'New post'}>
      <Field label="Title" htmlFor="post-title" required error={errors.title}>
        <TextInput
          id="post-title"
          value={values.title}
          maxLength={240}
          aria-invalid={Boolean(errors.title)}
          onChange={(e) => {
            const title = e.target.value;
            setValues((v) => ({ ...v, title, ...(slugTouched ? {} : { slug: slugify(title) }) }));
          }}
        />
      </Field>
      <Field label="Slug" htmlFor="post-slug" required error={errors.slug} hint="Lowercase kebab-case; forms the public URL.">
        <TextInput
          id="post-slug"
          value={values.slug}
          maxLength={160}
          aria-invalid={Boolean(errors.slug)}
          onChange={(e) => {
            setSlugTouched(true);
            set('slug', e.target.value);
          }}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type" htmlFor="post-type" required>
          <Select id="post-type" value={values.type} onChange={(e) => set('type', e.target.value as CmsPostType)}>
            {CMS_POST_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="post-status" required>
          <Select id="post-status" value={values.status} onChange={(e) => set('status', e.target.value as CmsPostStatus)}>
            {CMS_POST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Language" htmlFor="post-locale" required error={errors.locale}>
          <Select id="post-locale" value={values.locale} onChange={(e) => set('locale', e.target.value)}>
            {CONTENT_LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Country (optional)" htmlFor="post-country" error={errors.countryCode} hint="Choose target country or leave empty for global.">
          <CountrySelect
            id="post-country"
            value={values.countryCode}
            placeholder="All countries (global)…"
            aria-invalid={Boolean(errors.countryCode)}
            onChange={(val) => set('countryCode', val)}
          />
        </Field>
        <Field label="City (optional)" htmlFor="post-city" error={errors.city}>
          <TextInput
            id="post-city"
            value={values.city}
            maxLength={120}
            aria-invalid={Boolean(errors.city)}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Body" htmlFor="post-body" required error={errors.body}>
        <RichBodyEditor id="post-body" value={values.body} invalid={Boolean(errors.body)} onChange={(v) => set('body', v)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-line">
        <UiButton variant="secondary" onClick={onDone} disabled={save.isPending}>
          Cancel
        </UiButton>
        <UiButton type="submit" loading={save.isPending}>
          {post ? 'Save changes' : 'Create post'}
        </UiButton>
      </div>
    </form>
  );
}

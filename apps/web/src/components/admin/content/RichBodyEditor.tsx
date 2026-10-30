'use client';

import React, { useRef, useState } from 'react';
import { Bold, Heading2, Heading3, Italic, Link2, List, Table2 } from 'lucide-react';
import { ContentBody } from '@/components/content/ContentBody';
import { cn } from '@/lib/utils';

type Action = 'h2' | 'h3' | 'bold' | 'italic' | 'link' | 'list' | 'table';

const TOOLS: Array<{ action: Action; label: string; icon: React.ReactNode }> = [
  { action: 'h2', label: 'Heading', icon: <Heading2 className="h-4 w-4" /> },
  { action: 'h3', label: 'Subheading', icon: <Heading3 className="h-4 w-4" /> },
  { action: 'bold', label: 'Bold', icon: <Bold className="h-4 w-4" /> },
  { action: 'italic', label: 'Italic', icon: <Italic className="h-4 w-4" /> },
  { action: 'link', label: 'Link', icon: <Link2 className="h-4 w-4" /> },
  { action: 'list', label: 'Bulleted list', icon: <List className="h-4 w-4" /> },
  { action: 'table', label: 'Table', icon: <Table2 className="h-4 w-4" /> },
];

/**
 * Post body editor: a formatting toolbar over the text and a live preview rendered by the
 * same component the public site uses, so what the admin sees is what visitors get. It
 * writes the light markup the site understands (headings, lists, tables, bold, italic,
 * links) rather than HTML.
 */
export function RichBodyEditor({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  const apply = (action: Action) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    // Block elements start on their own paragraph.
    const gap = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    let insert = '';
    let caret = 0;
    switch (action) {
      case 'h2':
      case 'h3': {
        const text = selected || (action === 'h2' ? 'Heading' : 'Subheading');
        insert = `${gap}${action === 'h2' ? '#' : '##'} ${text}\n\n`;
        caret = insert.length - 2;
        break;
      }
      case 'bold':
      case 'italic': {
        const mark = action === 'bold' ? '**' : '*';
        const text = selected || (action === 'bold' ? 'bold text' : 'italic text');
        insert = `${mark}${text}${mark}`;
        caret = insert.length;
        break;
      }
      case 'link': {
        const text = selected || 'link text';
        insert = `[${text}](https://)`;
        caret = insert.length - 1;
        break;
      }
      case 'list': {
        const items = selected ? selected.split('\n').map((l) => `- ${l.replace(/^[-*]\s+/, '')}`) : ['- First point', '- Second point'];
        insert = `${gap}${items.join('\n')}\n\n`;
        caret = insert.length - 2;
        break;
      }
      case 'table':
        insert = `${gap}| Column | Column |\n| --- | --- |\n| Value | Value |\n\n`;
        caret = insert.length - 2;
        break;
    }
    onChange(before + insert + after);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + caret, start + caret);
    });
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-white focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/40',
        invalid ? 'border-red' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-cream/60 px-2 py-1.5">
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
          {TOOLS.map((t) => (
            <button
              key={t.action}
              type="button"
              title={t.label}
              aria-label={t.label}
              disabled={mode === 'preview'}
              onClick={() => apply(t.action)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-sand hover:text-ink disabled:opacity-40"
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Editor view" className="inline-flex rounded-lg bg-sand p-0.5 text-xs font-semibold">
          {(['write', 'preview'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn('rounded-md px-3 py-1 capitalize', mode === m ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === 'write' ? (
        <textarea
          ref={area}
          id={id}
          value={value}
          rows={14}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write the post. Use the toolbar for headings, lists, tables, bold, italic and links."
          className="block w-full resize-y border-0 bg-white px-4 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-muted"
        />
      ) : (
        <div className="min-h-[18rem] px-5 py-4">
          {value.trim() ? <ContentBody body={value} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}

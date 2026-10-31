import React from 'react';
import { parseContentBlocks } from '@/lib/api/modules/content-public';

/** Renders a CMS body as React elements (never raw HTML). */
export function ContentBody({ body }: { body: string }) {
  const blocks = parseContentBlocks(body);
  return (
    <div className="space-y-5 text-[15.5px] leading-relaxed text-[#3c4a45]">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4';
            return (
              <Tag key={i} className="font-fraunces text-[#10201b] text-xl sm:text-2xl pt-2">
                {block.text}
              </Tag>
            );
          }
          case 'list':
            return (
              <ul key={i} className="list-disc pl-6 space-y-1">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case 'table':
            return (
              <div key={i} className="overflow-x-auto rounded-2xl border border-[#e6dfd1] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f3eee4] text-left">
                      {block.header.map((h, j) => (
                        <th key={j} scope="col" className="px-3 py-2 font-semibold text-[#10201b]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-t border-[#f3eee4]">
                        {row.map((cell, c) => (
                          <td key={c} className="px-3 py-2 h-9">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={i} className="whitespace-pre-line">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}

/**
 * Inline marks inside a paragraph, list item or table cell: **bold**, *italic* and
 * [text](https://…). Only http(s) and mailto links become links; anything else stays text.
 */
export function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token) ?? [];
      out.push(
        /^(https?:|mailto:)/i.test(href ?? '') ? (
          <a key={key++} href={href} className="text-green-800 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          token
        ),
      );
    } else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

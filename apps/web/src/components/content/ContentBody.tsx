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
                  <li key={j}>{item}</li>
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
                            {cell}
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
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}

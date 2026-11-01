'use client';

import React, { useMemo, useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Sort by this value instead of the cell's text (click the header). */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Columns with a text heading sort by default; set false to turn it off. */
  sortable?: boolean;
}

/** Visible text of a rendered cell, used to sort columns that give no `sortValue`. */
function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

/** A date written like "Oct 30, 2026" or "30 Oct 2026" sorts by time, not alphabetically. */
function sortKey(text: string): string | number {
  const trimmed = text.trim();
  if (/^-?[\d,.]+%?$/.test(trimmed)) return Number(trimmed.replace(/[,%]/g, ''));
  if (/\d{4}/.test(trimmed) && /[A-Za-z]{3}/.test(trimmed)) {
    const time = Date.parse(trimmed.replace(/·.*$/, ''));
    if (!Number.isNaN(time)) return time;
  }
  return trimmed.toLowerCase();
}

/** Text a row is searched by when the caller gives no `searchText`: its scalar fields. */
function defaultSearchText(row: unknown): string {
  const out: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (value === null || value === undefined || depth > 3) return;
    if (typeof value === 'string' || typeof value === 'number') out.push(String(value));
    else if (Array.isArray(value)) value.forEach((v) => walk(v, depth + 1));
    else if (typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((v) => walk(v, depth + 1));
  };
  walk(row, 0);
  return out.join(' ').toLowerCase();
}

/**
 * The shared data table (shadcn/ui data-table pattern on TanStack Table): sortable headers
 * where a column gives `sortValue`, a search box and pages of `pageSize` once there are
 * more rows than fit on one page. Small tables render exactly as before.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  pageSize = 10,
  paginate = true,
  searchPlaceholder = 'Search…',
  searchText,
  searchable,
  toolbar,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  pageSize?: number;
  /** Off when the list is paged on the server and a separate pager is shown below it. */
  paginate?: boolean;
  searchPlaceholder?: string;
  /** What a row is searched by; defaults to its text and number fields. */
  searchText?: (row: T) => string;
  /** Show the search box; on by default once there is more than one page. */
  searchable?: boolean;
  /** Filters shown on the same row as the search box (left), so they line up. */
  toolbar?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');

  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: () => col.header,
        cell: ({ row }) => col.render(row.original),
        // Every column with a heading sorts: by `sortValue` when given, else by what it shows.
        enableSorting: col.sortable ?? (typeof col.header === 'string' && col.header.trim() !== ''),
        accessorFn: (row: T) => (col.sortValue ? (col.sortValue(row) ?? '') : sortKey(nodeText(col.render(row)))),
        sortingFn: (a, b, id) => {
          const x = a.getValue<string | number>(id);
          const y = b.getValue<string | number>(id);
          if (typeof x === 'number' && typeof y === 'number') return x - y;
          return String(x).localeCompare(String(y), undefined, { numeric: true });
        },
        meta: { className: col.className },
      })),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getRowId: (row) => rowKey(row),
    globalFilterFn: (row, _id, value: string) =>
      (searchText ? searchText(row.original).toLowerCase() : defaultSearchText(row.original)).includes(
        value.trim().toLowerCase(),
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: paginate ? pageSize : Number.MAX_SAFE_INTEGER } },
    autoResetPageIndex: true,
  });

  if (rows.length === 0) return <>{empty ?? null}</>;

  const paged = paginate && rows.length > pageSize;
  const showSearch = searchable ?? paged;
  const visible = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const from = visible === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(visible, (pageIndex + 1) * pageSize);

  return (
    <div className="space-y-3">
      {(showSearch || toolbar) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {toolbar && <div className="flex flex-wrap items-end gap-3">{toolbar}</div>}
          {showSearch && (
            <div className={cn('relative w-full sm:w-72', !toolbar && 'sm:mr-auto')}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-cream/60">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-line text-left">
                {group.headers.map((header) => {
                  const className = (header.column.columnDef.meta as { className?: string } | undefined)?.className;
                  const sortable = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  const label = flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                      className={cn('h-10 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted', className)}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 uppercase hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                        >
                          {label}
                          {dir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  'border-b border-line/60 bg-white transition-colors last:border-0',
                  onRowClick ? 'cursor-pointer hover:bg-cream' : 'hover:bg-cream/40',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      'px-4 py-3 align-middle text-ink-2',
                      (cell.column.columnDef.meta as { className?: string } | undefined)?.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {visible === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted">
                  Nothing matches “{filter}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paged && visible > pageSize && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span aria-live="polite">
            {from}–{to} of {visible}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink hover:bg-sand disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink hover:bg-sand disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

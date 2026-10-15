'use client';

import React, { useState } from 'react';
import { ChevronDown, Wallet } from 'lucide-react';
import { Card, CardBody, EmptyState, PageHeader, QueryState, StatusBadge, formatDate, humanize } from '@/components/ui/primitives';
import { useTeacherPayslips } from '@/hooks/useTeacherPayslips';
import { formatMinorAmount, formatPeriod, Payslip } from '@/lib/api/modules/payroll-teacher';
import { cn } from '@/lib/utils';

/** `/teacher/payslips` — the teacher's own payroll entries (FR-PAY-04). */
export function PayslipsScreen() {
  const payslips = useTeacherPayslips();
  return (
    <>
      <PageHeader
        title="Payslips"
        description="Your pay for each payroll period, with the classes and adjustments behind it. Amounts are in your contracted pay currency."
      />
      <QueryState
        query={payslips}
        loadingLabel="Loading payslips…"
        empty={
          <Card>
            <EmptyState
              icon={<Wallet className="w-5 h-5" aria-hidden />}
              title="No payslips yet"
              description="Payslips appear here once the academy calculates a payroll period that includes your classes."
            />
          </Card>
        }
      >
        {(rows) => (
          <ul className="space-y-3">
            {rows.map((p) => (
              <PayslipCard key={p.id} payslip={p} />
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}

function PayslipCard({ payslip }: { payslip: Payslip }) {
  const [open, setOpen] = useState(false);
  const panelId = `payslip-${payslip.id}-lines`;
  return (
    <li>
      <Card>
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{formatPeriod(payslip.period)}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <StatusBadge status={payslip.status} />
              {payslip.paidAt && <span className="text-[11px] text-muted">Paid {formatDate(payslip.paidAt)}</span>}
              {payslip.payoutReference && <span className="text-[11px] text-muted">Ref {payslip.payoutReference}</span>}
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 text-right">
            <Amount label="Gross" minor={payslip.grossMinor} />
            <Amount label="Deductions" minor={payslip.deductionsMinor} />
            <Amount label="Bonuses" minor={payslip.bonusesMinor} />
            <Amount label="Net" minor={payslip.netMinor} strong />
          </dl>
        </div>
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="w-full flex items-center justify-between px-4 sm:px-5 py-2.5 text-xs font-semibold text-ink-2 hover:bg-cream cursor-pointer rounded-b-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {payslip.lines.length} line item{payslip.lines.length === 1 ? '' : 's'}
            <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          {open && (
            <CardBody className="pt-0">
              <div id={panelId} className="overflow-x-auto">
                {payslip.lines.length === 0 ? (
                  <p className="text-xs text-muted py-2">No line items on this payslip.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left">
                        <th scope="col" className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Item</th>
                        <th scope="col" className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Note</th>
                        <th scope="col" className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslip.lines.map((line, i) => (
                        <tr key={`${line.classId ?? 'line'}-${i}`} className="border-b border-line/60 last:border-0">
                          <td className="py-2 pr-3 text-ink">{humanize(line.kind)}</td>
                          <td className="py-2 pr-3 text-ink-2">{line.note ?? '—'}</td>
                          <td className={cn('py-2 text-right tabular-nums', line.amountMinor < 0 ? 'text-red' : 'text-ink')}>
                            {formatMinorAmount(line.amountMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardBody>
          )}
        </div>
      </Card>
    </li>
  );
}

function Amount({ label, minor, strong }: { label: string; minor: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-base font-semibold text-ink' : 'text-sm text-ink-2')}>{formatMinorAmount(minor)}</dd>
    </div>
  );
}

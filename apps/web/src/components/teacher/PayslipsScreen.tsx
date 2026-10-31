'use client';

import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Card, CardBody, DataTable, EmptyState, Modal, PageHeader, QueryState, StatusBadge, formatDate, humanize } from '@/components/ui/primitives';
import { useTeacherPayslips } from '@/hooks/useTeacherPayslips';
import { formatMinorAmount, formatPeriod, Payslip } from '@/lib/api/modules/payroll-teacher';
import { cn } from '@/lib/utils';

/** `/teacher/payslips` — the teacher's own payroll entries (FR-PAY-04). */
export function PayslipsScreen() {
  const payslips = useTeacherPayslips();
  const [open, setOpen] = useState<Payslip | null>(null);
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
          <Card>
            <CardBody className="pt-5">
              <DataTable
                rows={rows}
                rowKey={(p) => p.id}
                onRowClick={setOpen}
                columns={[
                  {
                    key: 'period',
                    header: 'Period',
                    sortValue: (p) => p.period.startsOn,
                    render: (p) => <span className="font-medium text-ink">{formatPeriod(p.period)}</span>,
                  },
                  { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} />, sortValue: (p) => p.status },
                  { key: 'gross', header: 'Gross', className: 'text-right tabular-nums', render: (p) => formatMinorAmount(p.grossMinor), sortValue: (p) => p.grossMinor },
                  { key: 'deductions', header: 'Deductions', className: 'text-right tabular-nums', render: (p) => formatMinorAmount(p.deductionsMinor), sortValue: (p) => p.deductionsMinor },
                  { key: 'bonuses', header: 'Bonuses', className: 'text-right tabular-nums', render: (p) => formatMinorAmount(p.bonusesMinor), sortValue: (p) => p.bonusesMinor },
                  {
                    key: 'net',
                    header: 'Net',
                    className: 'text-right tabular-nums',
                    sortValue: (p) => p.netMinor,
                    render: (p) => <span className="font-semibold text-ink">{formatMinorAmount(p.netMinor)}</span>,
                  },
                  { key: 'paid', header: 'Paid', render: (p) => (p.paidAt ? formatDate(p.paidAt) : '—'), sortValue: (p) => p.paidAt ?? '' },
                ]}
              />
              <p className="mt-2 text-[11px] text-muted">Click a payslip to see the classes and adjustments behind it.</p>
            </CardBody>
          </Card>
        )}
      </QueryState>
      {open && <PayslipDetail payslip={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The line items behind one payslip. */
function PayslipDetail({ payslip, onClose }: { payslip: Payslip; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={formatPeriod(payslip.period)}
      description={payslip.payoutReference ? `Payout reference ${payslip.payoutReference}` : undefined}
    >
      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Amount label="Gross" minor={payslip.grossMinor} />
        <Amount label="Deductions" minor={payslip.deductionsMinor} />
        <Amount label="Bonuses" minor={payslip.bonusesMinor} />
        <Amount label="Net" minor={payslip.netMinor} strong />
      </dl>
      {payslip.lines.length === 0 ? (
        <p className="text-xs text-muted">No line items on this payslip.</p>
      ) : (
        <DataTable
          rows={payslip.lines.map((line, i) => ({ ...line, key: `${line.classId ?? 'line'}-${i}` }))}
          rowKey={(l) => l.key}
          columns={[
            { key: 'item', header: 'Item', render: (l) => humanize(l.kind) },
            { key: 'note', header: 'Note', render: (l) => l.note ?? '—' },
            {
              key: 'amount',
              header: 'Amount',
              className: 'text-right tabular-nums',
              sortValue: (l) => l.amountMinor,
              render: (l) => <span className={l.amountMinor < 0 ? 'text-red' : 'text-ink'}>{formatMinorAmount(l.amountMinor)}</span>,
            },
          ]}
        />
      )}
    </Modal>
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

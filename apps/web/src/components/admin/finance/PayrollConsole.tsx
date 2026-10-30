'use client';

import React, { useState } from 'react';
import { Calculator, CalendarPlus, CheckCircle2 } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  QueryState,
  Select,
  StatTile,
  StatusBadge,
  TextInput,
  UiButton,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useCalculatePayroll,
  useMarkPayrollEntryPaid,
  useOpenPayrollPeriod,
  usePayRates,
  usePayrollPeriods,
  usePayrollReport,
} from '@/hooks/useFinance';
import {
  formatPeriodDate,
  PayrollReport,
  validatePayoutReference,
  validatePeriod,
} from '@/lib/api/modules/payroll-admin';
import { ConfirmDialog, CopyId, useAdminRoles } from '../system/shared';

/**
 * Payroll amounts carry no currency in the report. When every active pay rate shares
 * one currency we format with it; otherwise amounts are shown in minor units.
 */
function makeFormatter(currency: string | null) {
  return (minor: number) => (currency ? formatMoney(minor, currency) : `${minor.toLocaleString()} (minor units)`);
}

/** /admin/payroll — rates, periods, calculation, report and payouts (FR-PAY-01..04). */
export function PayrollConsole() {
  const { isSuperAdmin } = useAdminRoles();
  const rates = usePayRates();
  const [periodId, setPeriodId] = useState<string | null>(null);

  const rateCurrencies = [...new Set((rates.data ?? []).map((r) => r.currency))];
  const currency = rateCurrencies.length === 1 ? rateCurrencies[0] : null;
  const fmt = makeFormatter(currency);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Teacher payroll"
        description="Open a period, calculate pay from completed classes, review the report and record payouts."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <Card>
          <CardHeader title="Pay rates" description="Active rates applied per completed class." />
          <CardBody className="px-0 sm:px-5">
            <QueryState query={rates} empty={<EmptyState title="No active pay rates" />}>
              {(rows) => (
                <DataTable
                  rows={rows}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: 'name', header: 'Rate', render: (r) => <span className="font-medium text-ink">{r.name}</span> },
                    { key: 'type', header: 'Class type', render: (r) => (r.classType ? humanize(r.classType) : 'Any') },
                    {
                      key: 'amount',
                      header: 'Per class',
                      className: 'text-right tabular-nums whitespace-nowrap',
                      render: (r) => formatMoney(r.ratePerClassMinor, r.currency),
                    },
                    { key: 'from', header: 'Effective from', render: (r) => formatPeriodDate(r.effectiveFrom) },
                  ]}
                />
              )}
            </QueryState>
          </CardBody>
        </Card>
        {isSuperAdmin ? (
          <OpenPeriodCard onOpened={setPeriodId} />
        ) : (
          <Alert tone="neutral">Only a super admin can open a new pay period. Choose one below to see its report.</Alert>
        )}
      </div>

      <div className="mt-6">
        <PeriodChooser selected={periodId} onSelect={setPeriodId} />
      </div>

      {periodId && (
        <div className="mt-6">
          <PeriodReport periodId={periodId} fmt={fmt} canManage={isSuperAdmin} currencyKnown={Boolean(currency)} />
        </div>
      )}
    </>
  );
}

function OpenPeriodCard({ onOpened }: { onOpened: (id: string) => void }) {
  const toast = useToast();
  const open = useOpenPayrollPeriod();
  const [form, setForm] = useState({ startsOn: '', endsOn: '' });
  const [errors, setErrors] = useState<Partial<Record<'startsOn' | 'endsOn', string>>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validatePeriod(form.startsOn, form.endsOn);
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    open.mutate(form, {
      onSuccess: (period) => {
        toast.success(`Payroll period ${formatPeriodDate(period.startsOn)} – ${formatPeriodDate(period.endsOn)} opened`);
        setForm({ startsOn: '', endsOn: '' });
        onOpened(period.id);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader title="Open a period" description="Start and end dates are inclusive calendar dates." />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-3" aria-label="Open a payroll period">
          <Field label="Starts on" htmlFor="period-start" required error={errors.startsOn}>
            <TextInput
              id="period-start"
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
              aria-invalid={Boolean(errors.startsOn)}
            />
          </Field>
          <Field label="Ends on" htmlFor="period-end" required error={errors.endsOn}>
            <TextInput
              id="period-end"
              type="date"
              value={form.endsOn}
              onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))}
              aria-invalid={Boolean(errors.endsOn)}
            />
          </Field>
          <UiButton type="submit" loading={open.isPending} icon={<CalendarPlus className="w-4 h-4" aria-hidden />} className="w-full">
            Open period
          </UiButton>
        </form>
      </CardBody>
    </Card>
  );
}

/** Every pay period, newest first; choosing one opens its report. */
function PeriodChooser({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const periods = usePayrollPeriods();
  return (
    <Card>
      <CardHeader title="Pay periods" description="Choose a period to see what each teacher is owed and record payouts." />
      <CardBody>
        <QueryState query={periods} empty={<EmptyState title="No pay periods yet" />} isEmpty={(d) => d.length === 0}>
          {(rows) => (
            <div className="max-w-md">
              <Field label="Period" htmlFor="pay-period">
                <Select id="pay-period" value={selected ?? ''} searchable onChange={(e) => e.target.value && onSelect(e.target.value)}>
                  <option value="">Select a period</option>
                  {rows.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatPeriodDate(p.startsOn)} – {formatPeriodDate(p.endsOn)} · {humanize(p.status)} · {p._count.entries} teachers
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function PeriodReport({
  periodId,
  fmt,
  canManage,
  currencyKnown,
}: {
  periodId: string;
  fmt: (minor: number) => string;
  canManage: boolean;
  currencyKnown: boolean;
}) {
  const query = usePayrollReport(periodId);
  return (
    <Card>
      <QueryState query={query} loadingLabel="Loading payroll report…">
        {(report) => <ReportBody report={report} fmt={fmt} canManage={canManage} currencyKnown={currencyKnown} />}
      </QueryState>
    </Card>
  );
}

function ReportBody({
  report,
  fmt,
  canManage,
  currencyKnown,
}: {
  report: PayrollReport;
  fmt: (minor: number) => string;
  canManage: boolean;
  currencyKnown: boolean;
}) {
  const toast = useToast();
  const calculate = useCalculatePayroll();
  const markPaid = useMarkPayrollEntryPaid();
  const [confirmCalc, setConfirmCalc] = useState(false);
  const [payEntry, setPayEntry] = useState<PayrollReport['entries'][number] | null>(null);
  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState<string | null>(null);

  const { period, totals } = report;

  const runCalculate = () =>
    calculate.mutate(period.id, {
      onSuccess: (res) => {
        toast.success(`Calculated pay for ${res.teachers} teacher${res.teachers === 1 ? '' : 's'} from ${res.classesScanned} classes`);
        setConfirmCalc(false);
      },
      onError: (err) => {
        toast.error(err);
        setConfirmCalc(false);
      },
    });

  const submitPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payEntry) return;
    const err = validatePayoutReference(reference);
    setRefError(err);
    if (err) return;
    markPaid.mutate(
      { entryId: payEntry.id, payoutReference: reference.trim() },
      {
        onSuccess: () => {
          toast.success(`Marked ${payEntry.teacher} as paid`);
          setPayEntry(null);
          setReference('');
        },
        onError: (error) => toast.error(error),
      },
    );
  };

  return (
    <>
      <CardHeader
        title={`Period ${formatPeriodDate(period.startsOn)} – ${formatPeriodDate(period.endsOn)}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={period.status} /> <CopyId value={period.id} label="period reference" />
          </span>
        }
        action={
          canManage && period.status === 'OPEN' ? (
            <UiButton icon={<Calculator className="w-4 h-4" aria-hidden />} onClick={() => setConfirmCalc(true)} loading={calculate.isPending}>
              Calculate
            </UiButton>
          ) : undefined
        }
      />
      <CardBody className="space-y-5">
        {!currencyKnown && (
          <Alert tone="warning">The report does not state a currency and pay rates use more than one, so amounts are shown in minor units.</Alert>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Gross" value={fmt(totals.gross)} />
          <StatTile label="Deductions" value={fmt(totals.deductions)} />
          <StatTile label="Bonuses" value={fmt(totals.bonuses)} />
          <StatTile label="Net" value={fmt(totals.net)} />
        </div>
        <DataTable
          rows={report.entries}
          rowKey={(e) => e.id}
          empty={
            <EmptyState
              title={period.status === 'OPEN' ? 'Not calculated yet' : 'No entries'}
              description={
                period.status === 'OPEN'
                  ? 'Calculate the period to create one entry per teacher with completed, chargeable classes.'
                  : 'No teacher had chargeable classes in this period.'
              }
            />
          }
          columns={[
            { key: 'teacher', header: 'Teacher', render: (e) => <span className="font-medium text-ink">{e.teacher}</span> },
            { key: 'lines', header: 'Lines', className: 'tabular-nums', render: (e) => e.lineCount },
            { key: 'gross', header: 'Gross', className: 'text-right tabular-nums whitespace-nowrap', render: (e) => fmt(e.grossMinor) },
            { key: 'net', header: 'Net', className: 'text-right tabular-nums whitespace-nowrap', render: (e) => fmt(e.netMinor) },
            { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
            ...(canManage
              ? [
                  {
                    key: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    className: 'text-right',
                    render: (e: PayrollReport['entries'][number]) =>
                      e.status === 'PAID' ? (
                        <span className="text-[11px] text-muted">Paid</span>
                      ) : (
                        <UiButton
                          size="sm"
                          variant="secondary"
                          icon={<CheckCircle2 className="w-3.5 h-3.5" aria-hidden />}
                          onClick={() => {
                            setPayEntry(e);
                            setReference('');
                            setRefError(null);
                          }}
                          aria-label={`Mark ${e.teacher} paid`}
                        >
                          Mark paid
                        </UiButton>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </CardBody>

      <ConfirmDialog
        open={confirmCalc}
        title="Calculate this payroll period?"
        description="A period is calculated once. Afterwards it is locked and cannot be recalculated."
        confirmLabel="Calculate pay"
        tone="primary"
        pending={calculate.isPending}
        onConfirm={runCalculate}
        onClose={() => setConfirmCalc(false)}
      />

      <Modal
        open={payEntry !== null}
        onClose={() => (markPaid.isPending ? undefined : setPayEntry(null))}
        title="Record payout"
        description={payEntry ? `${payEntry.teacher} · net ${fmt(payEntry.netMinor)}` : undefined}
        size="sm"
      >
        <form onSubmit={submitPaid} noValidate className="space-y-4" aria-label="Record payout">
          <Field label="Payout reference" htmlFor="payout-ref" required error={refError} hint="Bank or provider transfer reference (max 120 characters).">
            <TextInput
              id="payout-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={120}
              aria-invalid={Boolean(refError)}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <UiButton variant="secondary" onClick={() => setPayEntry(null)} disabled={markPaid.isPending}>
              Cancel
            </UiButton>
            <UiButton type="submit" loading={markPaid.isPending}>
              Mark as paid
            </UiButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

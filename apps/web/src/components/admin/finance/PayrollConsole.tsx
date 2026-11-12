'use client';

import React, { useState } from 'react';
import { ALL, FilterBar, FilterSelect, optionsFrom } from '@/components/ui/FilterSelect';
import { Calculator, CalendarPlus, CheckCircle2, Download, PlusSquare as PlusMinus } from 'lucide-react';
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
  TextArea,
  TextInput,
  UiButton,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMyPermissions } from '@/hooks/usePermissions';
import { PayRatesManager } from './PayRatesManager';
import {
  useAdjustPayrollEntry,
  useCalculatePayroll,
  useExportPayroll,
  useMarkPayrollEntryPaid,
  useOpenPayrollPeriod,
  usePayRates,
  usePayrollPeriods,
  usePayrollReport,
} from '@/hooks/useFinance';
import {
  formatPeriodDate,
  PayrollAdjustmentKind,
  PayrollReport,
  validateAdjustment,
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
  const { can } = useMyPermissions();
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
        <PayRatesManager canManage={can('payroll.rates.manage')} />
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
          <PeriodReport
            periodId={periodId}
            fmt={fmt}
            canManage={isSuperAdmin}
            canExport={can('payroll.export')}
            canAdjust={can('payroll.adjust')}
            currency={currency}
            currencyKnown={Boolean(currency)}
          />
        </div>
      )}
    </>
  );
}

/** Teachers are paid every two weeks: a period is 14 calendar days, end date inclusive. */
const PERIOD_DAYS = 14;

/** `YYYY-MM-DD` plus `days`, in calendar days (UTC, so no daylight-saving drift). */
function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The two weeks after the latest period, or starting today when there is none. */
function nextPeriod(periods: Array<{ endsOn: string }> | undefined) {
  const latest = (periods ?? []).reduce<string | null>((max, p) => (!max || p.endsOn > max ? p.endsOn : max), null);
  const startsOn = latest ? addDays(latest, 1) : new Date().toISOString().slice(0, 10);
  return { startsOn, endsOn: addDays(startsOn, PERIOD_DAYS - 1) };
}

function OpenPeriodCard({ onOpened }: { onOpened: (id: string) => void }) {
  const toast = useToast();
  const open = useOpenPayrollPeriod();
  const periods = usePayrollPeriods();
  // Until someone edits it, the form offers the next two-week period.
  const [edited, setEdited] = useState<{ startsOn: string; endsOn: string } | null>(null);
  const form = edited ?? nextPeriod(periods.data);
  const setForm = (update: (f: { startsOn: string; endsOn: string }) => { startsOn: string; endsOn: string }) =>
    setEdited(update(form));
  const [errors, setErrors] = useState<Partial<Record<'startsOn' | 'endsOn', string>>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validatePeriod(form.startsOn, form.endsOn);
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    open.mutate(form, {
      onSuccess: (period) => {
        toast.success(`Payroll period ${formatPeriodDate(period.startsOn)} – ${formatPeriodDate(period.endsOn)} opened`);
        setEdited(null);
        onOpened(period.id);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader
        title="Open a period"
        description="Teachers are paid every two weeks. The next 14 days are filled in; dates are inclusive."
      />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-3" aria-label="Open a payroll period">
          <Field label="Starts on" htmlFor="period-start" required error={errors.startsOn}>
            <TextInput
              id="period-start"
              type="date"
              value={form.startsOn}
              // A new start moves the end with it, keeping the period two weeks long.
              onChange={(e) => {
                const startsOn = e.target.value;
                setForm(() => ({ startsOn, endsOn: startsOn ? addDays(startsOn, PERIOD_DAYS - 1) : '' }));
              }}
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
  canExport,
  canAdjust,
  currency,
  currencyKnown,
}: {
  periodId: string;
  fmt: (minor: number) => string;
  canManage: boolean;
  canExport: boolean;
  canAdjust: boolean;
  currency: string | null;
  currencyKnown: boolean;
}) {
  const query = usePayrollReport(periodId);
  return (
    <section>
      <QueryState query={query} loadingLabel="Loading payroll report…">
        {(report) => (
          <ReportBody
            report={report}
            fmt={fmt}
            canManage={canManage}
            canExport={canExport}
            canAdjust={canAdjust}
            currency={currency}
            currencyKnown={currencyKnown}
          />
        )}
      </QueryState>
    </section>
  );
}

function ReportBody({
  report,
  fmt,
  canManage,
  canExport,
  canAdjust,
  currency,
  currencyKnown,
}: {
  report: PayrollReport;
  fmt: (minor: number) => string;
  canManage: boolean;
  canExport: boolean;
  canAdjust: boolean;
  currency: string | null;
  currencyKnown: boolean;
}) {
  const toast = useToast();
  const calculate = useCalculatePayroll();
  const markPaid = useMarkPayrollEntryPaid();
  const exportCsv = useExportPayroll();
  const [adjustEntry, setAdjustEntry] = useState<PayrollReport['entries'][number] | null>(null);
  const [confirmCalc, setConfirmCalc] = useState(false);
  const [payEntry, setPayEntry] = useState<PayrollReport['entries'][number] | null>(null);
  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState<string | null>(null);
  const [teacherFilter, setTeacherFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const { period, totals } = report;
  const entries = report.entries.filter(
    (e) => (teacherFilter === ALL || e.teacher === teacherFilter) && (statusFilter === ALL || e.status === statusFilter),
  );

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
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink font-sans">
            {`Period ${formatPeriodDate(period.startsOn)} – ${formatPeriodDate(period.endsOn)}`}
          </h2>
          <div className="text-xs text-muted mt-1 inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={period.status} /> <CopyId value={period.id} label="period reference" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && period.status !== 'OPEN' ? (
            <UiButton
              variant="secondary"
              icon={<Download className="w-4 h-4" aria-hidden />}
              loading={exportCsv.isPending}
              onClick={() =>
                exportCsv.mutate(period.id, {
                  onSuccess: () =>
                    toast.success(
                      period.status === 'CALCULATED' ? 'Exported. The period is now closed to adjustments.' : 'Exported',
                    ),
                  onError: (err) => toast.error(err),
                })
              }
            >
              Export CSV
            </UiButton>
          ) : null}
          {canManage && period.status === 'OPEN' ? (
            <UiButton icon={<Calculator className="w-4 h-4" aria-hidden />} onClick={() => setConfirmCalc(true)} loading={calculate.isPending}>
              Calculate
            </UiButton>
          ) : null}
        </div>
      </div>
      <div className="space-y-5">
        {!currencyKnown && (
          <Alert tone="warning">The report does not state a currency and pay rates use more than one, so amounts are shown in minor units.</Alert>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Gross" value={fmt(totals.gross)} />
          <StatTile label="Deductions" value={fmt(totals.deductions)} />
          <StatTile label="Bonuses" value={fmt(totals.bonuses)} />
          <StatTile label="Net" value={fmt(totals.net)} />
        </div>
        {report.entries.length > 1 && (
          <FilterBar>
            <FilterSelect
              id="pay-teacher"
              label="Teacher"
              value={teacherFilter}
              onChange={setTeacherFilter}
              options={optionsFrom(report.entries, (e) => ({ value: e.teacher, label: e.teacher }), 'All teachers')}
            />
            <FilterSelect
              id="pay-status"
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={optionsFrom(report.entries, (e) => ({ value: e.status, label: humanize(e.status) }), 'All statuses')}
            />
          </FilterBar>
        )}
        <DataTable
          rows={entries}
          rowKey={(e) => e.id}
          empty={
            report.entries.length > 0 ? (
              <EmptyState title="No entries match these filters" />
            ) : (
            <EmptyState
              title={period.status === 'OPEN' ? 'Not calculated yet' : 'No entries'}
              description={
                period.status === 'OPEN'
                  ? 'Calculate the period to create one entry per teacher with completed, chargeable classes.'
                  : 'No teacher had chargeable classes in this period.'
              }
            />
            )
          }
          columns={[
            { key: 'teacher', header: 'Teacher', render: (e) => <span className="font-medium text-ink">{e.teacher}</span> },
            { key: 'lines', header: 'Lines', className: 'tabular-nums', render: (e) => e.lineCount },
            { key: 'gross', header: 'Gross', className: 'text-right tabular-nums whitespace-nowrap', render: (e) => fmt(e.grossMinor) },
            { key: 'net', header: 'Net', className: 'text-right tabular-nums whitespace-nowrap', render: (e) => fmt(e.netMinor) },
            { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
            ...(canManage || canAdjust
              ? [
                  {
                    key: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    className: 'text-right',
                    render: (e: PayrollReport['entries'][number]) =>
                      e.status === 'PAID' ? (
                        <span className="text-[11px] text-muted">Paid</span>
                      ) : (
                        <div className="inline-flex gap-1">
                          {canAdjust && period.status === 'CALCULATED' && (
                            <UiButton
                              size="sm"
                              variant="secondary"
                              icon={<PlusMinus className="w-3.5 h-3.5" aria-hidden />}
                              onClick={() => setAdjustEntry(e)}
                              aria-label={`Add a bonus or deduction for ${e.teacher}`}
                            >
                              Adjust
                            </UiButton>
                          )}
                          {canManage && (
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
                          )}
                        </div>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </div>

      {adjustEntry && (
        <AdjustmentModal entry={adjustEntry} currency={currency} onClose={() => setAdjustEntry(null)} />
      )}

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

/** Manual bonus or deduction on one teacher's payslip; the reason is shown on the payslip. */
function AdjustmentModal({
  entry,
  currency,
  onClose,
}: {
  entry: PayrollReport['entries'][number];
  currency: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const adjust = useAdjustPayrollEntry();
  const [kind, setKind] = useState<PayrollAdjustmentKind>('BONUS');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateAdjustment(amount, reason);
    setErrors(next);
    if (next.amount || next.reason) return toast.error(next.amount ?? next.reason ?? 'Please fix the highlighted fields');
    adjust.mutate(
      { entryId: entry.id, kind, amountMinor: Math.round(Number(amount) * 100), reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`${kind === 'BONUS' ? 'Bonus' : 'Deduction'} added for ${entry.teacher}`);
          onClose();
        },
        // 409 once the period is closed or the entry is paid; the report refreshes either way.
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={() => (adjust.isPending ? undefined : onClose())}
      title="Bonus or deduction"
      description={`${entry.teacher}${currency ? ` · amounts in ${currency}` : ''}`}
      size="sm"
    >
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Payroll adjustment">
        <Field label="Type" htmlFor="adj-kind">
          <Select id="adj-kind" value={kind} onChange={(e) => setKind(e.target.value as PayrollAdjustmentKind)}>
            <option value="BONUS">Bonus (adds to pay)</option>
            <option value="DEDUCTION">Deduction (subtracts from pay)</option>
          </Select>
        </Field>
        <Field label="Amount" htmlFor="adj-amount" required error={errors.amount} hint="A positive number; the type decides the direction.">
          <TextInput id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason" htmlFor="adj-reason" required error={errors.reason} hint="Shown to the teacher on their payslip.">
          <TextArea id="adj-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" loading={adjust.isPending}>
            Add {kind === 'BONUS' ? 'bonus' : 'deduction'}
          </UiButton>
        </div>
      </form>
    </Modal>
  );
}

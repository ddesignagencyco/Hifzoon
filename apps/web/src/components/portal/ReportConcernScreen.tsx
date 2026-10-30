'use client';

import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  StatusBadge,
  TextArea,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMyReports, useReportConcern } from '@/hooks/useCases';
import {
  CaseType,
  REPORT_MAX_LENGTH,
  ReportReceipt,
  validateReport,
} from '@/lib/api/modules/cases';
import { cn } from '@/lib/utils';

const TYPE_COPY: Record<CaseType, { title: string; hint: string }> = {
  SAFEGUARDING: {
    title: 'A child may be at risk',
    hint: 'Anything that makes you worried about a child’s safety or wellbeing. Our safeguarding lead is alerted straight away.',
  },
  COMPLAINT: {
    title: 'A complaint about a class or the service',
    hint: 'Teaching, conduct, scheduling or billing problems you want the academy to look into.',
  },
};

/** "Report a concern" (M56) for guardians, teachers and students, with their past reports. */
export function ReportConcernScreen() {
  const toast = useToast();
  const report = useReportConcern();
  const mine = useMyReports();
  const [type, setType] = useState<CaseType>('SAFEGUARDING');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { type, description };
    const problem = validateReport(input);
    setError(problem);
    if (problem) return;
    report.mutate(input, {
      onSuccess: (r) => {
        setReceipt(r);
        setDescription('');
        toast.success(`Report received. Reference ${r.reference}.`);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <>
      <PageHeader
        title="Report a concern"
        description="Tell us privately about a safeguarding worry or a complaint. Only the academy's safeguarding and quality team can read it."
      />
      <Alert tone="warning" title="If a child is in immediate danger" className="mb-6">
        Call your local emergency number first, then report it here.
      </Alert>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <Card>
          <CardHeader title="What would you like to report?" />
          <CardBody>
            <form onSubmit={submit} noValidate className="space-y-4">
              <fieldset className="grid sm:grid-cols-2 gap-3">
                <legend className="sr-only">Type of concern</legend>
                {(['SAFEGUARDING', 'COMPLAINT'] as CaseType[]).map((t) => (
                  <label
                    key={t}
                    className={cn(
                      'rounded-xl border p-3 cursor-pointer transition-colors',
                      type === t ? 'border-green-800 bg-green-50' : 'border-line hover:bg-sand',
                    )}
                  >
                    <input type="radio" name="concern-type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                    <span className="block text-sm font-semibold text-ink">{TYPE_COPY[t].title}</span>
                    <span className="block text-xs text-muted mt-1">{TYPE_COPY[t].hint}</span>
                  </label>
                ))}
              </fieldset>
              <Field
                label="What happened?"
                htmlFor="concern-description"
                required
                hint="Include when it happened, who was involved and the class if you know it."
                error={error}
              >
                <TextArea
                  id="concern-description"
                  rows={7}
                  value={description}
                  maxLength={REPORT_MAX_LENGTH}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <div className="flex justify-end">
                <UiButton type="submit" loading={report.isPending} icon={<ShieldAlert className="w-4 h-4" aria-hidden />}>
                  Send report
                </UiButton>
              </div>
            </form>
            {receipt && (
              <Alert tone="success" title={`Received · reference ${receipt.reference}`} className="mt-4">
                Logged {formatDateTime(receipt.receivedAt)}. Keep this reference if you need to follow up.
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your reports" description="Reference and status only." />
          <CardBody>
            <QueryState query={mine} loadingLabel="Loading your reports…" empty={<EmptyState title="No reports yet" />}>
              {(rows) => (
                <ul className="divide-y divide-line">
                  {rows.map((r) => (
                    <li key={r.reference} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-semibold text-ink">{r.reference}</p>
                        <p className="text-[11px] text-muted">
                          {humanize(r.type)} · {formatDateTime(r.receivedAt)}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

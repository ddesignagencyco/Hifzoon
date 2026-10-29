'use client';

import React, { useMemo, useRef, useState } from 'react';
import { CalendarClock, CreditCard, Receipt, Wallet } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  QueryState,
  Select,
  StatTile,
  StatusBadge,
  UiButton,
  formatDate,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey } from '@/lib/api/http';
import {
  useBillingFamilies,
  useBillingPlans,
  useCheckout,
  useFamilyBilling,
  useResumeSubscription,
  useSubscribe,
} from '@/hooks/useBilling';
import {
  BillingFamily,
  BillingPlan,
  FamilySubscription,
  Invoice,
  canCancel,
  canPause,
  canResume,
  isLiveSubscription,
  isPayable,
  isSafeCheckoutUrl,
  outstandingMinor,
  PlanPrice,
  periodLabel,
} from '@/lib/api/modules/billing-family';
import { usePlanPrices } from '@/hooks/usePlanPrices';
import { TeacherTierBadge } from '@/components/shared/TeacherTierBadge';
import { CancelSubscriptionModal, PauseSubscriptionModal } from './SubscriptionModals';

/** `/parent/billing` — subscriptions, plan choice, invoices and checkout (FR-BIL-01..07). */
export function FamilyBillingScreen() {
  const families = useBillingFamilies();
  const [familyChoice, setFamilyChoice] = useState('');

  const family: BillingFamily | undefined =
    families.data?.find((f) => f.id === familyChoice) ?? families.data?.[0];

  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Billing"
        description="Your plan, upcoming billing and invoices. Prices are shown in your family's billing currency."
        actions={
          families.data && families.data.length > 1 ? (
            <div className="w-56">
              <label htmlFor="billing-family" className="sr-only">
                Family
              </label>
              <Select id="billing-family" value={family?.id ?? ''} onChange={(e) => setFamilyChoice(e.target.value)}>
                {families.data.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />
      {families.isLoading ? (
        <LoadingState label="Loading your family…" />
      ) : families.isError ? (
        <Card>
          <ErrorState error={families.error} onRetry={() => families.refetch()} />
        </Card>
      ) : !family ? (
        <Card>
          <EmptyState
            title="No family account yet"
            description="Billing appears here once your family account is set up."
          />
        </Card>
      ) : (
        <FamilyBilling family={family} />
      )}
    </>
  );
}

function FamilyBilling({ family }: { family: BillingFamily }) {
  const billing = useFamilyBilling();
  const plans = useBillingPlans();

  const subscriptions = useMemo(
    () => (billing.data?.subscriptions ?? []).filter((s) => s.familyId === family.id),
    [billing.data, family.id],
  );
  const invoices = useMemo(
    () => (billing.data?.invoices ?? []).filter((i) => i.familyId === family.id),
    [billing.data, family.id],
  );
  const live = subscriptions.filter(isLiveSubscription);
  const nextBilling = live
    .filter((s) => s.status === 'ACTIVE' && !s.cancelAtPeriodEnd && s.currentPeriodEnd)
    .map((s) => s.currentPeriodEnd as string)
    .sort()[0];
  const outstanding = outstandingMinor(invoices, family.currency);
  const priceCurrencies = useMemo(
    () => [...new Set([family.currency, ...subscriptions.map((s) => s.currency)])],
    [family.currency, subscriptions],
  );
  const prices = usePlanPrices((plans.data ?? []).map((p) => p.id), priceCurrencies, plans.isSuccess);

  return (
    <div className="space-y-6">
      {billing.isSuccess && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile
            label="Active plans"
            value={live.length}
            icon={<CreditCard className="w-4 h-4" aria-hidden />}
            hint={live.length ? live.map((s) => s.plan.name).join(', ') : 'No active subscription'}
          />
          <StatTile
            label="Next billing date"
            value={nextBilling ? formatDate(nextBilling) : '—'}
            icon={<CalendarClock className="w-4 h-4" aria-hidden />}
            hint={nextBilling ? 'End of the current period' : 'Nothing scheduled'}
          />
          <StatTile
            label="Outstanding"
            value={formatMoney(outstanding, family.currency)}
            icon={<Wallet className="w-4 h-4" aria-hidden />}
            hint={outstanding > 0 ? 'Open or failed invoices' : 'All invoices settled'}
          />
        </div>
      )}

      <Card>
        <CardHeader title="Subscriptions" description={`Billed in ${family.currency}`} />
        <CardBody>
          <QueryState
            query={{ ...billing, data: billing.data ? subscriptions : undefined }}
            loadingLabel="Loading subscriptions…"
            empty={
              <EmptyState
                title="No subscription yet"
                description="Choose a plan below to start regular classes."
              />
            }
          >
            {(rows) => (
              <ul className="space-y-3">
                {rows.map((s) => (
                  <SubscriptionRow
                    key={s.id}
                    subscription={s}
                    plan={plans.data?.find((p) => p.id === s.planId)}
                    price={prices.get(s.planId, s.currency)}
                  />
                ))}
              </ul>
            )}
          </QueryState>
        </CardBody>
      </Card>

      <PlansCard
        family={family}
        plansQuery={plans}
        priceOf={(planId) => prices.get(planId, family.currency)}
        hasLiveSubscription={live.length > 0}
      />

      <InvoicesCard query={billing} invoices={invoices} />
    </div>
  );
}

// ── Subscriptions ────────────────────────────────────────────────────────────

function SubscriptionRow({
  subscription: s,
  plan,
  price,
}: {
  subscription: FamilySubscription;
  plan?: BillingPlan;
  price?: PlanPrice | null;
}) {
  const [modal, setModal] = useState<'cancel' | 'pause' | null>(null);
  const resume = useResumeSubscription();
  const toast = useToast();

  const doResume = () =>
    resume.mutate(s.id, {
      onSuccess: () => toast.success(`${s.plan.name} resumed`),
      onError: (error) => toast.error(error),
    });

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{s.plan.name}</p>
            <StatusBadge status={s.status} />
            {plan?.tier && <TeacherTierBadge tier={plan.tier} size="sm" />}
            {s.cancelAtPeriodEnd && s.status !== 'CANCELLED' && <Badge tone="amber">Ends at period end</Badge>}
          </div>
          <p className="text-xs text-muted mt-1">
            {s.plan.classesPerWeek} classes per week
            {price && plan ? ` · ${formatMoney(price.amountMinor, s.currency)} / ${periodLabel(plan.billingPeriod)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canResume(s) && (
            <UiButton size="sm" onClick={doResume} loading={resume.isPending}>
              Resume
            </UiButton>
          )}
          {canPause(s) && (
            <UiButton size="sm" variant="secondary" onClick={() => setModal('pause')}>
              Pause
            </UiButton>
          )}
          {canCancel(s) && (
            <UiButton size="sm" variant="ghost" className="text-red" onClick={() => setModal('cancel')}>
              Cancel
            </UiButton>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Current period</dt>
          <dd className="text-ink-2">
            {s.currentPeriodStart ? `${formatDate(s.currentPeriodStart)} – ${formatDate(s.currentPeriodEnd)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            {s.status === 'CANCELLED' ? 'Ended' : s.cancelAtPeriodEnd ? 'Ends on' : 'Next billing date'}
          </dt>
          <dd className="text-ink-2">
            {s.status === 'CANCELLED' ? formatDate(s.updatedAt) : formatDate(s.currentPeriodEnd)}
          </dd>
        </div>
        {s.status === 'PAUSED' && (
          <div>
            <dt className="text-muted">Paused until</dt>
            <dd className="text-ink-2">{formatDate(s.pausedUntil)}</dd>
          </div>
        )}
      </dl>
      {s.status === 'PAST_DUE' && (
        <Alert tone="warning" className="mt-3">
          A payment for this plan failed. Pay the open invoice below to keep classes running.
        </Alert>
      )}
      {modal === 'cancel' && <CancelSubscriptionModal subscription={s} onClose={() => setModal(null)} />}
      {modal === 'pause' && <PauseSubscriptionModal subscription={s} onClose={() => setModal(null)} />}
    </li>
  );
}

// ── Plans ────────────────────────────────────────────────────────────────────

function PlansCard({
  family,
  plansQuery,
  priceOf,
  hasLiveSubscription,
}: {
  family: BillingFamily;
  plansQuery: ReturnType<typeof useBillingPlans>;
  priceOf: (planId: string) => PlanPrice | null | undefined;
  hasLiveSubscription: boolean;
}) {
  const [chosen, setChosen] = useState<{ plan: BillingPlan; price: PlanPrice } | null>(null);

  return (
    <Card>
      <CardHeader
        title={hasLiveSubscription ? 'Add a plan' : 'Choose a plan'}
        description={`Prices in ${family.currency}, billed per period.`}
      />
      <CardBody>
        <QueryState
          query={plansQuery}
          loadingLabel="Loading plans…"
          empty={<EmptyState title="No plans available" description="Please contact the academy." />}
        >
          {(plans) => (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => {
                const price = priceOf(plan.id);
                return (
                  <li key={plan.id} className="rounded-xl border border-line p-4 flex flex-col">
                    {plan.tier && (
                      <div className="mb-2">
                        <TeacherTierBadge tier={plan.tier} size="sm" />
                      </div>
                    )}
                    <p className="text-sm font-semibold text-ink">{plan.name}</p>
                    <p className="text-xs text-muted mt-1">
                      {plan.classesPerWeek} × {plan.classMinutes} min classes per week · {humanize(plan.roomType)}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-ink tabular-nums">
                      {price === undefined ? '…' : price ? formatMoney(price.amountMinor, family.currency) : '—'}
                      {price && (
                        <span className="text-xs font-normal text-muted"> / {periodLabel(plan.billingPeriod)}</span>
                      )}
                    </p>
                    {price === null && <p className="text-[11px] text-muted mt-1">Not available in {family.currency}.</p>}
                    <div className="mt-auto pt-4">
                      <UiButton
                        size="sm"
                        variant={hasLiveSubscription ? 'secondary' : 'primary'}
                        className="w-full"
                        disabled={!price}
                        onClick={() => price && setChosen({ plan, price })}
                      >
                        Subscribe
                      </UiButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </CardBody>
      {chosen && (
        <SubscribeModal
          family={family}
          plan={chosen.plan}
          price={chosen.price}
          hasLiveSubscription={hasLiveSubscription}
          onClose={() => setChosen(null)}
        />
      )}
    </Card>
  );
}

function SubscribeModal({
  family,
  plan,
  price,
  hasLiveSubscription,
  onClose,
}: {
  family: BillingFamily;
  plan: BillingPlan;
  price: PlanPrice;
  hasLiveSubscription: boolean;
  onClose: () => void;
}) {
  const subscribe = useSubscribe();
  const toast = useToast();
  // One key per "subscribe to this plan" intent; a retry from this dialog reuses it.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const confirm = () =>
    subscribe.mutate(
      { input: { familyId: family.id, planId: plan.id, currency: family.currency }, idempotencyKey },
      {
        onSuccess: (res) => {
          const invoice = res.firstInvoice;
          toast.success(
            invoice
              ? `Subscribed to ${plan.name}. Your first invoice ${invoice.number} (${formatMoney(invoice.totalMinor, invoice.currency)}) is ready — pay it in Invoices below.`
              : `Subscribed to ${plan.name}`,
          );
          onClose();
        },
        onError: (error) => toast.error(error),
      },
    );

  return (
    <Modal
      open
      size="sm"
      onClose={subscribe.isPending ? () => undefined : onClose}
      title={`Subscribe to ${plan.name}?`}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={subscribe.isPending}>
            Back
          </UiButton>
          <UiButton onClick={confirm} loading={subscribe.isPending}>
            Confirm subscription
          </UiButton>
        </>
      }
    >
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Plan</dt>
          <dd className="text-ink text-right">{plan.name}</dd>
        </div>
        {plan.tier && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Teacher tier</dt>
            <dd className="text-ink text-right">{plan.tier.name}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Classes</dt>
          <dd className="text-ink text-right">
            {plan.classesPerWeek} × {plan.classMinutes} min per week
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Price</dt>
          <dd className="text-ink font-semibold text-right">
            {`${formatMoney(price.amountMinor, family.currency)} / ${periodLabel(plan.billingPeriod)}`}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted mt-4">
        Your subscription starts today and renews every {periodLabel(plan.billingPeriod)} until you cancel. You can
        pause or cancel from this page.
      </p>
      {hasLiveSubscription && (
        <Alert tone="warning" className="mt-3">
          You already have an active subscription. This adds a second plan, and both will be billed.
        </Alert>
      )}
    </Modal>
  );
}

// ── Invoices ─────────────────────────────────────────────────────────────────

function InvoicesCard({
  query,
  invoices,
}: {
  query: ReturnType<typeof useFamilyBilling>;
  invoices: Invoice[];
}) {
  const checkout = useCheckout();
  const toast = useToast();
  // One Idempotency-Key per invoice "Pay" intent, reused if the family retries it.
  const keys = useRef(new Map<string, string>());
  const [payingId, setPayingId] = useState<string | null>(null);

  const pay = (invoice: Invoice) => {
    let key = keys.current.get(invoice.id);
    if (!key) {
      key = newIdempotencyKey();
      keys.current.set(invoice.id, key);
    }
    const origin = window.location.origin;
    setPayingId(invoice.id);
    checkout.mutate(
      {
        input: {
          invoiceId: invoice.id,
          successUrl: `${origin}/parent/billing/checkout/success`,
          cancelUrl: `${origin}/parent/billing/checkout/cancelled`,
        },
        idempotencyKey: key,
      },
      {
        onSuccess: (session) => {
          if (!isSafeCheckoutUrl(session.url)) {
            toast.error('The payment page address was not valid. Please try again later.');
            return;
          }
          toast.success('Redirecting to secure checkout…');
          window.location.assign(session.url);
        },
        onError: (error) => toast.error(error),
        onSettled: () => setPayingId(null),
      },
    );
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      render: (i) => (
        <span className="font-medium text-ink whitespace-nowrap">
          {i.pdfUrl && /^https?:\/\//.test(i.pdfUrl) ? (
            <a href={i.pdfUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-gold underline-offset-2">
              {i.number}
            </a>
          ) : (
            i.number
          )}
        </span>
      ),
    },
    { key: 'issued', header: 'Issued', render: (i) => <span className="whitespace-nowrap">{formatDate(i.createdAt)}</span> },
    {
      key: 'due',
      header: 'Due / paid',
      render: (i) => (
        <span className="whitespace-nowrap">{i.paidAt ? `Paid ${formatDate(i.paidAt)}` : formatDate(i.dueAt)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (i) => (
        <span className="whitespace-nowrap tabular-nums">
          <span className="text-ink font-medium">{formatMoney(i.totalMinor, i.currency)}</span>
          {i.discountMinor > 0 && (
            <span className="block text-[11px] text-muted">
              incl. {formatMoney(i.discountMinor, i.currency)} discount
            </span>
          )}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
    {
      key: 'action',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (i) =>
        isPayable(i) ? (
          <UiButton
            size="sm"
            variant="gold"
            onClick={() => pay(i)}
            loading={payingId === i.id}
            disabled={checkout.isPending && payingId !== i.id}
            aria-label={`Pay invoice ${i.number}`}
          >
            Pay now
          </UiButton>
        ) : null,
    },
  ];

  return (
    <Card>
      <CardHeader title="Invoices" description="Your latest 50 invoices." />
      <QueryState
        query={{ ...query, data: query.data ? invoices : undefined }}
        loadingLabel="Loading invoices…"
        empty={
          <EmptyState
            icon={<Receipt className="w-5 h-5" aria-hidden />}
            title="No invoices yet"
            description="Invoices appear here once your plan is billed."
          />
        }
      >
        {(rows) => <DataTable columns={columns} rows={rows} rowKey={(i) => i.id} />}
      </QueryState>
    </Card>
  );
}

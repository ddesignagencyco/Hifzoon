'use client';

import React, { useState } from 'react';
import { Tag, X } from 'lucide-react';
import { TextInput, UiButton, formatMoney } from '@/components/ui/primitives';
import { ApiClientError } from '@/lib/api/http';
import { PlanPrice, PriceQuote, discountLabel, periodSaving } from '@/lib/api/modules/billing-family';

/**
 * A plan's price per period. On a prepaid plan with a period discount it shows the price at
 * the monthly rate struck through, the price paid, and the saving.
 */
export function PlanPriceTag({
  price,
  currency,
  period,
}: {
  price: Pick<PlanPrice, 'amountMinor' | 'listMinor' | 'periodDiscountPercent'> | null | undefined;
  currency: string;
  period: string;
}) {
  if (price === undefined) return <span className="text-lg font-semibold text-ink">…</span>;
  if (price === null) return <span className="text-lg font-semibold text-ink">—</span>;
  const saving = periodSaving(price);
  return (
    <span className="block">
      <span className="text-lg font-semibold text-ink tabular-nums">
        {saving && (
          <s className="mr-1.5 text-sm font-normal text-muted" aria-label={`was ${formatMoney(saving.beforeMinor, currency)}`}>
            {formatMoney(saving.beforeMinor, currency)}
          </s>
        )}
        {formatMoney(price.amountMinor, currency)}
        <span className="text-xs font-normal text-muted"> / {period}</span>
      </span>
      {saving && (
        <span className="mt-0.5 block text-xs font-semibold text-green-700">
          Save {formatMoney(saving.savingMinor, currency)} ({saving.percent}%) by paying for the {period}
        </span>
      )}
    </span>
  );
}

/** The message to show under the promo field for a rejected code. */
export function promoErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiClientError && error.status === 400) return error.message;
  return 'The code could not be checked. Try again.';
}

/**
 * Where the family types a promo code. It is checked by the server (`POST /billing/quote`)
 * when applied; the code is only used up once the first payment goes through.
 */
export function PromoCodeField({
  applied,
  onApply,
  onClear,
  error,
  checking,
}: {
  applied: string | null;
  onApply: (code: string) => void;
  onClear: () => void;
  error: string | null;
  checking?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const code = draft.trim();
    if (code) onApply(code.toUpperCase());
  };

  if (applied && !error) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-green-800">
          <Tag className="h-3.5 w-3.5" aria-hidden /> {applied}
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onClear();
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2 hover:underline"
        >
          <X className="h-3 w-3" aria-hidden /> Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="promo-code" className="mb-1 block text-xs font-semibold text-ink-2">
        Promo code
      </label>
      <div className="flex gap-2">
        <TextInput
          id="promo-code"
          value={draft}
          maxLength={40}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'promo-code-error' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <UiButton variant="secondary" onClick={submit} disabled={!draft.trim()} loading={checking}>
          Apply
        </UiButton>
      </div>
      {error && (
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <p id="promo-code-error" role="alert" className="text-xs text-red-700">
            {error}
          </p>
          {/* An invalid code blocks payment, so it must be removable without guessing a valid one. */}
          {applied && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                onClear();
              }}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-2 hover:underline"
            >
              <X className="h-3 w-3" aria-hidden /> Remove code
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The price the family will pay, line by line: monthly × months, the period discount, the
 * sibling or promo discount (whichever is larger), and the total per period.
 */
export function QuoteLines({
  quote,
  currency,
  period,
  promoEntered,
}: {
  quote: PriceQuote;
  currency: string;
  period: string;
  /** A code was applied; if the sibling discount won, say why it is not used. */
  promoEntered?: boolean;
}) {
  const label = discountLabel(quote);
  const hasDiscount = quote.periodDiscountMinor > 0 || quote.extraDiscountMinor > 0;
  return (
    <dl className="space-y-1.5 text-sm" aria-label="Price breakdown">
      {hasDiscount && (
        <Line
          label={quote.months > 1 ? `${quote.months} months at ${formatMoney(quote.monthlyMinor, currency)}` : 'Price'}
          value={formatMoney(quote.listMinor, currency)}
        />
      )}
      {quote.periodDiscountMinor > 0 && (
        <Line
          label={`Paying for the ${period} (${quote.periodDiscountPercent}%)`}
          value={`−${formatMoney(quote.periodDiscountMinor, currency)}`}
          tone="saving"
        />
      )}
      {label && quote.extraDiscountMinor > 0 && (
        <Line label={label} value={`−${formatMoney(quote.extraDiscountMinor, currency)}`} tone="saving" />
      )}
      {promoEntered && quote.applied === 'SIBLING' && quote.promo && (
        <p className="text-[11px] text-muted">
          Your sibling discount is larger than {quote.promo.code}, so the code is not used and stays available. Discounts do not
          add up.
        </p>
      )}
      <div className="flex items-baseline justify-between border-t border-line pt-2">
        <dt className="text-muted">Each {period}</dt>
        <dd className="text-xl font-semibold text-ink tabular-nums" data-testid="quote-total">
          {formatMoney(quote.finalMinor, currency)}
        </dd>
      </div>
    </dl>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'saving' }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === 'saving' ? 'font-semibold text-green-700 tabular-nums' : 'text-ink tabular-nums'}>{value}</dd>
    </div>
  );
}

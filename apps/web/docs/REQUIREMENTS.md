# Hifzoon — Requirements

**Updated:** 2026-10-30 on `full-site-regression`

**No open requirements.** Every backend ask from earlier handoffs has been built or re-checked and closed; the details are in [`CHANGES.md`](./CHANGES.md), and endpoint wiring is in [`api-coverage.md`](./api-coverage.md).

## Before deploying

1. **Migrations.** Run `npx prisma migrate deploy`. On an existing database, remove any duplicate live enrolments first (the same child twice in one course), or `20261030000500_one_live_enrolment` will fail.
2. **Stripe.**
   - Set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
   - Add the webhook `https://<api-host>/api/v1/webhooks/payments` with these events:
     - `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`;
     - `invoice.paid`, `invoice.payment_failed`;
     - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
     - `payment_intent.succeeded`, `payment_intent.payment_failed`;
     - `charge.refunded`.
   - Turn on the customer portal and Smart Retries.
3. **Web.** Set `NEXT_PUBLIC_BILLING_ENABLED=true` and run `next build` once.
4. **Production credentials.** Add the Stripe live keys and the LiveKit credentials.

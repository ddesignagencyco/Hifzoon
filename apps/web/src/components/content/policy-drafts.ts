/**
 * Built-in policy drafts shown when the CMS has not published the policy yet.
 *
 * Written ONLY from the project's own rules in docs/Hifzoon—SRS.md (section 7 retention
 * table, section 8 CR-01..CR-13, FR-SCH, FR-PAR and FR-BIL rows). Nothing here is legal
 * advice; CR-13 requires a privacy lawyer to review every policy before launch.
 * Bodies use the CMS light-markdown format rendered by <ContentBody />.
 */

/** FR-SCH-04 default notice — mirrors DEFAULT_CANCELLATION_NOTICE_HOURS in packages/shared/src/constants/business.ts. */
export const CANCELLATION_NOTICE_HOURS = 4;
/** FR-PAR-05 — mirrors MAX_SUBSCRIPTION_PAUSE_DAYS in packages/shared/src/constants/business.ts. */
export const MAX_PAUSE_DAYS = 30;
/** CR-05 — mirrors RETENTION_DAYS.DATA_REQUEST_SLA in packages/shared/src/constants/business.ts. */
export const DATA_REQUEST_DAYS = 30;

/** Date these drafts were last revised (ISO). */
export const POLICY_DRAFT_UPDATED = '2026-10-15';

export type PolicySlug = 'child-safety-policy' | 'privacy-policy' | 'terms-of-service' | 'refund-policy';

export interface PolicyDraft {
  title: string;
  body: string;
}

export const POLICY_DRAFTS: Record<PolicySlug, PolicyDraft> = {
  'child-safety-policy': {
    title: 'Child Safeguarding Code',
    body: `Most Hifzoon students are children, so these safeguards apply to every class, chat and profile on the platform.

## No contact outside Hifzoon

- Staff and teachers never contact children outside Hifzoon (CR-07).
- The platform hides personal phone numbers and email addresses (CR-07).

## Reporting a concern

- To raise a concern, email the named safeguarding lead at safeguarding@hifzoon.com (CR-08).
- Every concern is logged as a case and handled by the safeguarding lead (CR-08).

## Teacher vetting

- Every teacher passes identity checks, reference checks and, where available, criminal background checks before teaching (CR-09).
- Every teacher completes safeguarding training before teaching (CR-09).

## Guardian verification

- A guardian is linked to a child only after verification (CR-10).
- No one can view a child who is not theirs (CR-10).

## Class recordings

Class recordings are kept for 90 days and then deleted automatically. Recordings flagged by a supervisor are kept until the related case closes.`,
  },

  'privacy-policy': {
    title: 'Privacy Policy',
    body: `This policy explains how Hifzoon handles personal data, including children's data, for families in the US, UK and EU.

## Parental notice and consent

- Parents receive direct notice and give verifiable parental consent before a child uses the service, as the amended US COPPA Rule requires (CR-01).
- Any use of a child's data that is not essential to the service needs separate consent (CR-01).

## Voice and face data

Voice and face data — class recordings and AI practice audio — is treated as biometric personal information. It is collected only with consent and kept only as long as the retention table below allows (CR-02).

## Security and retention programme

Hifzoon keeps a written information security programme and a written data retention policy (CR-03).

## UK and EU users

- UK users are covered by UK GDPR and the Children's Code: high-privacy defaults, no nudging children to share data, and a data protection impact assessment (CR-04).
- EU users are covered by EU GDPR (CR-05).

## Your rights: export and deletion

You can ask for a copy of your data or for it to be deleted. Requests are completed within ${DATA_REQUEST_DAYS} days (CR-05).

## How children's data is never used

- Children's data is never used for advertising and is never sold (CR-06).
- Children's data is never used to train the AI model without separate guardian consent (CR-06).

## How long we keep data

| Data | Kept for |
| --- | --- |
| Class recordings | 90 days, then deleted automatically (supervisor-flagged recordings kept until the case closes) |
| AI practice audio | 30 days, then deleted; derived results (mistakes, minutes) kept with the learning record |
| Learning record (lesson cards, mistakes, page states, certificates) | While the account is active, plus 2 years, unless the guardian asks for deletion |
| Financial records | As required by tax law in the operating country (commonly 6–7 years) |
| Leads that never enrolled | 12 months |
| Audit logs | 3 years |`,
  },

  'terms-of-service': {
    title: 'Terms of Service',
    body: `These terms, together with the privacy policy, child safety policy and refund policy, are published and accepted at sign-up (CR-12).

## Accounts

- Children's accounts are managed by a parent or guardian, who gives verifiable parental consent (CR-01).
- A guardian is linked to a child only after verification, and no one can view a child who is not theirs (CR-10).

## Conduct and safeguarding

- All contact between staff and children happens on Hifzoon; personal phone numbers and emails are hidden (CR-07).
- Anyone can raise a concern by emailing the named safeguarding lead at safeguarding@hifzoon.com (CR-08).
- Quran text, fonts and audio are used under licence, and the text is never altered (CR-11).

## Classes

- Families subscribe to monthly plans set by classes per week, class length, and one-to-one or circle format (FR-BIL-01).
- A teacher or student is never double-booked (FR-SCH-07).
- Recurring classes keep the same local time for the family when US, UK, EU or Australian clocks change (FR-SCH-02).
- If a teacher is absent, the class may be offered to a qualified substitute teacher and the family is notified of the change (FR-SCH-05).

## Rescheduling, pausing and cancelling

- A family can reschedule or cancel a class up to ${CANCELLATION_NOTICE_HOURS} hours before it starts and receives a make-up credit; later cancellations are charged (FR-SCH-04).
- A guardian can reschedule, pause (up to ${MAX_PAUSE_DAYS} days) or cancel a plan, and request a teacher change (FR-PAR-05).

## Payments

Failed payments are retried 3 times over 7 days with reminders; classes pause after the final failure (FR-BIL-03). See the refund policy for refunds and credits.`,
  },

  'refund-policy': {
    title: 'Refund & Reschedule Terms',
    body: `## Billing

- Families subscribe to monthly plans and pay by card, Apple Pay, Google Pay or PayPal (FR-BIL-01).
- Prepaid 3- and 6-month plans and sibling discounts apply automatically (FR-BIL-02).
- Invoices and receipts are issued automatically with the academy's details and the currency paid (FR-BIL-04).

## Cancelling or rescheduling a class

- Reschedule or cancel a class at least ${CANCELLATION_NOTICE_HOURS} hours before it starts and you receive a make-up credit (FR-SCH-04).
- Cancellations made later than ${CANCELLATION_NOTICE_HOURS} hours before the class are charged (FR-SCH-04).

## Pausing or cancelling a plan

A guardian can pause a plan for up to ${MAX_PAUSE_DAYS} days, or cancel it, from the family portal (FR-PAR-05).

## Failed payments

Failed payments are retried 3 times over 7 days with reminders; classes pause after the final failure (FR-BIL-03).

## Refunds and credits

The academy can issue full or partial refunds and class credits, and records the reason for each one (FR-BIL-05).`,
  },
};

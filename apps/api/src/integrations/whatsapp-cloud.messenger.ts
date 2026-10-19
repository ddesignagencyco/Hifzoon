import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { AppError } from '../common/errors/app-error';
import { AppConfigService } from '../config/app-config.service';
import type {
  Messenger,
  MessengerDeliveryEvent,
  MessengerMessage,
  MessengerWebhookEvent,
} from './providers';

/**
 * WhatsApp Cloud API adapter (FR-NTF-03, IR-SW-05).
 *
 * WhatsApp is different from the other providers in one way that shapes this whole
 * file: **an API call returning 200 means "accepted", not "delivered"**. The phone may
 * be off, the template may be rejected by policy, or the user may have blocked the
 * business. The only evidence that a parent actually received the message about their
 * child's class is the delivery webhook, which can arrive minutes later — or never.
 *
 * That is why `sendTemplate` records the returned `wamid` and why the delivery webhook
 * exists at all: without it, every notification in the portal would read "sent" forever,
 * whether or not anybody read it.
 *
 * Messages go out as **approved templates**. A business-initiated WhatsApp message
 * outside a 24-hour customer-service window is only permitted if it uses a template
 * Meta has approved, which is also why `template` and `locale` are required fields on
 * `MessengerMessage` rather than a free-text body.
 */
@Injectable()
export class WhatsAppCloudMessenger implements Messenger, MessengerWebhookEvent {
  readonly name = 'whatsapp_cloud';

  private readonly apiVersion = 'v21.0';

  constructor(private readonly config: AppConfigService) {}

  // ── Outbound ───────────────────────────────────────────────────────────────

  /**
   * Opt-in check.
   *
   * `canContact` returning true is a *precondition*, not a formality: this platform
   * messages families about children, and WhatsApp policy plus `notificationPreference.
   * whatsapp` both require explicit consent. The caller must ask before every send.
   */
  async canContact(recipientPhone: string): Promise<boolean> {
    return Boolean(recipientPhone) && this.isConfigured();
  }

  async sendTemplate(message: MessengerMessage): Promise<{ messageId: string }> {
    this.assertConfigured();

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.config.value.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.value.WHATSAPP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        // `language_and_locale` is a real WhatsApp template parameter, not decoration:
        // omitting it means the template renders in its default language regardless of
        // the family who is receiving it.
        to: message.to,
        type: 'template',
        template: {
          name: message.template,
          language: { code: message.locale },
          components: [
            {
              type: 'body',
              parameters: Object.values(message.variables).map((text) => ({
                type: 'text',
                text,
              })),
            },
          ],
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok || !body.messages?.[0]?.id) {
      throw new AppError('PROVIDER_ERROR', 'WhatsApp rejected the message', {
        status: response.status,
        providerCode: body.error?.code,
        detail: body.error?.message,
      });
    }

    // The wamid is the only handle we will ever have on this message, so it is
    // returned rather than logged and forgotten.
    return { messageId: body.messages[0].id };
  }

  // ── Inbound (delivery receipts) ────────────────────────────────────────────

  /**
   * Verifies the signature Meta sends and normalises the payload.
   *
   * The signature is an HMAC-SHA256 over the **raw** body, compared in constant time.
   * Parsing the body first and re-serialising it would change the bytes and make every
   * signature fail — which is why the raw-body capture in `main.ts` exists.
   */
  parseDeliveryWebhook(rawBody: Buffer, signature: string | undefined): MessengerDeliveryEvent[] {
    this.assertConfigured();
    if (!signature) {
      throw AppError.unauthenticated('Missing X-Hub-Signature-256 header');
    }
    if (!this.verifySignature(rawBody, signature)) {
      // Deliberately not "expired" or "malformed": anything more specific tells an
      // attacker which part of their forgery was wrong.
      throw AppError.unauthenticated('WhatsApp webhook signature did not verify');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw AppError.badRequest('WhatsApp webhook body is not valid JSON');
    }

    const parsed = whatsappWebhookSchema.safeParse(payload);
    if (!parsed.success) {
      throw AppError.badRequest('Unrecognised WhatsApp webhook payload', {
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }

    return parsed.data.entry.flatMap((entry) =>
      entry.changes.flatMap((change) =>
        (change.value.statuses ?? []).map((status) => ({
          messageId: status.id,
          status: mapStatus(status.status),
          recipientPhone: status.recipient_id ?? null,
          errorCode: status.errors?.[0]?.code !== undefined ? String(status.errors[0].code) : null,
          occurredAt: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
        })),
      ),
    );
  }

  private verifySignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.value.WHATSAPP_APP_SECRET;
    if (!secret) return false;

    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const received = Buffer.from(signature);
    const computed = Buffer.from(expected);
    if (received.length !== computed.length) return false;
    return timingSafeEqual(received, computed);
  }

  private isConfigured(): boolean {
    return Boolean(
      this.config.value.WHATSAPP_PHONE_NUMBER_ID &&
      this.config.value.WHATSAPP_ACCESS_TOKEN &&
      this.config.value.WHATSAPP_APP_SECRET,
    );
  }

  private assertConfigured(): void {
    if (this.isConfigured()) return;
    const missing: string[] = [];
    if (!this.config.value.WHATSAPP_PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!this.config.value.WHATSAPP_ACCESS_TOKEN) missing.push('WHATSAPP_ACCESS_TOKEN');
    if (!this.config.value.WHATSAPP_APP_SECRET) missing.push('WHATSAPP_APP_SECRET');
    throw new AppError('NOT_IMPLEMENTED', 'WhatsApp Cloud API is not configured', { missing });
  }
}

/**
 * Maps Meta's status vocabulary onto ours.
 *
 * The two that need explaining: `deleted` means the recipient deleted the message from
 * their chat *after* it was delivered, which is emphatically not a delivery failure and
 * must not mark the notification FAILED; and `read` is strictly after `delivered`, which
 * is what makes the progression monotonic.
 */
function mapStatus(status: string): MessengerDeliveryEvent['status'] {
  switch (status) {
    case 'sent':
    case 'accepted':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'READ';
    default:
      // 'failed', 'deleted', and anything Meta adds later are all terminal failures.
      // `deleted` reaching here is handled by the caller, which ignores it.
      return 'FAILED';
  }
}

/**
 * Zod mirror of the payload Meta posts.
 *
 * Validated rather than `JSON.parse`d and trusted: this body arrives from the internet
 * and is the only thing standing between a crafted request and arbitrary writes to
 * notification rows.
 */
const whatsappWebhookSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z.array(
          z.object({
            field: z.string().optional(),
            value: z.object({
              messaging_product: z.string().optional(),
              metadata: z.object({ display_phone_number: z.string().optional() }).optional(),
              statuses: z
                .array(
                  z.object({
                    id: z.string().min(1),
                    status: z.string().min(1),
                    timestamp: z.union([z.string(), z.number()]).optional(),
                    recipient_id: z.string().optional(),
                    errors: z
                      .array(z.object({ code: z.union([z.string(), z.number()]).optional() }))
                      .optional(),
                  }),
                )
                .optional(),
            }),
          }),
        ),
      }),
    )
    .default([]),
});

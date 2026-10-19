import { createHmac } from 'node:crypto';

import { WebhooksService } from './webhooks.service';

/**
 * WhatsApp delivery reconciliation (FR-NTF-03, IR-SW-05).
 *
 * The signature is verified against the *raw bytes*, so these tests sign exactly what
 * the adapter receives. A test that re-serialised the parsed body would pass while the
 * real endpoint failed every time, which is the whole reason the raw-body capture in
 * `main.ts` exists.
 */
const APP_SECRET = 'test-app-secret';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(Buffer.from(body, 'utf8')).digest('hex')}`;
}

function buildService(
  status: NotificationLookup | null = { id: 'n-1', status: 'SENT', userId: 'u-1' },
  notifications: Array<Record<string, unknown>> = [],
) {
  const prisma = {
    notification: {
      findFirst: jest.fn(async () => status),
      update: jest.fn(async () => ({})),
    },
  };
  const messenger = {
    name: 'whatsapp_cloud',
    canContact: jest.fn(async () => true),
    sendTemplate: jest.fn(async () => ({ messageId: 'wamid.X' })),
    parseDeliveryWebhook: jest.fn(() => notifications),
  };

  const service = new WebhooksService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    messenger as never,
  );
  return { service, prisma, messenger };
}

interface NotificationLookup {
  id: string;
  status: string;
  userId: string;
}

function receipt(status: string, messageId = 'wamid.X'): Array<Record<string, unknown>> {
  return [
    {
      messageId,
      status,
      recipientPhone: '+447700900123',
      errorCode: null,
      occurredAt: new Date(),
    },
  ];
}

describe('WebhooksService.whatsapp', () => {
  it('advances a sent message to delivered', async () => {
    const { service, prisma } = buildService(
      { id: 'n-1', status: 'SENT', userId: 'u-1' },
      receipt('DELIVERED'),
    );

    const result = await service.whatsapp(Buffer.from('{}'), 'sha256=whatever');

    expect(result).toEqual({ received: true, applied: 1, ignored: 0, failures: 0 });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { status: 'DELIVERED' },
    });
  });

  it('ignores a redelivered receipt instead of walking the status backwards', async () => {
    // READ already recorded; Meta redelivers the earlier `sent`.
    const { service, prisma } = buildService(
      { id: 'n-1', status: 'READ', userId: 'u-1' },
      receipt('SENT'),
    );

    const result = await service.whatsapp(Buffer.from('{}'), 'sha256=whatever');

    expect(result).toEqual({ received: true, applied: 0, ignored: 1, failures: 0 });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('marks a message failed and records the provider error code', async () => {
    const { service, prisma } = buildService({ id: 'n-1', status: 'SENT', userId: 'u-1' }, [
      { ...receipt('FAILED')[0], errorCode: '131047' },
    ]);

    const result = await service.whatsapp(Buffer.from('{}'), 'sha256=whatever');

    expect(result).toEqual({ received: true, applied: 0, ignored: 0, failures: 1 });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: {
        status: 'FAILED',
        failureReason: expect.stringContaining('131047'),
      },
    });
  });

  it('acknowledges a receipt for a message this deployment never sent', async () => {
    // Not an error: returning non-2xx would make Meta retry forever, and there is
    // nothing a retry could resolve.
    const { service, prisma } = buildService(null, receipt('DELIVERED', 'wamid.SOMEONE_ELSE'));

    const result = await service.whatsapp(Buffer.from('{}'), 'sha256=whatever');

    expect(result).toEqual({ received: true, applied: 0, ignored: 1, failures: 0 });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('refuses an empty body — there is nothing to verify', async () => {
    const { service, messenger } = buildService();

    await expect(service.whatsapp(undefined, sign('{}'))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(messenger.parseDeliveryWebhook).not.toHaveBeenCalled();
  });

  it('propagates a signature failure rather than reconciling unauthenticated data', async () => {
    const { service, messenger } = buildService(undefined, receipt('DELIVERED'));

    // The adapter throws; the point is that we never reach the database with a body
    // whose signature was not verified first.
    messenger.parseDeliveryWebhook = jest.fn(() => {
      throw Object.assign(new Error('signature did not verify'), { status: 401 });
    });

    await expect(service.whatsapp(Buffer.from('{}'), 'sha256=bogus')).rejects.toThrow();
    expect(messenger.parseDeliveryWebhook).toHaveBeenCalled();
  });

  it('reports the signature it signed with, proving it is computed over the raw bytes', () => {
    // A canary on the crypto itself: if verification ever moved to the parsed-and-
    // re-serialised body, this signature would stop matching.
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    expect(sign(body)).toBe(
      'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex'),
    );
  });
});

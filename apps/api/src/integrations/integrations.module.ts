import { Global, Logger, Module } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import {
  FakePaymentProvider,
  FakeQuranContentProvider,
  FakeSpeechProvider,
  FakeVideoProvider,
  FakeMessenger,
  LogMailer,
} from './fakes';
import {
  MAILER,
  MESSENGER,
  PAYMENT_PROVIDER,
  QURAN_CONTENT,
  SPEECH_PROVIDER,
  VIDEO_PROVIDER,
} from './providers';
import { UnsupportedProviderError, assertProviderSelected } from './provider-selection';
import { WhatsAppCloudMessenger } from './whatsapp-cloud.messenger';

/**
 * Wires the adapter for each provider slot from env (PLAT-BE-07, NFR-PORT-01).
 *
 * Slots that have no configured vendor yet — LiveKit, Stripe, WhatsApp Cloud, the
 * licensed Quran source, a speech vendor — fall back to the fake adapter rather
 * than crashing the process, and `assertProviderSelected` turns that into a clear
 * 501 the moment a feature genuinely needs the real thing. Swapping in a real
 * adapter means adding a branch here and nothing else.
 */
@Global()
@Module({
  providers: [
    {
      provide: VIDEO_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        select(config.value.VIDEO_PROVIDER, 'video', config),
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => select(config.value.PAYMENT_PROVIDER, 'payment', config),
    },
    {
      provide: MAILER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => select(config.value.MAIL_PROVIDER, 'mail', config),
    },
    {
      provide: MESSENGER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => select(config.value.WHATSAPP_PROVIDER, 'messenger', config),
    },
    {
      provide: QURAN_CONTENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        select(config.value.QURAN_CONTENT_PROVIDER, 'quran', config),
    },
    {
      provide: SPEECH_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => select(config.value.SPEECH_PROVIDER, 'speech', config),
    },
  ],
  exports: [VIDEO_PROVIDER, PAYMENT_PROVIDER, MAILER, MESSENGER, QURAN_CONTENT, SPEECH_PROVIDER],
})
export class IntegrationsModule {}

const logger = new Logger('Integrations');

function select<T>(chosen: string, slot: string, config: AppConfigService): T {
  switch (chosen) {
    case 'fake':
      return fakeFor<T>(slot);
    case 'whatsapp_cloud':
      // The one real adapter registered so far. Delivery receipts only mean something
      // if something can actually send, and the webhook reconciles against the id this
      // adapter returns.
      return new WhatsAppCloudMessenger(config) as T;
    default:
      // A real adapter for this slot is registered in a follow-up ticket. Until then
      // the fake keeps the module runnable; assertProviderSelected() guards the
      // endpoints that cannot work without the real thing.
      logger.warn(
        `Provider "${chosen}" selected for ${slot}; using fake adapter until the adapter lands`,
      );
      return fakeFor<T>(slot);
  }
}

function fakeFor<T>(slot: string): T {
  switch (slot) {
    case 'video':
      return new FakeVideoProvider() as T;
    case 'payment':
      return new FakePaymentProvider() as T;
    case 'mail':
      return new LogMailer() as T;
    case 'messenger':
      return new FakeMessenger() as T;
    case 'quran':
      return new FakeQuranContentProvider() as T;
    case 'speech':
      return new FakeSpeechProvider() as T;
    default:
      throw new Error(`Unknown provider slot: ${slot}`);
  }
}

export { assertProviderSelected, UnsupportedProviderError };

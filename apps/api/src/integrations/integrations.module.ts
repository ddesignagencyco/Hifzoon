import { Global, Module } from '@nestjs/common';

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
import { FileMailer, captureDirectory } from './file-mailer';
import { ResendMailer } from './resend-mailer';
import { LiveKitVideoProvider } from './livekit-video.provider';
import { SmtpMailer } from './smtp-mailer';
import { StripePaymentProvider } from './stripe-payment.provider';
import { WhatsAppCloudMessenger } from './whatsapp-cloud.messenger';
import { QuranFoundationProvider } from './quran-foundation.provider';

/**
 * Wires the adapter for each provider slot from env (PLAT-BE-07, NFR-PORT-01).
 *
 * `fake` is an explicit choice, and `assertProviderSelected` turns it into a clear 501
 * the moment a feature genuinely needs the real thing. A vendor that is named but has no
 * adapter (PayPal, an OpenAI speech engine) refuses to boot instead of quietly running
 * the fake under a real name. Swapping in a real adapter means adding a branch here and
 * nothing else.
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
      useFactory: (config: AppConfigService) =>
        select(config.value.PAYMENT_PROVIDER, 'payment', config),
    },
    {
      provide: MAILER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => select(config.value.MAIL_PROVIDER, 'mail', config),
    },
    {
      provide: MESSENGER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        select(config.value.WHATSAPP_PROVIDER, 'messenger', config),
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
      useFactory: (config: AppConfigService) =>
        select(config.value.SPEECH_PROVIDER, 'speech', config),
    },
  ],
  exports: [VIDEO_PROVIDER, PAYMENT_PROVIDER, MAILER, MESSENGER, QURAN_CONTENT, SPEECH_PROVIDER],
})
export class IntegrationsModule {}

function select<T>(chosen: string, slot: string, config: AppConfigService): T {
  switch (chosen) {
    case 'fake':
      return fakeFor<T>(slot);
    case 'log':
      return new LogMailer() as T;
    case 'whatsapp_cloud':
      // The one real adapter registered so far. Delivery receipts only mean something
      // if something can actually send, and the webhook reconciles against the id this
      // adapter returns.
      return new WhatsAppCloudMessenger(config) as T;
    case 'resend':
      return new ResendMailer(config) as T;
    case 'file':
      return new FileMailer(
        captureDirectory(config.value.MAIL_CAPTURE_DIR),
        config.value.MAIL_FROM,
      ) as T;
    case 'livekit':
      // Open source and self-hostable; the same adapter works against LiveKit Cloud.
      return new LiveKitVideoProvider(config) as T;
    case 'stripe':
      // UK operating country: Stripe with GBP as the default currency.
      return new StripePaymentProvider(config) as T;
    case 'smtp':
      // Real delivery through any SMTP server (Gmail, a relay, a provider). Built lazily
      // so an unreachable relay cannot stop the process booting.
      return new SmtpMailer(config) as T;
    case 'quran_foundation':
      // Quran Foundation API for Quran text and layout (CR-11).
      return new QuranFoundationProvider(config) as T;
    default:
      // env.schema refuses these first; this is the backstop for a value added to an enum
      // before its adapter. The fake here would report payments taken and speech assessed
      // when nothing happened.
      throw new Error(`Provider "${chosen}" selected for ${slot} has no adapter; choose another`);
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

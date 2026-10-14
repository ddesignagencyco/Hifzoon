import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

/**
 * Typed accessors for `app_setting` (FR-OPS-05).
 *
 * Settings are the classic place where a platform quietly stops working: a value is
 * changed in the admin UI, every feature reads it, and three of them cache it at boot.
 * Two rules keep that from happening:
 *
 *   - **`getNumber` has a default and a type check.** A setting that has never been set
 *     returns its default rather than `undefined`, so a missing row is a no-op rather
 *     than a `NaN` bug six months later.
 *   - **Every write is audited and type-checked against the defaults map.** A setting
 *     that was never registered as `number` cannot be written with a string, which is
 *     the failure that turns into "the daily plan stopped running".
 */
const SETTING_DEFAULTS = {
  'platform.branding.name': 'string',
  'platform.branding.tagline': 'string',
  'platform.contact.whatsapp': 'string',
  'platform.contact.email': 'string',
  'platform.registration.open': 'boolean',
  'platform.trial.enabled': 'boolean',
  'trial.default_duration_minutes': 'number',
  'trial.cancellation_notice_hours': 'number',
  'trial.no_show_followup_hours': 'number',
  'lessons.card_lock_hours': 'number',
  'lessons.share_sla_minutes': 'number',
  'lessons.recording_requires_consent': 'boolean',
  'scheduling.materialise_days': 'number',
  'scheduling.substitute_notice_hours': 'number',
  'scheduling.cancellation_notice_hours': 'number',
  'scheduling.max_session_gap_minutes': 'number',
  'safeguarding.alert_sla_minutes': 'number',
  'qa.samples_per_teacher_per_month': 'number',
  'qa.review_sla_hours': 'number',
  'billing.dunning_retry_days': 'number',
  'billing.currency': 'string',
  'billing.invoice_due_days': 'number',
  'payroll.cutoff_day': 'number',
  'notifications.booking_confirmation_sla_seconds': 'number',
  'notifications.reminder_hours_before': 'number',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

const NUMBER_DEFAULTS: Partial<Record<SettingKey, number>> = {
  'trial.default_duration_minutes': 30,
  'trial.cancellation_notice_hours': 4,
  'trial.no_show_followup_hours': 24,
  'lessons.card_lock_hours': 48,
  'lessons.share_sla_minutes': 15,
  'scheduling.materialise_days': 60,
  'scheduling.substitute_notice_hours': 12,
  'scheduling.cancellation_notice_hours': 4,
  'scheduling.max_session_gap_minutes': 20,
  'safeguarding.alert_sla_minutes': 15,
  'qa.samples_per_teacher_per_month': 2,
  'qa.review_sla_hours': 72,
  'billing.dunning_retry_days': 3,
  'billing.invoice_due_days': 7,
  'payroll.cutoff_day': 25,
  'notifications.booking_confirmation_sla_seconds': 60,
  'notifications.reminder_hours_before': 24,
};

const BOOLEAN_DEFAULTS: Partial<Record<SettingKey, boolean>> = {
  'platform.registration.open': true,
  'platform.trial.enabled': true,
  'lessons.recording_requires_consent': true,
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reads every setting as one map.
   *
   * One query, not one per key: a settings screen that fires forty reads is forty round
   * trips, and each one can observe a different moment.
   */
  async all(): Promise<Record<string, string | number | boolean>> {
    const rows = await this.prisma.appSetting.findMany();
    const out: Record<string, string | number | boolean> = { ...defaults() };
    for (const row of rows) out[row.key] = row.value as string | number | boolean;
    return out;
  }

  async get(key: SettingKey): Promise<string | number | boolean> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!row) return defaults()[key];
    return row.value as string | number | boolean;
  }

  getNumber(key: SettingKey): Promise<number> {
    return this.get(key).then((v) => Number(v ?? NUMBER_DEFAULTS[key] ?? 0));
  }

  getBoolean(key: SettingKey): Promise<boolean> {
    return this.get(key).then((v) => v === true || v === 'true');
  }

  /**
   * Writes a setting, validating the shape against the registry.
   *
   * Unknown keys are rejected rather than accepted opportunistically: a typo like
   * `lessons.card_lock_hour` would otherwise sit in the table forever, doing nothing,
   * while the code reads the correct key and its default.
   */
  async set(
    key: string,
    value: unknown,
    actorId: string,
  ): Promise<{ key: string; value: unknown }> {
    const kind = SETTING_DEFAULTS[key as SettingKey];
    if (!kind) {
      throw AppError.badRequest(
        `Unknown setting "${key}". Register it in SETTING_DEFAULTS before writing it.`,
        { knownKeys: Object.keys(SETTING_DEFAULTS) },
      );
    }

    let coerced: string | number | boolean;
    if (kind === 'number') {
      const n = typeof value === 'string' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw AppError.badRequest(`Setting "${key}" must be a finite number`, { received: value });
      }
      if (n < 0) throw AppError.badRequest(`Setting "${key}" cannot be negative`, { received: n });
      coerced = n;
    } else if (kind === 'boolean') {
      coerced = typeof value === 'string' ? value === 'true' : Boolean(value);
    } else {
      if (typeof value !== 'string' || value.length > 2000) {
        throw AppError.badRequest(`Setting "${key}" must be a string of at most 2000 characters`);
      }
      coerced = value;
    }

    const before = await this.prisma.appSetting.findUnique({ where: { key } }).catch(() => null);

    const row = await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: coerced as never, updatedBy: actorId },
      update: { value: coerced as never, updatedBy: actorId },
    });

    await this.audit.record({
      actorId,
      action: 'ops.setting.update',
      targetType: 'app_setting',
      targetId: key,
      before: before?.value,
      after: row.value,
    });

    return { key: row.key, value: row.value };
  }

  /** Bulk write for the admin console form, with per-key validation. */
  async setMany(patch: Record<string, unknown>, actorId: string) {
    const applied: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const result = await this.set(key, value, actorId);
      applied[result.key] = result.value;
    }
    return applied;
  }

  /** Describes every setting and its current value, for the settings screen. */
  async describe() {
    const values = await this.all();
    return Object.entries(SETTING_DEFAULTS).map(([key, type]) => ({
      key,
      type,
      value: values[key],
    }));
  }
}

function defaults(): Record<string, string | number | boolean> {
  return { ...NUMBER_DEFAULTS, ...BOOLEAN_DEFAULTS };
}

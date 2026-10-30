'use client';

import React, { useMemo, useState } from 'react';
import { Database, Lock, RotateCcw, Save } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  TextInput,
  UiButton,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAppSettings, useClearMushafCache, useUpdateAppSettings } from '@/hooks/useSettings';
import {
  diffSettings,
  groupKnownSettings,
  SETTING_CATALOGUE,
  SettingDescriptor,
  SettingDraft,
  settingLabel,
  toDraft,
} from '@/lib/api/modules/settings';
import { cn } from '@/lib/utils';
import { ConfirmDialog, useAdminRoles } from './shared';

/** /admin/settings — platform configuration (FR-OPS-05) + maintenance actions. */
export function SettingsScreen() {
  const { isSuperAdmin } = useAdminRoles();
  const query = useAppSettings();

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Platform settings"
        description="Values that change billing, scheduling, lessons and safeguarding behaviour for every family at once."
      />
      {!isSuperAdmin && (
        <Alert tone="neutral" title="Read-only" className="mb-6">
          Only a super admin can change platform settings. You can review the current values here.
        </Alert>
      )}
      <QueryState
        query={query}
        empty={<EmptyState title="No settings registered" description="There are no settings to change." />}
      >
        {(settings) => (
          // Keyed so the draft re-initialises whenever the server copy changes.
          <SettingsForm key={JSON.stringify(settings)} settings={settings} canEdit={isSuperAdmin} />
        )}
      </QueryState>
      {isSuperAdmin && <MaintenanceCard />}
    </>
  );
}

export function SettingsForm({ settings, canEdit }: { settings: SettingDescriptor[]; canEdit: boolean }) {
  const toast = useToast();
  const update = useUpdateAppSettings();
  const [draft, setDraft] = useState<SettingDraft>(() => toDraft(settings));
  const [confirming, setConfirming] = useState(false);

  const groups = useMemo(() => groupKnownSettings(settings), [settings]);
  const { patch, errors } = useMemo(() => diffSettings(settings, draft), [settings, draft]);
  const changedKeys = Object.keys(patch);
  const hasErrors = Object.keys(errors).length > 0;
  const byKey = useMemo(() => new Map(settings.map((s) => [s.key, s])), [settings]);

  const setValue = (key: string, value: string | boolean) => setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    update.mutate(patch, {
      onSuccess: (applied) => {
        toast.success(`Saved ${Object.keys(applied).length} setting${Object.keys(applied).length === 1 ? '' : 's'}`);
        setConfirming(false);
      },
      onError: (err) => {
        toast.error(err);
        setConfirming(false);
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canEdit && changedKeys.length > 0 && !hasErrors) setConfirming(true);
      }}
      aria-label="Platform settings"
    >
      {/* Columns rather than a grid, so cards of different heights pack without gaps. */}
      <div className="columns-1 lg:columns-2 gap-6">
        {groups.map(({ section, items }) => (
          <Card key={section} className="mb-6 break-inside-avoid">
            <CardHeader title={section} />
            <CardBody className="space-y-5">
              {items.map((s) => (
                <SettingControl
                  key={s.key}
                  setting={s}
                  value={draft[s.key]}
                  changed={s.key in patch}
                  error={errors[s.key]}
                  disabled={!canEdit || update.isPending}
                  onChange={(v) => setValue(s.key, v)}
                />
              ))}
            </CardBody>
          </Card>
        ))}
      </div>

      {canEdit && (
        <div className="sticky bottom-0 mt-6 -mx-1 px-1 pb-1">
          <Card className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2" aria-live="polite">
              {hasErrors
                ? 'Fix the highlighted values before saving.'
                : changedKeys.length === 0
                  ? 'No unsaved changes.'
                  : `${changedKeys.length} unsaved change${changedKeys.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex gap-2">
              <UiButton
                variant="secondary"
                size="sm"
                icon={<RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                disabled={update.isPending || (changedKeys.length === 0 && !hasErrors)}
                onClick={() => setDraft(toDraft(settings))}
              >
                Reset
              </UiButton>
              <UiButton
                type="submit"
                size="sm"
                icon={<Save className="w-3.5 h-3.5" aria-hidden />}
                disabled={changedKeys.length === 0 || hasErrors}
                loading={update.isPending}
              >
                Save changes
              </UiButton>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Apply setting changes?"
        description="These values take effect platform-wide immediately and are recorded in the audit log."
        confirmLabel={`Save ${changedKeys.length} change${changedKeys.length === 1 ? '' : 's'}`}
        tone="primary"
        pending={update.isPending}
        onConfirm={save}
        onClose={() => setConfirming(false)}
      >
        <ul className="space-y-2 text-sm" aria-label="Pending changes">
          {changedKeys.map((key) => (
            <li key={key} className="rounded-lg border border-line px-3 py-2">
              <p className="text-xs font-semibold text-ink">{settingLabel(key)}</p>
              <p className="text-ink-2 break-all">
                <span className="line-through text-muted">{formatValue(byKey.get(key)?.value)}</span>
                {' → '}
                <span className="font-semibold text-ink">{formatValue(patch[key])}</span>
              </p>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </form>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return String(value);
}

function SettingControl({
  setting,
  value,
  changed,
  error,
  disabled,
  onChange,
}: {
  setting: SettingDescriptor;
  value: string | boolean | undefined;
  changed: boolean;
  error?: string;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const id = `setting-${setting.key.replace(/[^a-z0-9]/gi, '-')}`;
  const info = SETTING_CATALOGUE[setting.key];
  const label = settingLabel(setting.key);
  const meta = (
    <span className="flex flex-wrap items-center gap-1.5" title={setting.key}>
      <span>{info?.help}</span>
      {changed && <Badge tone="gold">Changed</Badge>}
      {disabled && !changed && <Lock className="w-3 h-3 text-muted" aria-hidden />}
    </span>
  );

  if (setting.type === 'boolean') {
    return (
      <div className="space-y-1">
        <Checkbox
          id={id}
          label={label}
          description={meta}
          checked={value === true}
          disabled={disabled}
          onChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  return (
    <Field label={label} htmlFor={id} error={error} hint={meta}>
      <TextInput
        id={id}
        type={setting.type === 'number' ? 'number' : 'text'}
        inputMode={setting.type === 'number' ? 'decimal' : undefined}
        min={setting.type === 'number' ? 0 : undefined}
        step="any"
        maxLength={setting.type === 'string' ? 2000 : undefined}
        value={typeof value === 'string' ? value : ''}
        placeholder={setting.value === undefined ? 'Not set' : undefined}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className={cn(info?.unit && 'max-w-[10rem]', changed && 'border-gold')}
      />
      {info?.unit && <span className="ml-2 text-sm text-muted">{info.unit}</span>}
    </Field>
  );
}

function MaintenanceCard() {
  const toast = useToast();
  const clear = useClearMushafCache();
  const [mode, setMode] = useState<null | 'all' | 'expired'>(null);

  const run = () => {
    if (!mode) return;
    clear.mutate(mode === 'expired', {
      onSuccess: (res) => {
        toast.success(`Mushaf cache cleared — ${res.deleted} entr${res.deleted === 1 ? 'y' : 'ies'} removed`);
        setMode(null);
      },
      onError: (err) => {
        toast.error(err);
        setMode(null);
      },
    });
  };

  return (
    <Card className="mt-8">
      <CardHeader
        title="Maintenance"
        description="Super-admin tools. Use when a content licence changes or a source correction is issued."
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-sand text-gold-600 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Mushaf content cache</p>
              <p className="text-xs text-muted mt-0.5">
                Purging forces Quran page content to be fetched again from the licensed source on next view.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <UiButton variant="secondary" size="sm" onClick={() => setMode('expired')} disabled={clear.isPending}>
              Purge expired only
            </UiButton>
            <UiButton variant="danger" size="sm" onClick={() => setMode('all')} disabled={clear.isPending}>
              Clear entire cache
            </UiButton>
          </div>
        </div>
      </CardBody>
      <ConfirmDialog
        open={mode !== null}
        title={mode === 'all' ? 'Clear the entire Mushaf cache?' : 'Purge expired cache entries?'}
        description={
          mode === 'all'
            ? 'Every cached page is deleted. Students may see slower page loads until the cache warms up again.'
            : 'Only entries past their licence TTL are deleted.'
        }
        confirmLabel={mode === 'all' ? 'Clear cache' : 'Purge expired'}
        pending={clear.isPending}
        onConfirm={run}
        onClose={() => setMode(null)}
      />
    </Card>
  );
}

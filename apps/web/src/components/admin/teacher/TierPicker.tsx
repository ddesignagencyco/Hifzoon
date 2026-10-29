'use client';

import React from 'react';
import { Field, Select } from '@/components/ui/primitives';
import { TeacherTierBadge } from '@/components/shared/TeacherTierBadge';
import { useQuery } from '@tanstack/react-query';
import { teacherTiersApi } from '@/lib/api/modules/backend-updates-oct2026';

interface TierPickerProps {
  id?: string;
  value?: string | null;
  onChange?: (tierId: string | null) => void;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

/** Admin picker for assigning teacher qualification tiers */
export function TierPicker({
  id = 'tier',
  value,
  onChange,
  label = 'Teacher tier',
  required = false,
  error,
  disabled = false,
}: TierPickerProps) {
  const { data: tiers = [] } = useQuery({
    queryKey: ['teacher-tiers'],
    queryFn: () => teacherTiersApi.list(),
    enabled: true,
  });

  const selectedTier = tiers.find((t) => t.id === value);

  return (
    <Field label={label} htmlFor={id} required={required} error={error}>
      <div className="space-y-2">
        <Select
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value || null)}
          disabled={disabled}
        >
          <option value="">No tier assigned</option>
          {tiers.filter((t) => t.active !== false).map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.badgeIcon} {tier.name}
            </option>
          ))}
        </Select>
        {selectedTier && (
          <div className="mt-2">
            <TeacherTierBadge tier={selectedTier} size="sm" showDescription={true} />
          </div>
        )}
      </div>
    </Field>
  );
}

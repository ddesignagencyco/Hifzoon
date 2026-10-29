'use client';

import React, { useState, useEffect } from 'react';
import { Field, UiButton, Select } from '@/components/ui/primitives';
import { monthlyAvailabilityApi } from '@/lib/api/modules/backend-updates-oct2026';
import { useToast } from '@/components/ui/toast';

interface MonthlyAvailabilityEditorProps {
  teacherId: string;
  month: string; // YYYY-MM format
  defaultTimeZone?: string;
}

export function MonthlyAvailabilityEditor({ teacherId, month, defaultTimeZone }: MonthlyAvailabilityEditorProps) {
  const toast = useToast();
  const [timeZone, setTimeZone] = useState(defaultTimeZone || 'UTC');
  const [isLoading, setIsLoading] = useState(true);
  const [slots, setSlots] = useState<Array<{weekday: number, startTime: string, endTime: string}>>([]);
  const [leaveeDays, setLeaveDays] = useState<string[]>([]);

  useEffect(() => {
    const loadAvailability = async () => {
      try {
        const data = await monthlyAvailabilityApi.getMonth(teacherId, month);
        setSlots(data.slots || []);
        setLeaveDays(data.leave?.map((d: any) => d.date) || []);
      } catch (err) {
        toast.error('Failed to load availability');
      } finally {
        setIsLoading(false);
      }
    };
    loadAvailability();
  }, [teacherId, month]);

  const handleSave = async () => {
    try {
      setIsLoading(true);
      await monthlyAvailabilityApi.setMonth(teacherId, month, slots, timeZone);
      if (leaveeDays.length > 0) {
        await monthlyAvailabilityApi.setLeaveMonth(
          teacherId,
          month,
          leaveeDays.map((date) => ({ date, reason: 'Personal leave' }))
        );
      }
      toast.success('Availability updated');
    } catch (err) {
      toast.error('Failed to save availability');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Field label="Timezone" htmlFor="tz">
        <Select id="tz" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
          <option value="UTC">UTC</option>
          <option value="Asia/Karachi">Asia/Karachi</option>
          <option value="Europe/London">Europe/London</option>
          <option value="America/New_York">America/New_York</option>
        </Select>
      </Field>

      <div className="bg-[#f4efe6] p-6 rounded-lg border border-[#e6dfd1]">
        <h3 className="font-semibold text-[#10201b] mb-4">Month Calendar Grid</h3>
        <p className="text-xs text-[#6b7772] mb-4">
          Note: This component requires a calendar widget showing all days in {month} with time slots for each day and checkboxes to mark leave days.
          The wireframe is ready to connect to the API via the monthlyAvailabilityApi.
        </p>
        <p className="text-xs text-[#6b7772]">
          Reuse ScheduleBuilder.tsx patterns from admin scheduling for the grid layout.
        </p>
      </div>

      <div className="flex gap-3">
        <UiButton onClick={handleSave} disabled={isLoading} variant="primary">
          {isLoading ? 'Saving...' : 'Save Availability'}
        </UiButton>
      </div>
    </div>
  );
}

// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotPicker, TimezoneSelect, slotKey } from '@/components/booking/SlotPicker';
import { formatSlotTime, OpenSlot } from '@/lib/api/modules/public-booking';
import { chooseOption } from '../helpers/render';

const mk = (startsAt: string, teacherId: string, teacherName: string): OpenSlot => ({
  teacherId,
  teacherName,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
  localTime: '',
  visitorZone: 'UTC',
  teacherZone: 'UTC',
});

const SLOTS = [
  mk('2026-10-16T10:00:00.000Z', 't1', 'Ustadh Bilal'),
  mk('2026-10-16T10:00:00.000Z', 't2', 'Ustadha Amina'),
  mk('2026-10-16T21:30:00.000Z', 't1', 'Ustadh Bilal'),
];

describe('SlotPicker', () => {
  it('renders times in the visitor zone and groups by local day', () => {
    render(<SlotPicker slots={SLOTS} timeZone="Asia/Karachi" onSelect={vi.fn()} />);
    // 21:30 UTC is 02:30 next day in Karachi, so there are two day tabs.
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getAllByText(formatSlotTime('2026-10-16T10:00:00.000Z', 'Asia/Karachi'))).toHaveLength(2);
    expect(within(panel).getByText('Ustadha Amina')).toBeTruthy();
  });

  it('shows the same instants in a different zone when the zone changes', () => {
    const { rerender } = render(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getAllByText(formatSlotTime('2026-10-16T21:30:00.000Z', 'UTC'))).toHaveLength(1);
    rerender(<SlotPicker slots={SLOTS} timeZone="America/New_York" onSelect={vi.fn()} />);
    expect(screen.getAllByText(formatSlotTime('2026-10-16T10:00:00.000Z', 'America/New_York')).length).toBeGreaterThan(0);
  });

  it('selects a teacher-specific slot and marks it pressed', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Ustadha Amina/ }));
    expect(onSelect).toHaveBeenCalledWith(SLOTS[1]);
    rerender(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={onSelect} selectedKey={slotKey(SLOTS[1])} />);
    expect(screen.getByRole('button', { name: /Ustadha Amina/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button', { name: /Ustadh Bilal/ })[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('switches day tabs', async () => {
    render(<SlotPicker slots={SLOTS} timeZone="Asia/Karachi" onSelect={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    await userEvent.click(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('tabpanel')).getAllByRole('button')).toHaveLength(1);
  });

  it('shows an empty message with no slots', () => {
    render(<SlotPicker slots={[]} timeZone="UTC" onSelect={vi.fn()} />);
    expect(screen.getByText(/no open times/i)).toBeTruthy();
  });
});

describe('TimezoneSelect', () => {
  it('lists the detected zone first and reports changes', async () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="Asia/Karachi" detected="Asia/Karachi" onChange={onChange} />);
    const select = screen.getByLabelText(/times shown in/i);
    // The detected zone is the current value and is labelled as such.
    expect(screen.getByText(/Asia\/Karachi \(detected\)/)).toBeTruthy();
    // Several hundred IANA zones: filter by typing, as a user would.
    await userEvent.type(select, 'Europe/Lon');
    await chooseOption(select, /^Europe\/London/);
    expect(onChange).toHaveBeenCalledWith('Europe/London');
  }, 15_000);
});

// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotPicker, TimezoneSelect, calendarCells, slotKey, uniqueSlots } from '@/components/booking/SlotPicker';
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
    // Two teachers free at 10:00 UTC show as one time chip.
    expect(within(panel).getAllByText(formatSlotTime('2026-10-16T10:00:00.000Z', 'Asia/Karachi'))).toHaveLength(1);
    expect(within(panel).getByRole('button', { name: /2 teachers free/ })).toBeTruthy();
  });

  it('shows the same instants in a different zone when the zone changes', () => {
    const { rerender } = render(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getAllByText(formatSlotTime('2026-10-16T21:30:00.000Z', 'UTC'))).toHaveLength(1);
    rerender(<SlotPicker slots={SLOTS} timeZone="America/New_York" onSelect={vi.fn()} />);
    expect(screen.getAllByText(formatSlotTime('2026-10-16T10:00:00.000Z', 'America/New_York')).length).toBeGreaterThan(0);
  });

  it('books the first free teacher by default, or the teacher chosen in the dropdown', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /2 teachers free/ }));
    expect(onSelect).toHaveBeenLastCalledWith(SLOTS[0]);

    await chooseOption(screen.getByLabelText('Teacher'), 'Ustadha Amina');
    const amina = screen.getByRole('button', { name: /Ustadha Amina/ });
    await userEvent.click(amina);
    expect(onSelect).toHaveBeenLastCalledWith(SLOTS[1]);

    rerender(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={onSelect} selectedKey={slotKey(SLOTS[1])} />);
    expect(screen.getByRole('button', { name: /Ustadha Amina/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('Ustadha Amina');
  }, 15_000);

  it('preselects the teacher chosen earlier and shows only their times', () => {
    render(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={vi.fn()} defaultTeacherId="t2" />);
    expect(screen.getByText('Ustadha Amina')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /1 time/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ustadha Amina/ })).toBeTruthy();
  });

  it('merges duplicate teacher+time rows from the API', () => {
    expect(uniqueSlots([...SLOTS, SLOTS[0]])).toHaveLength(3);
    render(<SlotPicker slots={[...SLOTS, SLOTS[0], SLOTS[2]]} timeZone="UTC" onSelect={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /2 times/ })).toBeTruthy();
  });

  it('groups a day by part of the day', () => {
    render(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Morning' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Night' })).toBeTruthy();
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

describe('SlotPicker calendar', () => {
  it('lays out a Monday-first month and only lets open days be picked', () => {
    // 1 Nov 2026 is a Sunday, so six blank cells come first.
    const cells = calendarCells('2026-11');
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(cells.filter(Boolean)).toHaveLength(30);
    render(<SlotPicker slots={SLOTS} timeZone="UTC" onSelect={vi.fn()} />);
    expect(screen.getByText(/October 2026/)).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: /2 times/ })).toBeTruthy();
  });
});

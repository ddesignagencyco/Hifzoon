// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseTransitionControl } from '@/components/cases/CaseTransitionControl';

const buttonNames = () => screen.queryAllByRole('button').map((b) => b.textContent?.trim());

describe('CaseTransitionControl', () => {
  it('offers only the states reachable from OPEN, with close disabled until a note exists', () => {
    render(<CaseTransitionControl status="OPEN" noteCount={0} onTransition={vi.fn()} />);
    expect(buttonNames()).toEqual(['Move to investigating', 'Move to actioned', 'Move to closed']);
    expect((screen.getByRole('button', { name: 'Move to closed' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/add at least one note/i)).toBeTruthy();
  });

  it('never offers going back to OPEN or staying in the same state', () => {
    render(<CaseTransitionControl status="INVESTIGATING" noteCount={1} onTransition={vi.fn()} />);
    expect(buttonNames()).toEqual(['Move to actioned', 'Move to closed']);
    expect(screen.queryByRole('button', { name: /open/i })).toBeNull();
  });

  it('offers nothing for a closed case', () => {
    render(<CaseTransitionControl status="CLOSED" noteCount={4} onTransition={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/closed cases are final/i)).toBeTruthy();
  });

  it('transitions immediately to a non-final state', async () => {
    const onTransition = vi.fn();
    render(<CaseTransitionControl status="ACTIONED" noteCount={1} onTransition={onTransition} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to investigating' }));
    expect(onTransition).toHaveBeenCalledWith('INVESTIGATING');
  });

  it('asks for confirmation before closing', async () => {
    const onTransition = vi.fn();
    render(<CaseTransitionControl status="INVESTIGATING" noteCount={2} onTransition={onTransition} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to closed' }));
    expect(onTransition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm close' }));
    expect(onTransition).toHaveBeenCalledWith('CLOSED');
  });
});

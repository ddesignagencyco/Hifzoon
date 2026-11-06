// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PhoneInput, formatPhoneNumber } from '@/components/ui/PhoneInput';

afterEach(cleanup);

/** A form like /apply-teacher: the phone field follows the chosen country of residence. */
function Harness({ country: initialCountry = '' }: { country?: string }) {
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState(initialCountry);
  return (
    <>
      <PhoneInput id="phone" value={phone} onChange={setPhone} defaultCountry={country || 'PK'} />
      <button type="button" onClick={() => setCountry('GB')}>
        Choose UK
      </button>
      <output data-testid="stored">{phone}</output>
    </>
  );
}

const stored = () => screen.getByTestId('stored').textContent;
const dialButton = () => screen.getByRole('button', { name: /Select country code/ });

describe('PhoneInput', () => {
  it('reads a typed +CC as the country and keeps every digit', () => {
    render(<Harness />);
    fireEvent.change(document.getElementById('phone') as HTMLInputElement, { target: { value: '+447700900123' } });
    expect(stored()).toBe('+44 7700 900 123');
    expect(dialButton().getAttribute('aria-label')).toContain('+44');
  });

  it('follows the country chosen on the form until a dial code is picked', () => {
    render(<Harness />);
    expect(dialButton().getAttribute('aria-label')).toContain('+92');
    fireEvent.click(screen.getByRole('button', { name: 'Choose UK' }));
    expect(dialButton().getAttribute('aria-label')).toContain('+44');
    fireEvent.change(document.getElementById('phone') as HTMLInputElement, { target: { value: '7700900123' } });
    expect(stored()).toBe('+44 7700 900 123');
  });

  it('re-dials a number already typed when the country changes', () => {
    render(<Harness />);
    fireEvent.change(document.getElementById('phone') as HTMLInputElement, { target: { value: '7700900123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose UK' }));
    expect(stored()).toBe('+44 7700 900 123');
  });

  it('never drops digits past the usual length', () => {
    expect(formatPhoneNumber('447700900123', '+92')).toBe('447 700 9001 23');
    expect(formatPhoneNumber('7700900123', '+44')).toBe('7700 900 123');
  });
});

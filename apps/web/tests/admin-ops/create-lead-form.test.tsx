// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateLeadForm } from '@/components/admin/crm/CreateLeadForm';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';
import { chooseOption, findErrorToast, renderWithProviders } from '../helpers/render';

/** The course list behind the "Course interest" dropdown. */
const COURSES = {
  'GET /courses': { body: envelope([{ id: 'c-hifz', code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: '', levels: [] }]) },
};

function renderForm(onCreated = vi.fn()) {
  renderWithProviders(<CreateLeadForm onCreated={onCreated} />);
  return { onCreated };
}

describe('CreateLeadForm', () => {
  it('blocks submission with DTO errors and sends nothing', async () => {
    const api = mockApi(COURSES);
    renderForm();
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText(/child's age/i), { target: { value: '25' } });
    await userEvent.click(screen.getByRole('button', { name: /create lead/i }));
    // Per-field messages stay available to screen readers inside the form.
    const form = within(screen.getByRole('form', { name: /create lead/i }));
    expect(form.getByText('Contact name is required.')).toBeTruthy();
    expect(form.getByText('Enter a valid email address.')).toBeTruthy();
    expect(form.getByText("Child's age must be a whole number from 3 to 18.")).toBeTruthy();
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    // The first problem is announced as a toast; the field is marked invalid.
    await findErrorToast('Contact name is required.');
    expect(screen.getByLabelText(/contact name/i).getAttribute('aria-invalid')).toBe('true');
  });

  it('posts only filled fields, normalised, and reports the created lead', async () => {
    const api = mockApi({
      ...COURSES,
      'POST /admin/crm/leads': (call) => ({ status: 201, body: envelope({ id: 'lead-1', status: 'NEW', ...(call.body as object) }) }),
    });
    const { onCreated } = renderForm();
    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: '  Amina Yusuf ' } });
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+447700900999' } });
    fireEvent.change(screen.getByLabelText(/child's age/i), { target: { value: '8' } });
    await screen.findByText('Not sure yet'); // the course list has loaded
    await chooseOption(screen.getByLabelText(/course interest/i), 'Hifz');
    await chooseOption(screen.getByLabelText(/^country/i), /United Kingdom/);
    await screen.findByText(/United Kingdom/);
    await userEvent.click(screen.getByRole('button', { name: /create lead/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ contactName: 'Amina Yusuf', phone: '+447700900999', country: 'GB', childAge: 8, courseInterest: 'HIFZ' });
    expect(onCreated.mock.calls[0][0].id).toBe('lead-1');
    // The form resets for the next lead.
    expect((screen.getByLabelText(/contact name/i) as HTMLInputElement).value).toBe('');
  });

  it('keeps the input and shows the API error as a toast, not inline, when the lead is rejected', async () => {
    mockApi({ 'POST /admin/crm/leads': apiError(400, 'VALIDATION_FAILED', 'email must be an email') });
    const { onCreated } = renderForm();
    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'Amina' } });
    await userEvent.click(screen.getByRole('button', { name: /create lead/i }));
    const toast = await findErrorToast('email must be an email');
    // The message appears only inside the toast, never in the form.
    expect(screen.getAllByText('email must be an email')).toHaveLength(1);
    expect(screen.getByRole('form', { name: /create lead/i }).contains(toast)).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/contact name/i) as HTMLInputElement).value).toBe('Amina');
  });
});

// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddChildFlow } from '@/components/parent/AddChildFlow';
import { mockApi, envelope } from '../helpers/fetch-mock';
import { findErrorToast, renderWithProviders, chooseOption, optionLabels } from '../helpers/render';

function renderFlow() {
  return renderWithProviders(<AddChildFlow familyId="fam-1" defaultTimeZone="Europe/London" />);
}

const year = new Date().getUTCFullYear();

describe('AddChildFlow (add child + CR-01 consent)', () => {
  it('validates required fields and the learner age range before calling the API', async () => {
    const api = mockApi({});
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: 'Add child' }));
    // The first problem is toasted; every invalid control is marked, with no inline error text.
    await findErrorToast('Enter the child’s name.');
    expect(screen.getByLabelText(/Child’s name/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/Birth year/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/Gender/).getAttribute('aria-invalid')).toBe('true');

    await user.type(screen.getByLabelText(/Child’s name/), 'Zara');
    await user.type(screen.getByLabelText(/Birth year/), String(year - 1));
    await chooseOption(screen.getByLabelText(/Gender/), /female/i);
    await user.click(screen.getByRole('button', { name: 'Add child' }));
    await findErrorToast(/Learners must be aged 3–25/);
    expect(api.calls).toHaveLength(0);
  }, 15000);

  it('warns about under-13 consent, creates the child, then grants only the chosen purposes', async () => {
    const birthYear = year - 8;
    const api = mockApi({
      'GET /consent/policy-version': { body: envelope({ version: 'v1' }) },
      'POST /families/fam-1/students': (call) => ({
        status: 201,
        body: envelope({
          id: 'stu-new',
          familyId: 'fam-1',
          ...(call.body as object),
          notes: null,
          requiresConsent: true,
          nextStep: 'GRANT_DATA_COLLECTION_CONSENT',
        }),
      }),
      'POST /consent/students/stu-new/grant': { status: 201, body: envelope([]) },
    });
    const user = userEvent.setup();
    renderFlow();

    await user.type(screen.getByLabelText(/Child’s name/), 'Zara');
    await user.type(screen.getByLabelText(/Birth year/), String(birthYear));
    await chooseOption(screen.getByLabelText(/Gender/), /female/i);
    await user.click(screen.getByLabelText(/Kids mode/));
    expect(screen.getByText('Parental consent needed (under 13)')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Add child' }));
    await screen.findByText('Zara is under 13', undefined, { timeout: 4000 });

    const body = api.calls.find((c) => c.url.endsWith('/families/fam-1/students'))?.body;
    expect(body).toEqual({
      displayName: 'Zara',
      birthYear,
      gender: 'FEMALE',
      language: 'en',
      timeZone: 'Europe/London',
      kidsMode: true,
    });

    // Lesson records is pre-selected and required; unticking it blocks submission.
    const dataCollection = screen.getByLabelText(/Lesson records/) as HTMLInputElement;
    expect(dataCollection.checked).toBe(true);
    await user.click(dataCollection);
    await user.click(screen.getByRole('button', { name: 'Record consent' }));
    await findErrorToast(/required before classes can be booked/);

    await user.click(dataCollection);
    await user.click(screen.getByLabelText(/AI recitation feedback/));
    await user.click(screen.getByRole('button', { name: 'Record consent' }));
    await findErrorToast(/confirm you are the child’s parent/);

    await user.click(screen.getByLabelText(/I am Zara’s parent or legal guardian/));
    await user.click(screen.getByRole('button', { name: 'Record consent' }));

    await waitFor(() => expect(screen.getByText('Zara is all set')).toBeTruthy());
    const grant = api.calls.find((c) => c.url.endsWith('/consent/students/stu-new/grant'));
    expect(grant?.body).toEqual({ purposes: ['DATA_COLLECTION', 'AI_VOICE'], method: 'OTHER', policyVersion: 'v1' });
  }, 15000);
});

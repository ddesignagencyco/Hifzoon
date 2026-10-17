// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsentManager } from '@/components/parent/ConsentPanels';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';
import { findErrorToast, renderWithProviders } from '../helpers/render';

const S = 'stu-1';

function consentState(granted: string[]) {
  return envelope({
    studentId: S,
    purposes: ['DATA_COLLECTION', 'CLASS_RECORDING', 'AI_VOICE', 'AI_TRAINING', 'MARKETING'].map((purpose) => ({
      purpose,
      status: granted.includes(purpose) ? 'GRANTED' : 'WITHDRAWN',
      grantedAt: granted.includes(purpose) ? '2026-10-01T00:00:00.000Z' : null,
      withdrawnAt: null,
      policyVersion: granted.includes(purpose) ? 'v1' : null,
    })),
  });
}

function renderManager() {
  return renderWithProviders(<ConsentManager studentId={S} displayName="Maryam" />);
}

describe('ConsentManager (per-purpose grant / withdraw)', () => {
  it('renders each purpose with its state and grants a single purpose', async () => {
    let granted = ['DATA_COLLECTION', 'CLASS_RECORDING', 'AI_VOICE'];
    const api = mockApi({
      [`GET /consent/students/${S}`]: () => ({ body: consentState(granted) }),
      [`POST /consent/students/${S}/grant`]: (call) => {
        granted = [...granted, ...((call.body as { purposes: string[] }).purposes)];
        return { status: 201, body: envelope([]) };
      },
    });
    const user = userEvent.setup();
    renderManager();

    await screen.findByText('Improving AI models');
    expect(screen.getAllByText('Allowed')).toHaveLength(3);
    expect(screen.getByText('Required for classes')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Allow Improving AI models' }));
    await waitFor(() => expect(screen.getAllByText('Allowed')).toHaveLength(4));
    const grant = api.calls.find((c) => c.method === 'POST');
    expect(grant?.body).toEqual({ purposes: ['AI_TRAINING'], method: 'OTHER', policyVersion: 'v1' });
  });

  it('withdraws through a confirmation dialog with a warning for lesson records', async () => {
    let granted = ['DATA_COLLECTION'];
    const api = mockApi({
      [`GET /consent/students/${S}`]: () => ({ body: consentState(granted) }),
      [`POST /consent/students/${S}/withdraw`]: () => {
        granted = [];
        return { status: 201, body: envelope([]) };
      },
    });
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Withdraw Lesson records' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Classes will be blocked')).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Moving abroad');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw consent' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const withdraw = api.calls.find((c) => c.method === 'POST');
    expect(withdraw?.body).toEqual({ purposes: ['DATA_COLLECTION'], reason: 'Moving abroad' });
    await waitFor(() => expect(screen.queryAllByText('Allowed')).toHaveLength(0));
  });

  it('shows an error state with retry when consent cannot be loaded', async () => {
    mockApi({ [`GET /consent/students/${S}`]: apiError(500, 'INTERNAL_ERROR', 'Internal server error') });
    renderManager();
    await findErrorToast('Internal server error');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('shows an access message, not a retry, when the child belongs to another family', async () => {
    mockApi({ [`GET /consent/students/${S}`]: apiError(403, 'NOT_RESOURCE_OWNER', 'Nope') });
    renderManager();
    expect(await screen.findByText('You don’t have access to this')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

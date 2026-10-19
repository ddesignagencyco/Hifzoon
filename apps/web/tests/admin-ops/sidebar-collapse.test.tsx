// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@/lib/types';
import { clearAccessToken } from '@/lib/api/client';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { PortalShell } from '@/components/portal/PortalShell';
import {
  SIDEBAR_COLLAPSED_KEY,
  readSidebarCollapsed,
  resetSidebarCollapsedCache,
  writeSidebarCollapsed,
} from '@/lib/portal/sidebar-pref';

const admin = {
  id: 'u-admin',
  email: 'admin@hifzoon.test',
  name: 'Academy Admin',
  roles: [Role.ADMIN],
  status: 'ACTIVE',
  twoFactorEnabled: true,
  lastActiveAt: null,
  language: 'en',
  timeZone: 'UTC',
};

afterEach(() => {
  clearAccessToken();
  window.localStorage.clear();
  resetSidebarCollapsedCache();
});

function renderShell() {
  mockApi({
    'POST /auth/refresh': { body: envelope({ accessToken: 'tok', expiresIn: 900, user: admin }) },
    'GET /auth/me': { body: envelope(admin) },
    'GET /teacher-changes': { body: envelope([{ id: 'r1' }, { id: 'r2' }]) },
  });
  return renderWithProviders(
    <PortalShell portal="admin">
      <p>Admin content</p>
    </PortalShell>,
  );
}

describe('collapsible portal sidebar', () => {
  it('collapses to an icon rail with labelled links and dot badges, and remembers the choice', async () => {
    const user = userEvent.setup();
    const first = renderShell();

    await user.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');

    const nav = screen.getByRole('navigation', { name: 'Academy admin navigation' });
    const link = within(nav).getByRole('link', { name: /^Teacher changes/ });
    expect(link.getAttribute('title')).toBe('Teacher changes');
    expect(link.textContent).not.toContain('Teacher changes'); // icon only; the name comes from aria-label
    await waitFor(() => expect(within(nav).getByTestId('nav-badge-dot').textContent).toContain('2 open requests'));
    first.unmount();

    // A fresh mount (another page load) starts collapsed.
    resetSidebarCollapsedCache();
    renderShell();
    const expand = await screen.findByRole('button', { name: 'Expand sidebar' });
    await user.click(expand);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('0');
    const nav2 = screen.getByRole('navigation', { name: 'Academy admin navigation' });
    expect(within(nav2).getByRole('link', { name: /Teacher changes/ }).textContent).toContain('Teacher changes');
  }, 15_000);

  it('falls back to expanded when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSidebarCollapsed()).toBe(false);
    expect(() => writeSidebarCollapsed(true)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

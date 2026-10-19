// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import { Role } from '@/lib/types';

const replace = vi.fn();
let pathname = '/admin/users';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

import { canAccessPath, postLoginDestination } from '@/lib/portal/nav';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { clearAccessToken, logoutUser, setAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
  replace.mockReset();
});

describe('post-login destination', () => {
  it('honours a redirect the signed-in roles can open', () => {
    expect(postLoginDestination('/admin/users', [Role.ADMIN])).toBe('/admin/users');
    expect(postLoginDestination('/teacher/timetable', [Role.TEACHER])).toBe('/teacher/timetable');
    expect(postLoginDestination('/book-trial?course=HIFZ', [Role.GUARDIAN])).toBe('/book-trial?course=HIFZ');
    expect(postLoginDestination('/account/security', [Role.TEACHER])).toBe('/account/security');
  });

  it("sends a teacher who inherited an admin redirect to the teacher portal, not a 403", () => {
    expect(postLoginDestination('/admin/users', [Role.TEACHER])).toBe('/teacher');
    expect(postLoginDestination('/parent/billing', [Role.TEACHER])).toBe('/teacher');
    expect(postLoginDestination('/admin/audit', [Role.ADMIN])).toBe('/admin'); // audit is super-admin only
    expect(postLoginDestination('/admin/audit', [Role.SUPER_ADMIN])).toBe('/admin/audit');
  });

  it('maps /dashboard, empty and unsafe targets to the role portal', () => {
    expect(postLoginDestination(null, [Role.GUARDIAN])).toBe('/parent');
    expect(postLoginDestination('/dashboard', [Role.TEACHER])).toBe('/teacher');
    expect(postLoginDestination('https://evil.example/admin', [Role.ADMIN])).toBe('/admin');
  });

  it('does not confuse /teachers (public) with the /teacher portal', () => {
    expect(canAccessPath('/teachers/u-1', [])).toBe(true);
    expect(canAccessPath('/teacher', [])).toBe(false);
  });
});

describe('ProtectedRoute after sign-out', () => {
  it('goes to a plain /login after an explicit sign-out (no redirect back into the old role)', async () => {
    pathname = '/admin/users';
    mockApi({
      'POST /auth/logout': { status: 204 },
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
    });
    setAccessToken('admin-token');
    await logoutUser();
    renderWithProviders(<ProtectedRoute allowedRoles={[Role.ADMIN]}>secret</ProtectedRoute>);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('keeps the redirect when the session simply expired', async () => {
    pathname = '/teacher/timetable';
    mockApi({ 'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session') });
    setAccessToken('live'); // there was a session…
    clearAccessToken(); // …and it expired (no sign-out)
    renderWithProviders(<ProtectedRoute allowedRoles={[Role.TEACHER]}>secret</ProtectedRoute>);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login?redirect=%2Fteacher%2Ftimetable'));
  });

  it('a new sign-in clears an earlier sign-out', async () => {
    pathname = '/parent';
    mockApi({
      'POST /auth/logout': { status: 204 },
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
      'GET /auth/me': { body: envelope(null) },
    });
    setAccessToken('t');
    await logoutUser();
    setAccessToken('fresh'); // signed in again elsewhere
    clearAccessToken(); // …and later the session expires
    renderWithProviders(<ProtectedRoute allowedRoles={[Role.GUARDIAN]}>secret</ProtectedRoute>);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login?redirect=%2Fparent'));
  });

  it('every route guard on the page sees the sign-out, not just the first one', async () => {
    pathname = '/account/security';
    mockApi({
      'POST /auth/logout': { status: 204 },
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
    });
    setAccessToken('t');
    await logoutUser();
    renderWithProviders(
      <>
        <ProtectedRoute>one</ProtectedRoute>
        <ProtectedRoute>two</ProtectedRoute>
      </>,
    );
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(replace.mock.calls.every(([url]) => url === '/login')).toBe(true);
  });
});

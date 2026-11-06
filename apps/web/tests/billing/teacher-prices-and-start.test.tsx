// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { chooseOption, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/parent/start',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

// The session is fixed per test. Every price is in USD, whoever is looking.
const auth = vi.hoisted(() => ({
  state: {
    currentUser: null as null | { roles: string[] },
    isAuthenticated: false,
    isResolved: true,
    isLoading: false,
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.state }));

import { TeacherCard } from '@/components/home/TeacherCard';
import { StartWithTeacher } from '@/components/parent/StartWithTeacher';
import { startWithTeacherHref, startWithTeacherPath } from '@/lib/start-with-teacher';
import { viewerTimeZone } from '@/lib/api/modules/scheduling-admin';
import { weekdayAndTime } from '@/lib/continue-with-teacher';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});
beforeEach(() => {
  auth.state = { currentUser: null, isAuthenticated: false, isResolved: true, isLoading: false };
});

const PRICES = {
  teacherId: 'tp-1',
  currency: 'USD',
  tier: { code: 'SENIOR', name: 'Senior' },
  fromMonthlyMinor: 4_500,
  plans: [
    {
      planId: 'plan-1',
      code: 'P1',
      name: 'Weekly 1×',
      classesPerWeek: 1,
      classMinutes: 30,
      roomType: 'ONE_TO_ONE',
      billingPeriod: 'MONTHLY',
      tierPriced: true,
      monthlyMinor: 4_500,
      months: 1,
      listMinor: 4_500,
      periodDiscountPercent: 0,
      periodPriceMinor: 4_500,
    },
    {
      planId: 'plan-q',
      code: 'Q2',
      name: 'Quarterly 2×',
      classesPerWeek: 2,
      classMinutes: 30,
      roomType: 'ONE_TO_ONE',
      billingPeriod: 'QUARTERLY',
      tierPriced: true,
      monthlyMinor: 8_000,
      months: 3,
      listMinor: 24_000,
      periodDiscountPercent: 10,
      periodPriceMinor: 21_600,
    },
  ],
};

const TEACHER = {
  id: 'tp-1',
  userId: 'u-1',
  name: 'Ustadh Bilal',
  gender: 'MALE' as const,
  languages: ['English'],
  specializations: ['HIFZ'],
  tier: { code: 'SENIOR', name: 'Senior', badgeIcon: null },
};

describe('teacher price on the public teacher card', () => {
  it('shows "From … / month" for the cheapest plan, every plan behind "See plans", and that checkout confirms it', async () => {
    const api = mockApi({
      'GET /quality/teachers/tp-1/rating': {
        body: envelope({ teacherId: 'tp-1', average: null, count: 0, distribution: [] }),
      },
      'GET /billing/teacher-prices': { body: envelope(PRICES) },
    });
    renderWithProviders(<TeacherCard teacher={TEACHER} />);

    const tag = await screen.findByTestId('teacher-price');
    expect(tag.textContent).toMatch(/From (US)?\$45 \/ month/);
    expect(tag.textContent).toMatch(/confirmed at checkout/);
    const call = api.calls.find((c) => c.url.includes('/billing/teacher-prices'))!;
    expect(call.url).toContain('teacherId=tp-1');
    expect(call.url).not.toContain('currency');

    fireEvent.click(within(tag).getByText('See plans'));
    expect(within(tag).getByText('Quarterly 2×')).toBeTruthy();
    expect(tag.textContent).toMatch(/\$80 \/ month/);
    expect(tag.textContent).toMatch(/\$216 per quarter \(save 10%\)/);
    expect(tag.textContent).toMatch(/Sibling and promo discounts may lower it/);
  });

  it('prices in USD for a signed-in guardian too, whatever the family’s country', async () => {
    auth.state = {
      currentUser: { roles: ['GUARDIAN'] },
      isAuthenticated: true,
      isResolved: true,
      isLoading: false,
    };
    const api = mockApi({
      'GET /families': {
        body: envelope([
          { id: 'fam-1', name: 'Ali', country: 'PK', currency: 'USD', createdAt: '', members: [] },
        ]),
      },
      'GET /quality/teachers/tp-1/rating': {
        body: envelope({ teacherId: 'tp-1', average: null, count: 0, distribution: [] }),
      },
      'GET /billing/teacher-prices': { body: envelope(PRICES) },
    });
    renderWithProviders(<TeacherCard teacher={TEACHER} />);
    const tag = await screen.findByTestId('teacher-price');
    expect(tag.textContent).toMatch(/From (US)?\$45 \/ month/);
    expect(api.calls.find((c) => c.url.includes('/billing/teacher-prices'))!.url).not.toContain(
      'currency',
    );
  });

  it('shows no price when the teacher has no plan priced yet', async () => {
    mockApi({
      'GET /quality/teachers/tp-1/rating': {
        body: envelope({ teacherId: 'tp-1', average: null, count: 0, distribution: [] }),
      },
      'GET /billing/teacher-prices': {
        body: envelope({ ...PRICES, fromMonthlyMinor: null, plans: [] }),
      },
    });
    renderWithProviders(<TeacherCard teacher={TEACHER} />);
    await waitFor(() => expect(screen.getByText('Ustadh Bilal')).toBeTruthy());
    expect(screen.queryByTestId('teacher-price')).toBeNull();
  });
});

describe('start with a teacher links', () => {
  it('goes through sign-in with the whole flow address when signed out', () => {
    expect(startWithTeacherHref('tp-1', true)).toBe('/parent/start?teacher=tp-1');
    expect(startWithTeacherHref('tp-1', false)).toBe(
      `/login?redirect=${encodeURIComponent('/parent/start?teacher=tp-1')}`,
    );
    expect(startWithTeacherPath({ student: 's1', course: 'c1' })).toBe(
      '/parent/start?student=s1&course=c1',
    );
  });
});

describe('"Start with this teacher" flow', () => {
  const slotAt = new Date(Date.now() + 3 * 86_400_000);
  slotAt.setUTCMinutes(0, 0, 0);
  const SLOT = {
    teacherId: 'tp-1',
    teacherName: 'Ustadh Bilal',
    startsAt: slotAt.toISOString(),
    endsAt: new Date(slotAt.getTime() + 30 * 60_000).toISOString(),
    localTime: '',
    visitorZone: 'UTC',
    teacherZone: 'UTC',
  };

  function setup(enrolments: unknown[] = []) {
    auth.state = {
      currentUser: { roles: ['GUARDIAN'] },
      isAuthenticated: true,
      isResolved: true,
      isLoading: false,
    };
    return mockApi({
      'GET /families': {
        body: envelope([
          { id: 'fam-1', name: 'Ali', country: 'GB', currency: 'USD', createdAt: '', members: [] },
        ]),
      },
      'GET /families/fam-1/students': {
        body: envelope([
          {
            id: 's1',
            displayName: 'Maryam',
            birthYear: 2016,
            gender: 'FEMALE',
            language: 'en',
            timeZone: 'UTC',
            kidsMode: false,
          },
          {
            id: 's2',
            displayName: 'Yusuf',
            birthYear: 2018,
            gender: 'MALE',
            language: 'en',
            timeZone: 'UTC',
            kidsMode: false,
          },
        ]),
      },
      'GET /courses': {
        body: envelope([
          { id: 'c-hifz', code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: '' },
          { id: 'c-nazra', code: 'NAZRA', name: 'Nazra', type: 'NAZRA', description: '' },
        ]),
      },
      'GET /courses/enrolments/list': { body: envelope(enrolments) },
      'GET /teachers/public': {
        body: envelope([
          {
            id: 'tp-1',
            userId: 'u-1',
            subjects: ['HIFZ'],
            languages: ['en'],
            tier: TEACHER.tier,
            user: { name: 'Ustadh Bilal' },
          },
        ]),
      },
      'GET /billing/teacher-prices': { body: envelope(PRICES) },
      'GET /scheduling/open-slots': { body: envelope([SLOT]) },
      'POST /billing/quote': {
        body: envelope({
          currency: 'USD',
          monthlyMinor: 4_500,
          months: 1,
          listMinor: 4_500,
          periodDiscountPercent: 0,
          periodDiscountMinor: 0,
          periodPriceMinor: 4_500,
          sibling: null,
          promo: null,
          applied: null,
          extraDiscountMinor: 0,
          finalMinor: 4_500,
        }),
      },
      'POST /billing/start-with-teacher': {
        body: envelope({ id: 'sub-1', checkoutUrl: null, firstInvoice: null }),
      },
    });
  }

  it('walks child, course, teacher, plan and weekly times, then starts with exactly those', async () => {
    const api = setup();
    renderWithProviders(<StartWithTeacher initial={{ teacher: 'tp-1' }} />);

    expect(await screen.findByRole('heading', { name: 'Start with Ustadh Bilal' })).toBeTruthy();
    const pay = screen.getByRole('button', { name: /Continue to payment/ }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);

    // 1. Child
    fireEvent.click(await screen.findByRole('radio', { name: 'Maryam' }));
    // 2. Course: only the teacher's own courses are offered, so Hifz is the one choice.
    await waitFor(() => expect(screen.getByText('The courses Ustadh Bilal teaches.')).toBeTruthy());
    // 4. Plan, at this teacher's price
    const plans = await screen.findByRole('radiogroup', { name: 'Plan' });
    expect(within(plans).getByText('Quarterly 2×')).toBeTruthy();
    fireEvent.click(within(plans).getByRole('radio', { name: /Weekly 1×/ }));
    // 5. Weekly times: the teacher's free chip.
    const chip = await screen.findByRole('button', { pressed: false, name: /am|pm/ });
    fireEvent.click(chip);
    await waitFor(() => expect(pay.disabled).toBe(false));
    expect(screen.getByText('1 of 1 chosen')).toBeTruthy();

    fireEvent.click(pay);
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.includes('/billing/start-with-teacher'))).toBe(true),
    );
    const body = api.calls.find((c) => c.url.includes('/billing/start-with-teacher'))!
      .body as Record<string, unknown>;
    const expected = weekdayAndTime(SLOT.startsAt, viewerTimeZone());
    expect(body).toMatchObject({
      familyId: 'fam-1',
      studentId: 's1',
      courseId: 'c-hifz',
      teacherId: 'tp-1',
      planId: 'plan-1',
      schedule: { timeZone: viewerTimeZone(), slots: [expected] },
    });
    // Every price is in USD: the client no longer sends a currency.
    expect(body).not.toHaveProperty('currency');
    expect(api.calls.some((c) => c.url.includes('/billing/subscribe'))).toBe(false);
    // The quote was asked with the child, so a sibling discount can apply before paying.
    const quote = api.calls.find((c) => c.url.includes('/billing/quote'))!.body as Record<
      string,
      unknown
    >;
    expect(quote).toMatchObject({ studentId: 's1', teacherId: 'tp-1', planId: 'plan-1' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/parent/billing'));
  }, 20_000);

  it('stops a child already enrolled in the course from starting it again', async () => {
    setup([
      {
        id: 'e1',
        status: 'ACTIVE',
        student: { id: 's1', displayName: 'Maryam' },
        course: { id: 'c-hifz', code: 'HIFZ', name: 'Hifz' },
        teacher: null,
      },
    ]);
    renderWithProviders(<StartWithTeacher initial={{ teacher: 'tp-1', student: 's1' }} />);
    expect(await screen.findByText(/Maryam is already enrolled in Hifz/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Continue to payment/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('without a teacher, offers the course’s teachers with their price', async () => {
    setup();
    renderWithProviders(<StartWithTeacher initial={{ student: 's1' }} />);
    expect(
      await screen.findByRole('heading', { name: 'Choose a teacher and start now' }),
    ).toBeTruthy();
    expect(await screen.findByText('Choose a course to see its teachers.')).toBeTruthy();
    await chooseOption(await screen.findByLabelText(/Course/), 'Hifz');
    const group = await screen.findByRole('radiogroup', { name: 'Teacher' });
    await waitFor(() => expect(group.textContent).toMatch(/From (US)?\$45 \/ month/));
    fireEvent.click(within(group).getByRole('radio', { name: /Ustadh Bilal/ }));
    expect(await screen.findByRole('heading', { name: 'Start with Ustadh Bilal' })).toBeTruthy();
  });
});

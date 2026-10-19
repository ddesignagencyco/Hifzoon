// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { submittedLessonCardIdForClass } from '@/lib/api/modules/lessons';
import { ClassLessonCardLink } from '@/components/qa/ClassLessonCardLink';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PREFILL = 'GET /classes/cls-1/lesson-card/prefill';

describe('lesson card for a class (supervisor)', () => {
  it('reads the card id from the prefill 409, and null when none is submitted', async () => {
    mockApi({ [PREFILL]: apiError(409, 'CONFLICT', 'This lesson card has already been submitted', { lessonCardId: 'lc-7', locked: true }) });
    await expect(submittedLessonCardIdForClass('cls-1')).resolves.toBe('lc-7');

    mockApi({ [PREFILL]: { body: envelope({ classId: 'cls-1' }) } });
    await expect(submittedLessonCardIdForClass('cls-1')).resolves.toBeNull();

    mockApi({ [PREFILL]: apiError(403, 'FORBIDDEN', 'Forbidden') });
    await expect(submittedLessonCardIdForClass('cls-1')).rejects.toThrow('Forbidden');
  });

  it('links to the supervisor lesson-card screen after a click when lazy', async () => {
    const api = mockApi({ [PREFILL]: apiError(409, 'CONFLICT', 'Already submitted', { lessonCardId: 'lc-7' }) });
    const user = userEvent.setup();
    renderWithProviders(<ClassLessonCardLink classId="cls-1" lazy />);
    expect(api.calls).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Lesson card' }));
    const link = await screen.findByRole('link', { name: 'Open lesson card' });
    expect(link.getAttribute('href')).toBe('/supervisor/lesson-cards/lc-7');
  });

  it('says when no card has been submitted, and hides itself on 403', async () => {
    mockApi({ [PREFILL]: { body: envelope({ classId: 'cls-1' }) } });
    const first = renderWithProviders(<ClassLessonCardLink classId="cls-1" />);
    expect(await screen.findByText('No lesson card yet')).toBeTruthy();
    first.unmount();

    mockApi({ [PREFILL]: apiError(403, 'FORBIDDEN', 'Forbidden') });
    const { container } = renderWithProviders(<ClassLessonCardLink classId="cls-1" />);
    await vi.waitFor(() => expect(container.textContent).toBe(''));
  });
});

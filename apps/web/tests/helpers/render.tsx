import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Renders a component with the same providers the app root uses (React Query +
 * site-wide toasts). Use in jsdom component tests:  `// @vitest-environment jsdom`.
 */
export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

/** Waits for an error toast containing `text` (toasts render with role="alert"). */
export async function findErrorToast(text: string | RegExp) {
  const alerts = await screen.findAllByRole('alert');
  const match = alerts.find((el) => within(el).queryByText(text));
  if (!match) throw new Error(`No error toast matching ${String(text)}; got: ${alerts.map((a) => a.textContent).join(' | ')}`);
  return match;
}

/** Waits for a success toast containing `text` (role="status"). */
export async function findSuccessToast(text: string | RegExp) {
  const items = await screen.findAllByRole('status');
  const match = items.find((el) => within(el).queryByText(text));
  if (!match) throw new Error(`No success toast matching ${String(text)}; got: ${items.map((a) => a.textContent).join(' | ')}`);
  return match;
}

/**
 * Opens a site `Select` (react-select) and picks the option whose visible label matches.
 * `control` is the select's input — e.g. `screen.getByLabelText('Gender')`.
 */
export async function chooseOption(control: HTMLElement, option: string | RegExp) {
  await openSelect(control);
  const match = (await screen.findAllByRole('option')).find((el) =>
    typeof option === 'string' ? el.textContent?.trim() === option : option.test(el.textContent ?? ''),
  );
  if (!match) throw new Error(`No option matching ${String(option)}`);
  fireEvent.click(match);
}

/** Visible option labels of a site `Select`, in order (opens then closes the menu). */
export async function optionLabels(control: HTMLElement): Promise<string[]> {
  await openSelect(control);
  const labels = (await screen.findAllByRole('option')).map((el) => el.textContent?.trim() ?? '');
  fireEvent.keyDown(control, { key: 'Escape', code: 'Escape', keyCode: 27 });
  return labels;
}

async function openSelect(control: HTMLElement) {
  fireEvent.focus(control);
  fireEvent.keyDown(control, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
}

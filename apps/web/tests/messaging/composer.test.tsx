// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageComposer } from '@/components/messaging/MessageComposer';

describe('MessageComposer', () => {
  it('disables Send until there is text', async () => {
    render(<MessageComposer onSend={vi.fn().mockResolvedValue(undefined)} />);
    const send = screen.getByRole('button', { name: 'Send message' });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Message'), '   ');
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Message'), 'Salam');
    expect((send as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends the trimmed text on Enter and clears the draft', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;

    await userEvent.type(box, '  Salam ustadh  {Enter}');
    expect(onSend).toHaveBeenCalledWith('Salam ustadh');
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('Shift+Enter adds a new line instead of sending', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe('line one\nline two');
  });

  it('keeps the draft when sending fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('offline'));
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    await userEvent.type(box, 'Please keep me');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(box.value).toBe('Please keep me');
  });

  it('is disabled while a send is pending', () => {
    render(<MessageComposer onSend={vi.fn()} pending />);
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('holds back messages that contain contact details', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);
    await userEvent.type(screen.getByLabelText('Message'), 'Text me on 07700 900123{Enter}');
    expect(screen.getByText('Please remove contact details')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('blocks messages over 4000 characters', async () => {
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText('Message');
    await userEvent.click(box);
    await userEvent.paste('a'.repeat(4001));
    expect(screen.getByText('4001/4000')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

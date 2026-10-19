import { afterEach, vi } from 'vitest';

// Component tests run under jsdom; unmount React trees between tests.
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
  vi.restoreAllMocks();
});

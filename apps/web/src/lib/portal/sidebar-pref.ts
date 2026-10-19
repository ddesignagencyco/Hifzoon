import { useCallback, useSyncExternalStore } from 'react';

/**
 * Desktop sidebar collapsed / expanded, remembered per browser. Storage can be unavailable
 * (private mode, blocked site data): every access is guarded and the sidebar then simply
 * starts expanded.
 */
export const SIDEBAR_COLLAPSED_KEY = 'hifzoon:sidebar-collapsed';
const CHANGE_EVENT = 'hifzoon:sidebar-collapsed-change';

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Non-critical: the choice just isn't remembered.
  }
}

// In-memory copy so the toggle works even when storage throws.
let memory: boolean | null = null;

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SIDEBAR_COLLAPSED_KEY) {
      memory = null;
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): boolean {
  if (memory === null) memory = readSidebarCollapsed();
  return memory;
}

/** Server render (and first hydration pass) always shows the expanded sidebar. */
function getServerSnapshot(): boolean {
  return false;
}

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((next: boolean) => {
    memory = next;
    writeSidebarCollapsed(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [collapsed, set];
}

/** Test helper: forget the in-memory copy so the next read comes from storage. */
export function resetSidebarCollapsedCache(): void {
  memory = null;
}

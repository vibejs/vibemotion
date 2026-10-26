import { vi } from 'vitest';

/** A controllable `prefers-reduced-motion` media query that counts its listeners. */
export function mockReducedMotion(initial = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) =>
      listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) =>
      listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    listeners,
    set(matches: boolean) {
      query.matches = matches;
      for (const fn of listeners) fn({ matches } as MediaQueryListEvent);
    },
  };
}

/** Waits for Motion's frame loop and Vibe.js flushes. */
export const frames = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

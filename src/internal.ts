import {
  getCurrentScope,
  isRef,
  nextTick,
  onScopeDispose,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from '@usevibejs/ui';

/**
 * An element, a ref or template ref holding one, or a getter returning one. `null` and
 * `undefined` mean "not rendered yet": the composable waits for the element to appear.
 */
export type ElementTarget<E extends Element = Element> = MaybeRefOrGetter<E | null | undefined>;

/** Requires an owner before allocating a Motion resource. */
export function requireScope(): void {
  if (!getCurrentScope()?.active)
    throw motionError('Call composables in component setup or an active effectScope().run().');
}

/** Registers cleanup with the active public Vibe.js scope. */
export function onDispose(fn: () => void): void {
  requireScope();
  onScopeDispose(fn);
}

/**
 * Calls `setup` for the current element of `target` and the cleanup it returns when the element
 * is replaced, removed or the scope stops. Runs after Vibe.js has flushed the DOM, so the element
 * is connected. Returns a function that stops watching and runs the pending cleanup.
 */
export function bindElement<E extends Element>(
  target: ElementTarget<E>,
  setup: (element: E) => (() => void) | void,
): () => void {
  requireScope();
  let cleanup: (() => void) | void;
  let active = true;
  const release = () => {
    const fn = cleanup;
    cleanup = undefined;
    fn?.();
  };
  const stopWatch = watch(
    () => toValue(target),
    (element) => {
      release();
      if (element && active) cleanup = setup(element);
    },
    { immediate: true, flush: 'post' },
  );
  const stop = () => {
    if (!active) return;
    active = false;
    stopWatch();
    release();
  };
  onDispose(() => {
    stop();
    if (isRef(target))
      void nextTick(() => {
        void target.value;
      });
  });
  return stop;
}

/** Throws a VibeMotion error with a stable prefix. */
export function motionError(message: string): Error {
  return new Error(`[VibeMotion] ${message}`);
}

/** Shallow equality of two JSON-like animation targets; used to skip redundant animations. */
export function sameTarget(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = Object.keys(a);
  const right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.hasOwn(b, key) &&
        sameTarget((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

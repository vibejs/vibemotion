import {
  computed,
  hasInjectionContext,
  inject,
  provide,
  shallowRef,
  toValue,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
} from '@usevibejs/ui';
import type { AnimationOptions } from 'motion';
import { onDispose, requireScope } from './internal.ts';

/**
 * - `'user'` follows the `prefers-reduced-motion` media query (default).
 * - `'always'` reduces motion regardless of the preference.
 * - `'never'` ignores the preference; only for motion that carries meaning, never for decoration.
 */
export type ReducedMotionSetting = 'user' | 'always' | 'never';

export interface MotionConfig {
  /** How VibeMotion reacts to `prefers-reduced-motion`. Defaults to `'user'`. */
  reducedMotion?: ReducedMotionSetting;
  /** Jump every animation to its end state. For tests, screenshots or an app-level switch. */
  skipAnimations?: boolean;
  /** The default transition merged under every animation's own options. */
  transition?: AnimationOptions;
}

/** The injection key behind `provideMotionConfig()`. `app.provide(motionConfigKey, config)` sets it app-wide. */
export const motionConfigKey: InjectionKey<MaybeRefOrGetter<MotionConfig>> =
  Symbol('vibemotion.config');

/** Sets the motion configuration for the calling component and its descendants. */
export function provideMotionConfig(config: MaybeRefOrGetter<MotionConfig>): void {
  provide(motionConfigKey, config);
}

const QUERY = '(prefers-reduced-motion: reduce)';
const prefersReduced = shallowRef(false);
let subscribers = 0;
let media: MediaQueryList | undefined;
const onChange = (event: MediaQueryListEvent) => {
  prefersReduced.value = event.matches;
};

/** One shared `matchMedia` listener, kept while at least one consumer is alive. */
function subscribe(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  if (subscribers++ === 0) {
    media = window.matchMedia(QUERY);
    prefersReduced.value = media.matches;
    media.addEventListener('change', onChange);
  }
  onDispose(() => {
    if (--subscribers === 0) {
      media?.removeEventListener('change', onChange);
      media = undefined;
    }
  });
}

/** The resolved configuration of the calling component. */
export interface ResolvedMotion {
  readonly reduced: ComputedRef<boolean>;
  readonly config: ComputedRef<MotionConfig>;
}

export function useMotionSettings(): ResolvedMotion {
  requireScope();
  const source = hasInjectionContext() ? inject(motionConfigKey, {}) : {};
  const config = computed(() => toValue(source));
  subscribe();
  const reduced = computed(() => {
    const setting = config.value.reducedMotion ?? 'user';
    return setting === 'always' || (setting === 'user' && prefersReduced.value);
  });
  return { reduced, config };
}

/**
 * Whether motion should be reduced: the user's `prefers-reduced-motion` preference combined with
 * the nearest `provideMotionConfig()`. Updates when either changes.
 */
export function useReducedMotion(): ComputedRef<boolean> {
  return useMotionSettings().reduced;
}

/** Merges the configured defaults and the accessibility flags into animation options. */
export function applySettings<O extends object>(settings: ResolvedMotion, options?: O): O {
  const { transition, skipAnimations } = settings.config.value;
  const merged: Record<string, unknown> = { ...transition, ...options };
  merged.reduceMotion = settings.reduced.value;
  if (skipAnimations) merged.skipAnimations = true;
  return merged as O;
}

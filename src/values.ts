import { isRef, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from '@usevibejs/ui';
import {
  attachSpring,
  attrEffect,
  isMotionValue,
  mapValue,
  motionValue,
  styleEffect,
  transformValue,
  type MotionValue,
  type SpringOptions,
  type TransformOptions,
} from 'motion';
import { useMotionSettings } from './config.ts';
import { bindElement, onDispose, requireScope, type ElementTarget } from './internal.ts';

/**
 * Ownership: a motion value created by a VibeMotion composable is destroyed with the scope that
 * created it. A motion value passed in by the caller is only read or subscribed to, never
 * destroyed.
 */
function own<T>(value: MotionValue<T>): MotionValue<T> {
  onDispose(() => value.destroy());
  return value;
}

/** A Motion value, destroyed when the calling scope stops. Changing it never re-renders Vibe.js. */
export function useMotionValue<T>(initial: T): MotionValue<T> {
  requireScope();
  return own(motionValue(initial));
}

type SpringSource = number | MotionValue<number> | MaybeRefOrGetter<number>;

function sourceValue(source: SpringSource): MotionValue<number> | number {
  if (isMotionValue(source)) return source as MotionValue<number>;
  if (typeof source === 'number') return source;
  // A ref or getter feeds an owned motion value that the spring follows.
  const reactive = source as MaybeRefOrGetter<number>;
  const input = own(motionValue(toValue(reactive)));
  watch(
    () => toValue(reactive),
    (next) => input.set(next),
    { flush: 'sync' },
  );
  return input;
}

/**
 * A motion value that follows `source` with a spring: a number, a motion value, or a ref or getter
 * of a number. `options` can be reactive; a change applies from the current velocity. With reduced
 * motion the value follows its source instantly.
 */
export function useSpring(
  source: SpringSource,
  options: MaybeRefOrGetter<SpringOptions | undefined> = {},
): MotionValue<number> {
  requireScope();
  const input = sourceValue(source);
  const initial = typeof input === 'number' ? input : input.get();
  const output = own(motionValue(initial));
  const settings = useMotionSettings();
  let detach: (() => void) | undefined;
  watch(
    () =>
      [toValue(options), settings.reduced.value || !!settings.config.value.skipAnimations] as const,
    ([spring, isReduced]) => {
      detach?.();
      detach = undefined;
      if (isReduced) {
        if (typeof input === 'number') output.jump(input);
        else {
          output.jump(input.get());
          detach = input.on('change', (latest) => output.jump(latest));
        }
      } else detach = attachSpring(output, input, spring);
    },
    { immediate: true },
  );
  onDispose(() => detach?.());
  return output;
}

/**
 * A derived motion value.
 * - `useTransform(() => x.get() * 2)` recomputes from the motion values the function reads.
 * - `useTransform(progress, [0, 1], ['#fff', '#000'])` maps a number through ranges, with clamping
 *   and easing from `options`.
 */
export function useTransform<O>(compute: () => O): MotionValue<O>;
export function useTransform<O>(
  input: MotionValue<number>,
  inputRange: number[],
  outputRange: O[],
  options?: TransformOptions<O>,
): MotionValue<O>;
export function useTransform<O>(
  input: MotionValue<number> | (() => O),
  inputRange?: number[],
  outputRange?: O[],
  options?: TransformOptions<O>,
): MotionValue<O> {
  requireScope();
  if (typeof input === 'function') return own(transformValue(input));
  return own(mapValue(input, inputRange ?? [], outputRange ?? [], options));
}

/**
 * Opts in to reactive observation of a motion value: a readonly ref updated on each change (each explicit set may emit). Use it for text or logic; bind motion values to styles with
 * `useMotionStyle()` instead, which skips Vibe.js rendering entirely.
 */
export function useMotionValueState<T>(value: MotionValue<T>): Readonly<Ref<T>> {
  requireScope();
  const state = shallowRef(value.get());
  const unsubscribe = value.on('change', (latest) => (state.value = latest));
  onDispose(unsubscribe);
  return state;
}

/** Reads the velocity of a motion value in units per second (not reactive). */
export const getVelocity = (value: MotionValue<number>): number => value.getVelocity();

type EffectValues = Record<string, MotionValue | string | number>;

type Effect = (element: HTMLElement | SVGElement, values: EffectValues) => () => void;

function useEffect(
  effect: Effect,
  target: ElementTarget<HTMLElement | SVGElement>,
  values: MaybeRefOrGetter<EffectValues>,
): () => void {
  let current: HTMLElement | SVGElement | undefined;
  let remove: (() => void) | undefined;
  const apply = () => {
    remove?.();
    remove = undefined;
    if (!current) return;
    // Motion's effects accept MotionValues, not static scalars. Own only values we create here.
    const owned: MotionValue[] = [];
    const resolved = Object.fromEntries(
      Object.entries(toValue(values)).map(([key, value]) => {
        if (isMotionValue(value)) return [key, value];
        const wrapped = motionValue(value);
        owned.push(wrapped);
        return [key, wrapped];
      }),
    );
    const unbind = effect(current, resolved);
    remove = () => {
      unbind();
      for (const value of owned) value.destroy();
    };
  };
  const stopElement = bindElement(target, (element) => {
    current = element;
    apply();
    return () => {
      remove?.();
      remove = current = undefined;
    };
  });
  const stopValues =
    isRef(values) || typeof values === 'function' ? watch(() => toValue(values), apply) : undefined;
  const stop = () => {
    stopValues?.();
    stopElement();
  };
  onDispose(stop);
  return stop;
}

/**
 * Binds motion values (or static values) to the element's styles through Motion's frame loop,
 * batching writes once per frame. Transforms such as `x`, `scale` and `rotate` compose into one
 * `transform`. Vibe.js owns the other style bindings; do not bind the same property in both.
 */
export function useMotionStyle(
  target: ElementTarget<HTMLElement | SVGElement>,
  styles: MaybeRefOrGetter<EffectValues>,
): () => void {
  return useEffect(styleEffect as Effect, target, styles);
}

/** Binds motion values to attributes, for example an SVG path's `pathLength` or a `d` string. */
export function useMotionAttrs(
  target: ElementTarget<HTMLElement | SVGElement>,
  attrs: MaybeRefOrGetter<EffectValues>,
): () => void {
  return useEffect(attrEffect as Effect, target, attrs);
}

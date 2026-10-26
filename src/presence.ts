import {
  nextTick,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from '@usevibejs/ui';
import type { AnimationOptions, AnimationPlaybackControlsWithThen } from 'motion';
import { createAnimate } from './animate.ts';
import { useMotionSettings } from './config.ts';
import { bindElement, onDispose, type ElementTarget } from './internal.ts';
import type { LayoutMotion } from './layout.ts';
import {
  fromTo,
  resolveTarget,
  splitTarget,
  type MotionTarget,
  type TargetOrVariant,
  type Variants,
} from './target.ts';

type AnimatedElement = HTMLElement | SVGElement;

export interface PresenceAnimationOptions<V extends string = string> {
  variants?: Variants<V>;
  /** Where entering content starts. */
  initial?: TargetOrVariant<NoInfer<V>>;
  /** The resting state of present content. */
  animate?: TargetOrVariant<NoInfer<V>>;
  /** Where exiting content animates to before it is removed. */
  exit?: TargetOrVariant<NoInfer<V>>;
  /** The default transition; a target's own `transition` overrides it. */
  transition?: AnimationOptions;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Shared enter/exit animation logic of the presence composables. */
function createPresenceAnimator<V extends string>(options: PresenceAnimationOptions<V>) {
  const animate = createAnimate(useMotionSettings());
  const resolve = (definition: TargetOrVariant<V> | undefined) =>
    resolveTarget(definition, options.variants);
  const [initial] = splitTarget(resolve(options.initial));
  const run = (element: AnimatedElement, target: MotionTarget, from?: MotionTarget) => {
    const [keyframes, transition] = splitTarget(target);
    const frames = from ? fromTo(from, keyframes as Record<string, unknown>) : keyframes;
    return animate(element, frames as never, { ...options.transition, ...transition });
  };
  return {
    animate,
    /** Animates from `initial` to `animate`; `instant` jumps there (no appear animation). */
    enter(element: AnimatedElement, instant: boolean): AnimationPlaybackControlsWithThen {
      const target = resolve(options.animate);
      if (instant)
        return animate(
          element,
          splitTarget(target)[0] as never,
          { duration: 0, delay: 0, type: false } as AnimationOptions,
        );
      return run(element, target, initial);
    },
    /** Animates back to `animate` from wherever an interrupted exit left the element. */
    resume: (element: AnimatedElement) => run(element, resolve(options.animate)),
    exit: (element: AnimatedElement) => run(element, resolve(options.exit)),
  };
}

/** Exiting content cannot be focused, clicked or read by assistive technology. */
const exitingAttributes = new WeakMap<
  AnimatedElement,
  { inert: string | null; hidden: string | null }
>();
function setExiting(element: AnimatedElement, exiting: boolean): void {
  if (exiting) {
    if (!exitingAttributes.has(element))
      exitingAttributes.set(element, {
        inert: element.getAttribute('inert'),
        hidden: element.getAttribute('aria-hidden'),
      });
    element.setAttribute('inert', '');
    element.setAttribute('aria-hidden', 'true');
  } else {
    const saved = exitingAttributes.get(element);
    if (!saved) return;
    for (const [key, value] of [
      ['inert', saved.inert],
      ['aria-hidden', saved.hidden],
    ] as const) {
      if (value === null) element.removeAttribute(key);
      else element.setAttribute(key, value);
    }
    exitingAttributes.delete(element);
  }
}

export interface UsePresenceOptions<V extends string = string> extends PresenceAnimationOptions<V> {
  /** Animate the first appearance when `show` starts `true`. Defaults to `true`. */
  appear?: boolean;
  /**
   * Return focus to the element that was focused when the content appeared, if focus is inside
   * the content when it starts exiting. Defaults to `true`.
   */
  restoreFocus?: boolean;
  onEnterComplete?: () => void;
  onExitComplete?: () => void;
}

export interface Presence {
  /** Render the content while this is `true`: `v-if="presence.isPresent"`. */
  readonly isPresent: Readonly<Ref<boolean>>;
  /** The content is playing its exit animation; it is `inert` and hidden from assistive technology. */
  readonly isExiting: Readonly<Ref<boolean>>;
}

/**
 * Keeps conditional content rendered until its exit animation has finished. vibe.js removes a
 * `v-if` branch immediately, so render with `v-if="presence.isPresent"` instead of `v-if="show"`:
 * when `show` turns `false`, the element plays `exit` and only then is `isPresent` cleared.
 * Turning `show` back on during the exit reverses it from the current values; a stale exit
 * never removes content that was shown again.
 *
 * ```ts
 * const open = ref(false)
 * const panel = useTemplateRef<HTMLElement>('panel')
 * const presence = usePresence(open, panel, {
 *   initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 },
 * })
 * // <div v-if="presence.isPresent" ref="panel">…</div>
 * ```
 */
export function usePresence<const V extends string = string>(
  show: MaybeRefOrGetter<boolean>,
  target: ElementTarget<AnimatedElement>,
  options: UsePresenceOptions<V> = {},
): Presence {
  const animator = createPresenceAnimator(options);
  const isPresent = shallowRef(!!toValue(show));
  const isExiting = shallowRef(false);
  const { appear = true, restoreFocus = true } = options;
  let element: AnimatedElement | undefined;
  let generation = 0;
  let firstRender = true;
  let returnFocus: HTMLElement | null = null;

  const rememberFocus = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      returnFocus = document.activeElement;
    }
  };
  if (isPresent.value) rememberFocus();
  // A completion arriving after the scope ended must not touch state or call back.
  onDispose(() => {
    generation++;
    if (element) setExiting(element, false);
  });

  const finishEnter = (animation: AnimationPlaybackControlsWithThen, id: number) =>
    animation.finished.then(() => {
      if (id === generation && !isExiting.value) options.onEnterComplete?.();
    });

  bindElement(target, (el) => {
    element = el;
    const id = ++generation;
    void finishEnter(animator.enter(el, firstRender && !appear), id);
    firstRender = false;
    return () => {
      generation++;
      animator.animate.stop();
      setExiting(el, false);
      if (element === el) element = undefined;
    };
  });

  watch(
    () => !!toValue(show),
    (visible) => {
      const id = ++generation;
      if (visible) {
        if (isExiting.value && element) {
          // Interrupted exit: reverse from the current values.
          isExiting.value = false;
          setExiting(element, false);
          void finishEnter(animator.resume(element), id);
        } else {
          isExiting.value = false;
          rememberFocus();
          isPresent.value = true;
        }
        return;
      }
      if (!isPresent.value) return;
      const el = element;
      if (!el) {
        isPresent.value = false;
        return;
      }
      if (restoreFocus && returnFocus?.isConnected && el.contains(document.activeElement)) {
        returnFocus.focus({ preventScroll: true });
      }
      isExiting.value = true;
      setExiting(el, true);
      animator.exit(el).finished.then(() => {
        if (id !== generation) return;
        isExiting.value = false;
        setExiting(el, false);
        isPresent.value = false;
        options.onExitComplete?.();
      });
    },
  );
  return { isPresent, isExiting };
}

export interface PresenceEntry<T> {
  readonly key: PropertyKey;
  readonly item: T;
  /** The entry left the source list and is playing its exit animation. */
  readonly exiting: boolean;
}

export interface UsePresenceListOptions<
  T,
  V extends string = string,
> extends PresenceAnimationOptions<V> {
  /** A stable identity for each item, also used as the `:key` of the `v-for`. */
  key: (item: T) => PropertyKey;
  /**
   * `'sync'` (default) lets entering and exiting items animate at the same time. `'wait'` adds new
   * items only after every exiting item is gone, for content that replaces other content.
   */
  mode?: 'sync' | 'wait';
  /** Animate the items present on the first render. Defaults to `false`. */
  appear?: boolean;
  /** Animate the positions of the remaining items when entries are added and removed. */
  layout?: LayoutMotion;
  onExitComplete?: (key: PropertyKey) => void;
}

export interface PresenceList<T> {
  /**
   * Render these:
   * `v-for="entry in list.items.value" :key="entry.key" :ref="(el) => list.bind(entry.key, el)"`.
   */
  readonly items: Readonly<ShallowRef<readonly PresenceEntry<T>[]>>;
  /** Connects an entry to its element, from a function ref. vibe.js calls it with `null` on removal. */
  bind(key: PropertyKey, element: unknown): void;
}

/**
 * Presence for a keyed `v-for`: items removed from `source` stay in `items`, at their previous
 * position, until their exit animation finishes. Items added back during their exit reverse from
 * the current values. Use one item (`[activeTab]`) with `mode: 'wait'` for content that swaps.
 */
export function usePresenceList<T, const V extends string = string>(
  source: MaybeRefOrGetter<readonly T[]>,
  options: UsePresenceListOptions<T, V>,
): PresenceList<T> {
  const animator = createPresenceAnimator(options);
  const { key, mode = 'sync', appear = false, layout } = options;
  const entries = (list: readonly T[]) => {
    const seen = new Set<PropertyKey>();
    return list.map((item) => {
      const id = key(item);
      if (seen.has(id)) throw new Error(`[VibeMotion] Duplicate presence key "${String(id)}".`);
      seen.add(id);
      return { key: id, item, exiting: false };
    });
  };
  const items = shallowRef<readonly PresenceEntry<T>[]>(entries(toValue(source)));
  const elements = new Map<PropertyKey, AnimatedElement>();
  const generations = new Map<PropertyKey, number>();
  const bump = (k: PropertyKey) => {
    const next = (generations.get(k) ?? 0) + 1;
    generations.set(k, next);
    return next;
  };
  let disposed = false;
  onDispose(() => {
    disposed = true;
    for (const element of elements.values()) setExiting(element, false);
    elements.clear();
    generations.clear();
  });
  // Items on the first render skip the enter animation unless `appear` is set.
  const initialKeys = new Set(appear ? [] : items.value.map((entry) => entry.key));
  void nextTick(() => initialKeys.clear());

  const commit = (next: readonly PresenceEntry<T>[]) => {
    if (layout && !disposed) void layout.update(() => void (items.value = next));
    else items.value = next;
  };

  const merge = (previous: readonly PresenceEntry<T>[], list: readonly T[]) => {
    const next: PresenceEntry<T>[] = entries(list);
    const keys = new Set(next.map((entry) => entry.key));
    // Retain exits next to their previous surviving neighbour.
    previous.forEach((entry, index) => {
      if (keys.has(entry.key)) return;
      let at = 0;
      for (let j = index - 1; j >= 0; j--) {
        const found = next.findIndex((candidate) => candidate.key === previous[j]!.key);
        if (found >= 0) {
          at = found + 1;
          break;
        }
      }
      next.splice(at, 0, entry.exiting ? entry : { ...entry, exiting: true });
    });
    if (mode === 'wait' && next.some((entry) => entry.exiting)) {
      const before = new Set(previous.filter((entry) => !entry.exiting).map((entry) => entry.key));
      return next.filter((entry) => entry.exiting || before.has(entry.key));
    }
    return next;
  };

  const exit = (entry: PresenceEntry<T>) => {
    const id = bump(entry.key);
    const element = elements.get(entry.key);
    const remove = () => {
      if (generations.get(entry.key) !== id || disposed) return;
      if (element) setExiting(element, false);
      elements.delete(entry.key);
      generations.delete(entry.key);
      const remaining = items.value.filter((candidate) => candidate.key !== entry.key);
      commit(
        mode === 'wait' && !remaining.some((e) => e.exiting)
          ? merge(remaining, toValue(source))
          : remaining,
      );
      options.onExitComplete?.(entry.key);
    };
    if (!element) return remove();
    if (element.contains(document.activeElement)) moveFocus(entry.key);
    setExiting(element, true);
    animator.exit(element).finished.then(remove);
  };

  const moveFocus = (from: PropertyKey) => {
    const list = items.value.filter((entry) => !entry.exiting || entry.key === from);
    const index = list.findIndex((entry) => entry.key === from);
    for (const neighbour of [list[index + 1], list[index - 1]]) {
      const element = neighbour && neighbour.key !== from ? elements.get(neighbour.key) : undefined;
      const focusable = element?.matches(FOCUSABLE)
        ? element
        : element?.querySelector<HTMLElement>(FOCUSABLE);
      if (focusable instanceof HTMLElement) return focusable.focus({ preventScroll: true });
    }
  };

  watch(
    () => [...toValue(source)],
    (list) => {
      const previous = items.value;
      const next = merge(previous, list);
      const wasExiting = new Set(
        previous.filter((entry) => entry.exiting).map((entry) => entry.key),
      );
      commit(next);
      for (const entry of next) {
        if (entry.exiting && !wasExiting.has(entry.key)) exit(entry);
        else if (!entry.exiting && wasExiting.has(entry.key)) {
          // Re-added during its exit: cancel the removal and reverse.
          bump(entry.key);
          const element = elements.get(entry.key);
          if (element) {
            setExiting(element, false);
            animator.resume(element);
          }
        }
      }
    },
  );

  return {
    items,
    bind(k, value) {
      if (disposed) return;
      if (!(value instanceof HTMLElement || value instanceof SVGElement)) {
        // `null` when the element is removed: forget it once the entry is gone.
        if (!items.value.some((entry) => entry.key === k)) elements.delete(k);
        return;
      }
      if (elements.get(k) === value) return;
      elements.set(k, value);
      animator.enter(value, initialKeys.has(k));
    },
  };
}

import { nextTick, shallowRef, toValue, type MaybeRefOrGetter, type Ref } from '@usevibejs/ui';
import { animateLayout, animateView, type AnimationOptions } from 'motion';
import { applySettings, useMotionSettings } from './config.ts';
import { onDispose, type ElementTarget } from './internal.ts';

type Update = () => void | Promise<void>;
type Animation = { stop(): void; finished?: Promise<unknown> } | undefined;

export interface LayoutMotionOptions {
  /** The transition of the layout animation. Reactive; read at each `update()`. */
  transition?: MaybeRefOrGetter<AnimationOptions | undefined>;
  /** Transitions for elements with a given `data-layout-id`, keyed by that id. */
  shared?: Record<string, AnimationOptions>;
}

export interface LayoutMotion {
  /**
   * Applies `mutate` and animates every `[data-layout]` / `[data-layout-id]` element in the scope
   * from its old box to its new one. `mutate` changes reactive state; VibeMotion waits for Vibe.js to
   * flush the DOM before measuring. Calling it during an animation interrupts it from the current
   * visual position. Resolves when the DOM has updated and the animation has started.
   */
  update(mutate: Update): Promise<void>;
  readonly isAnimating: Readonly<Ref<boolean>>;
  /** Stops running layout animations at their current position. */
  stop(): void;
}

/**
 * FLIP layout animations with Motion's `animateLayout()`, synchronised with Vibe.js updates.
 * Mark animated elements with `data-layout` (position and size) or `data-layout-id="id"` (shared
 * identity: an element removed and another added with the same id morph into each other).
 * Animations use transforms, so they never trigger layout during playback. With reduced motion,
 * `update()` applies the change without animating.
 */
export function useLayoutMotion(scope?: ElementTarget, options: LayoutMotionOptions = {}): LayoutMotion {
  const settings = useMotionSettings();
  const isAnimating = shallowRef(false);
  const running = new Set<Animation>();
  let generation = 0;
  let disposed = false;

  const stop = () => {
    generation++;
    for (const animation of running) animation?.stop();
    running.clear();
    isAnimating.value = false;
  };
  onDispose(() => {
    disposed = true;
    stop();
  });

  return {
    isAnimating,
    stop,
    async update(mutate) {
      const commit = async () => {
        await mutate();
        await nextTick();
      };
      if (disposed || settings.reduced.value || settings.config.value.skipAnimations) {
        await commit();
        return;
      }
      const root = scope === undefined ? undefined : (toValue(scope) ?? undefined);
      const transition = applySettings(settings, toValue(options.transition) ?? {});
      const builder = root ? animateLayout(root, commit, transition) : animateLayout(commit, transition);
      for (const [id, shared] of Object.entries(options.shared ?? {})) builder.shared(id, shared);
      const id = ++generation;
      isAnimating.value = true;
      const animation: Animation = await new Promise<Animation>((resolve, reject) =>
        builder.then(resolve as never, reject),
      );
      if (disposed) {
        animation?.stop();
        return;
      }
      running.add(animation);
      const done = () => {
        running.delete(animation);
        if (id === generation) isAnimating.value = false;
      };
      if (animation?.finished) animation.finished.then(done, done);
      else done();
    },
  };
}

export interface ViewTransitionHandle {
  /**
   * Runs `mutate` inside a View Transition, waiting for Vibe.js to flush the DOM before the new
   * snapshot. `configure` receives Motion's `animateView()` builder to add shared elements
   * (`.add(element)`), and enter, exit or layout keyframes. Without View Transition support or
   * with reduced motion, the change applies immediately and nothing animates.
   */
  start(
    mutate: Update,
    configure?: (builder: ReturnType<typeof animateView>) => void,
    options?: AnimationOptions & { interrupt?: 'wait' | 'immediate' },
  ): Promise<void>;
  readonly isTransitioning: Readonly<Ref<boolean>>;
}

/** View Transition API integration through Motion's `animateView()`. */
export function useViewTransition(): ViewTransitionHandle {
  const settings = useMotionSettings();
  const isTransitioning = shallowRef(false);
  let disposed = false;
  onDispose(() => (disposed = true));
  return {
    isTransitioning,
    async start(mutate, configure, options) {
      const commit = async () => {
        await mutate();
        await nextTick();
      };
      const supported = typeof document !== 'undefined' && 'startViewTransition' in document;
      if (disposed || !supported || settings.reduced.value || settings.config.value.skipAnimations) {
        await commit();
        return;
      }
      isTransitioning.value = true;
      try {
        const builder = animateView(commit, applySettings(settings, options));
        configure?.(builder);
        await builder;
      } finally {
        isTransitioning.value = false;
      }
    },
  };
}

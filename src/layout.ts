import {
  isRef,
  nextTick,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
} from '@usevibejs/ui';
import {
  animateLayout,
  animateView,
  scopeMotion,
  type AnimationOptions,
  type AnimationPlaybackControls,
} from 'motion';
import { applySettings, useMotionSettings } from './config.ts';
import { onDispose, type ElementTarget } from './internal.ts';

type Update = () => void | Promise<void>;

export interface LayoutMotionOptions {
  transition?: MaybeRefOrGetter<AnimationOptions | undefined>;
  /** Transitions for explicit data-layout-id values. IDs must be unique across the document. */
  shared?: Record<string, AnimationOptions>;
}
export interface LayoutMotion {
  /** Snapshot, mutate reactive state, await nextTick, then project to the new layout. */
  update(mutate: Update): Promise<void>;
  readonly isAnimating: Readonly<Ref<boolean>>;
  stop(): void;
}

/** Motion's layout engine, scoped to a container and synchronized with Vibe.js DOM updates. */
export function useLayoutMotion(
  scope?: ElementTarget,
  options: LayoutMotionOptions = {},
): LayoutMotion {
  const settings = useMotionSettings();
  const owner = scopeMotion();
  const isAnimating = shallowRef(false);
  const running = new Set<AnimationPlaybackControls>();
  let generation = 0;
  let stoppedThrough = 0;
  let disposed = false;
  const measuredRoots = new Set<Element>();
  const stop = () => {
    stoppedThrough = ++generation;
    for (const animation of running) animation.stop();
    running.clear();
    isAnimating.value = false;
  };
  onDispose(() => {
    disposed = true;
    stop();
    owner.stop();
    // A layout transaction reconciles detached projection nodes through the public engine.
    // Vibe disposes a block's scope before removing its DOM; wait for that removal first.
    const roots = [...measuredRoots];
    measuredRoots.clear();
    void nextTick(() => {
      // Pull the cleared template ref after Vibe has disposed its render scope.
      if (isRef(scope)) void scope.value;
      for (const root of roots)
        if (!root.isConnected) {
          animateLayout(root, () => {}, { skipAnimations: true }).then((animation) =>
            animation.stop(),
          );
        }
    });
  });
  return {
    isAnimating,
    stop,
    async update(mutate) {
      if (disposed) return;
      const commit = async () => {
        if (disposed) return;
        await mutate();
        await nextTick();
      };
      const root = scope === undefined ? undefined : toValue(scope);
      if (
        (scope !== undefined && !root) ||
        settings.reduced.value ||
        settings.config.value.skipAnimations
      ) {
        await commit();
        return;
      }
      // Keep only the current measurement containers, not every historical animated element.
      for (const previous of measuredRoots)
        if (!previous.isConnected) measuredRoots.delete(previous);
      if (root) measuredRoots.add(root);
      else if (typeof document !== 'undefined') {
        for (const element of document.querySelectorAll('[data-layout],[data-layout-id]'))
          measuredRoots.add(element);
      }
      const transition = applySettings(settings, toValue(options.transition) ?? {});
      const id = ++generation;
      isAnimating.value = true;
      try {
        const builder = owner.run(() =>
          root ? animateLayout(root, commit, transition) : animateLayout(commit, transition),
        );
        for (const [sharedId, shared] of Object.entries(options.shared ?? {}))
          builder.shared(sharedId, shared);
        // Do not Promise-resolve a playback control with a .then method (thenable assimilation).
        const { animation } = await new Promise<{ animation: AnimationPlaybackControls }>(
          (resolve, reject) =>
            builder.then((readyAnimation) => resolve({ animation: readyAnimation }), reject),
        );
        if (disposed || id <= stoppedThrough) {
          animation.stop();
          return;
        }
        running.add(animation);
        const done = () => {
          running.delete(animation);
          if (id === generation) isAnimating.value = false;
        };
        animation.finished.then(done, done);
      } catch (error) {
        if (id === generation) isAnimating.value = false;
        throw error;
      }
    },
  };
}

export interface ViewTransitionHandle {
  /** Complete a view transition, or just commit on unsupported browsers or with reduced motion. */
  start(
    mutate: Update,
    configure?: (builder: ReturnType<typeof animateView>) => void,
    options?: AnimationOptions & { interrupt?: 'wait' | 'immediate' },
  ): Promise<void>;
  readonly isTransitioning: Readonly<Ref<boolean>>;
  /** Stops the current transition. Future calls remain available until scope disposal. */
  stop(): void;
}

/** Snapshot transitions through Motion's public builder; crossfade is the default. */
export function useViewTransition(): ViewTransitionHandle {
  const settings = useMotionSettings();
  const isTransitioning = shallowRef(false);
  let owner = scopeMotion();
  let generation = 0;
  let disposed = false;
  const stop = () => {
    generation++;
    owner.stop();
    isTransitioning.value = false;
  };
  onDispose(() => {
    disposed = true;
    stop();
  });
  return {
    isTransitioning,
    stop,
    async start(mutate, configure, options) {
      if (disposed) return;
      const commit = async () => {
        if (!disposed) {
          await mutate();
          await nextTick();
        }
      };
      if (
        typeof document === 'undefined' ||
        typeof document.startViewTransition !== 'function' ||
        settings.reduced.value ||
        settings.config.value.skipAnimations
      ) {
        await commit();
        return;
      }
      if (owner.state !== 'active') owner = scopeMotion();
      const id = ++generation;
      isTransitioning.value = true;
      try {
        const builder = owner.run(() =>
          animateView(commit, applySettings(settings, options)).new({ opacity: [0, 1] }),
        );
        configure?.(builder);
        await builder;
      } finally {
        if (id === generation) isTransitioning.value = false;
      }
    },
  };
}

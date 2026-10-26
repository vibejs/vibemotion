import { toValue } from '@usevibejs/ui';
import {
  animate as motionAnimate,
  GroupAnimationWithThen,
  type createScopedAnimate,
  type AnimationPlaybackControlsWithThen,
} from 'motion';
import { applySettings, useMotionSettings, type ResolvedMotion } from './config.ts';
import { onDispose, type ElementTarget } from './internal.ts';

/** Motion's `animate()` signatures: elements, selectors, motion values, numbers, objects and sequences. */
export type AnimateFunction = ReturnType<typeof createScopedAnimate>;

export type ScopedAnimate = AnimateFunction & {
  /** Stops every animation this function started that is still running. */
  stop(): void;
  /** The number of animations still running. */
  readonly running: number;
};

const isSequence = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.some(Array.isArray);

/** @internal */
export function createAnimate(
  settings: ResolvedMotion,
  root?: ElementTarget,
  engine: (...args: never[]) => AnimationPlaybackControlsWithThen = motionAnimate as never,
): ScopedAnimate {
  const running = new Set<AnimationPlaybackControlsWithThen>();
  let disposed = false;
  const resolve = (subject: unknown) => {
    const scope = root === undefined ? undefined : toValue(root);
    return typeof subject === 'string' && scope ? Array.from(scope.querySelectorAll(subject)) : subject;
  };
  const run = (...args: unknown[]): AnimationPlaybackControlsWithThen => {
    if (disposed) return new GroupAnimationWithThen([]);
    if (isSequence(args[0])) {
      args[0] = args[0].map((segment) =>
        Array.isArray(segment) ? [resolve(segment[0]), ...segment.slice(1)] : segment,
      );
      args[1] = applySettings(settings, args[1] as object);
    } else {
      args[0] = resolve(args[0]);
      args[2] = applySettings(settings, args[2] as object);
    }
    // Motion never resolves `finished` for an animation that was stopped or interrupted by a newer
    // one on the same values, so settled entries are pruned here instead.
    for (const previous of running) if (previous.state === 'idle' || previous.state === 'finished') running.delete(previous);
    const animation = engine(...(args as never[]));
    running.add(animation);
    animation.finished.then(
      () => running.delete(animation),
      () => running.delete(animation),
    );
    return animation;
  };
  const stop = () => {
    for (const animation of running) animation.stop();
    running.clear();
  };
  onDispose(() => {
    disposed = true;
    stop();
  });
  return Object.assign(run as unknown as AnimateFunction, {
    stop,
    get running() {
      return running.size;
    },
  });
}

/**
 * Returns Motion's `animate()` bound to the calling scope: animations respect reduced motion and
 * the nearest `provideMotionConfig()`, and are stopped when the component unmounts or the effect
 * scope stops. Calls after disposal start nothing and return an already finished animation.
 * With `root`, selector strings resolve inside that element instead of the whole document.
 *
 * ```ts
 * const root = useTemplateRef<HTMLElement>('root')
 * const animate = useAnimate(root)
 * onMounted(() => animate('li', { opacity: [0, 1], y: [12, 0] }, { delay: stagger(0.05) }))
 * ```
 */
export function useAnimate(root?: ElementTarget): ScopedAnimate {
  return createAnimate(useMotionSettings(), root);
}

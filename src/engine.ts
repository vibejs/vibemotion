import { toValue } from '@usevibejs/ui';
import {
  GroupAnimationWithThen,
  type createScopedAnimate,
  type AnimationPlaybackControlsWithThen,
} from 'motion';
import { applySettings, type ResolvedMotion } from './config.ts';
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

/** Whether an animation is stopped or done. An empty group (nothing matched) has no state to read. */
function settled(animation: AnimationPlaybackControlsWithThen): boolean {
  try {
    return animation.state === 'idle' || animation.state === 'finished';
  } catch {
    return true;
  }
}

/** @internal */
export function createAnimate(
  settings: ResolvedMotion,
  root: ElementTarget | undefined,
  engine: (...args: never[]) => AnimationPlaybackControlsWithThen,
): ScopedAnimate {
  const running = new Set<AnimationPlaybackControlsWithThen>();
  let disposed = false;
  const resolve = (subject: unknown, keyframes: unknown) => {
    const scope = root === undefined ? undefined : toValue(root);
    const selector =
      typeof subject === 'string' &&
      keyframes !== null &&
      typeof keyframes === 'object' &&
      !Array.isArray(keyframes);
    return selector && root !== undefined
      ? scope
        ? Array.from(scope.querySelectorAll(subject as string))
        : []
      : subject;
  };
  const run = (...args: unknown[]): AnimationPlaybackControlsWithThen => {
    if (disposed) return new GroupAnimationWithThen([]);
    if (isSequence(args[0])) {
      args[0] = args[0].map((segment) =>
        Array.isArray(segment) ? [resolve(segment[0], segment[1]), ...segment.slice(1)] : segment,
      );
      args[1] = applySettings(settings, args[1] as object);
    } else {
      args[0] = resolve(args[0], args[1]);
      args[2] = applySettings(settings, args[2] as object);
    }
    // Motion never resolves `finished` for an animation that was stopped or interrupted by a newer
    // one on the same values, so settled entries are pruned here instead.
    for (const previous of running) if (settled(previous)) running.delete(previous);
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
  // defineProperty, not Object.assign, which would copy the getter's current value.
  return Object.defineProperties(run as unknown as ScopedAnimate, {
    stop: { value: stop },
    running: { get: () => running.size },
  });
}

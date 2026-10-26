import { animate as motionAnimate } from 'motion';
import type { AnimationPlaybackControlsWithThen } from 'motion';
import { useMotionSettings, type ResolvedMotion } from './config.ts';
import type { ElementTarget } from './internal.ts';
import { createAnimate as createEngine, type ScopedAnimate } from './engine.ts';
export type { AnimateFunction, ScopedAnimate } from './engine.ts';

/** @internal Hybrid engine allocation. The mini entry imports engine.ts directly. */
export function createAnimate(
  settings: ResolvedMotion,
  root?: ElementTarget,
  engine: (...args: never[]) => AnimationPlaybackControlsWithThen = motionAnimate as never,
): ScopedAnimate {
  return createEngine(settings, root, engine);
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

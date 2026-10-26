import { animate as animateMini } from 'motion/mini';
import type {
  AnimationOptions,
  AnimationPlaybackControlsWithThen,
  DOMKeyframesDefinition,
  ElementOrSelector,
} from 'motion';
import { createAnimate } from './animate.ts';
import { useMotionSettings } from './config.ts';
import type { ElementTarget } from './internal.ts';

export { motionConfigKey, provideMotionConfig, useReducedMotion } from './config.ts';
export type { MotionConfig, ReducedMotionSetting } from './config.ts';
export type { ElementTarget } from './internal.ts';

export interface MiniAnimate {
  (element: ElementOrSelector, keyframes: DOMKeyframesDefinition, options?: AnimationOptions): AnimationPlaybackControlsWithThen;
  stop(): void;
  readonly running: number;
}

type Options = AnimationOptions & { reduceMotion?: boolean; skipAnimations?: boolean };

/**
 * Like `useAnimate()` from `@usevibejs/motion`, on Motion's mini engine: Web Animations API only,
 * for element keyframes, without springs on independent transforms, motion values or sequences.
 * With reduced motion or `skipAnimations`, animations jump to their end state.
 */
export function useAnimate(root?: ElementTarget): MiniAnimate {
  const engine = (element: ElementOrSelector, keyframes: DOMKeyframesDefinition, options: Options = {}) => {
    const { reduceMotion, skipAnimations, ...rest } = options;
    return animateMini(element, keyframes, reduceMotion || skipAnimations ? { ...rest, duration: 0, delay: 0 } : rest);
  };
  return createAnimate(useMotionSettings(), root, engine as never) as unknown as MiniAnimate;
}

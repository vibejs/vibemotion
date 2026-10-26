// Configuration and accessibility
export { motionConfigKey, provideMotionConfig, useReducedMotion } from './config.ts';
export type { MotionConfig, ReducedMotionSetting } from './config.ts';
export type { ElementTarget } from './internal.ts';

// Animation
export { useAnimate } from './animate.ts';
export type { AnimateFunction, ScopedAnimate } from './animate.ts';
export { useMotionControls } from './controls.ts';
export type { MotionControls, MotionPlayState } from './controls.ts';
export { useMotion } from './motion.ts';
export type { MotionHandle, UseMotionOptions, ViewportOptions } from './motion.ts';
export type { MotionTarget, TargetOrVariant, Variants } from './target.ts';

// Motion values
export {
  getVelocity,
  useMotionAttrs,
  useMotionStyle,
  useMotionValue,
  useMotionValueState,
  useSpring,
  useTransform,
} from './values.ts';

// Gestures
export { useDrag, useHover, usePress } from './gestures.ts';
export type {
  DragHandle,
  GestureHandle,
  HoverOptions,
  PressOptions,
  UseDragOptions,
} from './gestures.ts';

// Scroll and viewport
export { useInView, useScroll, useScrollAnimation } from './scroll.ts';
export type {
  InViewOptions,
  ScrollAnimationOptions,
  ScrollValues,
  UseInViewOptions,
  UseScrollOptions,
} from './scroll.ts';

// Layout, view transitions and presence
export { useLayoutMotion, useViewTransition } from './layout.ts';
export type { LayoutMotion, LayoutMotionOptions, ViewTransitionHandle } from './layout.ts';
export { usePresence, usePresenceList } from './presence.ts';
export type {
  Presence,
  PresenceAnimationOptions,
  PresenceEntry,
  PresenceList,
  UsePresenceListOptions,
  UsePresenceOptions,
} from './presence.ts';
export { useRouteTransition } from './route.ts';
export type { RouterHooks, RouteTransitionOptions } from './route.ts';

// Motion utilities, re-exported so applications need no direct `motion` dependency.
export {
  animateLayout,
  animateView,
  anticipate,
  backIn,
  backInOut,
  backOut,
  circIn,
  circInOut,
  circOut,
  cubicBezier,
  easeIn,
  easeInOut,
  easeOut,
  inertia,
  isMotionValue,
  mapValue,
  mix,
  motionValue,
  spring,
  springValue,
  stagger,
  steps,
  transformValue,
} from 'motion';
export type {
  AnimationOptions,
  AnimationPlaybackControls,
  AnimationPlaybackControlsWithThen,
  AnimationSequence,
  DOMKeyframesDefinition,
  DragOptions,
  Easing,
  MotionValue,
  PanInfo,
  SpringOptions,
  Transition,
} from 'motion';

import { shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from '@usevibejs/ui';
import { hover, inView, press, type AnimationOptions } from 'motion';
import type { InViewOptions } from './scroll.ts';
import { createAnimate } from './animate.ts';
import { applySettings, useMotionSettings } from './config.ts';
import { useMotionControls, type MotionControls } from './controls.ts';
import { bindElement, onDispose, sameTarget, type ElementTarget } from './internal.ts';
import {
  composeLayers,
  fromTo,
  resolveTarget,
  splitTarget,
  type TargetOrVariant,
  type Variants,
} from './target.ts';

export interface ViewportOptions extends InViewOptions {
  /** Keep the `inView` state once the element has entered. Defaults to `false`. */
  once?: boolean;
}

export interface UseMotionOptions<V extends string = string> {
  /** Named targets that the other options can refer to by name. */
  variants?: MaybeRefOrGetter<Variants<V>>;
  /**
   * The state the element starts in when it appears; `false` jumps straight to `animate`
   * without animating. Omitted, the element animates from its current styles.
   */
  initial?: TargetOrVariant<NoInfer<V>> | false;
  /** The resting target. A ref or getter is watched: each change animates from the current values. */
  animate?: MaybeRefOrGetter<TargetOrVariant<NoInfer<V>> | undefined>;
  /** The default transition. Reactive; a change applies to the next animation. */
  transition?: MaybeRefOrGetter<AnimationOptions | undefined>;
  /** Applied while a pointer hovers the element. Touch input is ignored. */
  hover?: TargetOrVariant<NoInfer<V>>;
  /** Applied while the element is pressed by a pointer, or by Enter on a focused element. */
  press?: TargetOrVariant<NoInfer<V>>;
  /** Applied while the element intersects the viewport, or `viewport.root`. */
  inView?: TargetOrVariant<NoInfer<V>>;
  viewport?: ViewportOptions;
  /** Continuation preserves Motion's velocity; replace stops first; cancel reverts first. */
  interrupt?: 'continue' | 'replace' | 'cancel';
  /** Called when an animation to a new target starts. */
  onAnimationStart?: (target: Record<string, unknown>) => void;
  /** Called when an animation completes without being interrupted by a newer one. */
  onAnimationComplete?: (target: Record<string, unknown>) => void;
}

export interface MotionHandle<V extends string = string> {
  readonly controls: MotionControls;
  readonly isHovered: Readonly<Ref<boolean>>;
  readonly isPressed: Readonly<Ref<boolean>>;
  readonly isInView: Readonly<Ref<boolean>>;
  /** Whether an animation of this element is running. */
  readonly isAnimating: Readonly<Ref<boolean>>;
  /**
   * Animates to a target or variant once, outside the declared states. The next state change
   * animates back to the declared target. Resolves when the animation ends.
   */
  start(definition: TargetOrVariant<V>, transition?: AnimationOptions): Promise<void>;
  /** Stops the running animation at its current values. */
  stop(): void;
  /** Stops tracking the element and its gestures. Called automatically with the scope. */
  dispose(): void;
}

/**
 * Animates one element declaratively: an initial state, a reactive `animate` target, named
 * variants, and hover, press and viewport states layered on top in that order of priority.
 * A new target interrupts the running animation and continues from the current values, keeping
 * spring velocity. Gestures and observers are bound to the element of the template ref and move
 * with it when it is replaced.
 *
 * ```ts
 * const card = useTemplateRef<HTMLElement>('card')
 * useMotion(card, {
 *   initial: { opacity: 0, y: 16 },
 *   animate: { opacity: 1, y: 0 },
 *   hover: { scale: 1.03 },
 *   press: { scale: 0.97 },
 *   transition: { type: 'spring', bounce: 0.25 },
 * })
 * ```
 */
export function useMotion<const V extends string = string>(
  target: ElementTarget<HTMLElement | SVGElement>,
  options: UseMotionOptions<V>,
): MotionHandle<V> {
  const settings = useMotionSettings();
  const animate = createAnimate(settings);
  const controls = useMotionControls();
  const isHovered = shallowRef(false);
  const isPressed = shallowRef(false);
  const isInView = shallowRef(false);
  const isAnimating = shallowRef(false);
  const resolve = (definition: TargetOrVariant<V> | undefined | false) =>
    resolveTarget(definition, toValue(options.variants));
  const initial = resolve(options.initial);
  let element: HTMLElement | SVGElement | undefined;
  let last: Record<string, unknown> | undefined;
  let generation = 0;
  let disposed = false;
  let lastTransition: AnimationOptions | undefined;

  const compose = () =>
    composeLayers(
      [
        { active: true, target: resolve(toValue(options.animate)) },
        { active: isInView.value, target: resolve(options.inView) },
        { active: isHovered.value, target: resolve(options.hover) },
        { active: isPressed.value, target: resolve(options.press) },
      ],
      { ...initial, ...resolve(toValue(options.animate)) },
    );

  const run = (
    keyframes: Record<string, unknown>,
    transition?: AnimationOptions,
  ): Promise<void> => {
    if (!element || disposed) return Promise.resolve();
    const id = ++generation;
    const merged = { ...toValue(options.transition), ...transition };
    if (options.interrupt === 'replace') controls.stop();
    if (options.interrupt === 'cancel') controls.cancel();
    options.onAnimationStart?.(keyframes);
    isAnimating.value = true;
    const animation = controls.set(animate(element, keyframes as never, merged));
    return animation.finished.then(() => {
      if (id !== generation) return;
      isAnimating.value = false;
      options.onAnimationComplete?.(keyframes);
    });
  };

  const update = (enter = false) => {
    const [keyframes, transition] = compose();
    const resolvedTransition = applySettings(settings, {
      ...toValue(options.transition),
      ...transition,
    });
    if (!enter && sameTarget(keyframes, last) && sameTarget(resolvedTransition, lastTransition))
      return;
    last = keyframes;
    lastTransition = resolvedTransition;
    if (enter && options.initial === false) {
      void run(keyframes, { duration: 0, delay: 0, type: false } as AnimationOptions);
    } else {
      void run(enter ? fromTo(splitTarget(initial)[0], keyframes) : keyframes, transition);
    }
  };

  const stopElement = bindElement(target, (el) => {
    element = el;
    update(true);
    const cleanups: (() => void)[] = [];
    if (options.hover)
      cleanups.push(
        hover(el, () => {
          isHovered.value = true;
          return () => (isHovered.value = false);
        }),
      );
    if (options.press)
      cleanups.push(
        press(el, () => {
          isPressed.value = true;
          return () => (isPressed.value = false);
        }),
      );
    if (options.inView) {
      const { once, ...viewport } = options.viewport ?? {};
      cleanups.push(
        inView(
          el,
          () => {
            isInView.value = true;
            return once ? undefined : () => (isInView.value = false);
          },
          viewport,
        ),
      );
    }
    return () => {
      generation++;
      animate.stop();
      isAnimating.value = false;
      for (const cleanup of cleanups) cleanup();
      isHovered.value = isPressed.value = isInView.value = false;
      element = undefined;
      last = undefined;
    };
  });

  const stopWatch = watch(
    () =>
      [
        compose(),
        { ...toValue(options.transition) },
        settings.reduced.value,
        settings.config.value.skipAnimations,
      ] as const,
    () => update(),
  );

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopWatch();
    stopElement();
    generation++;
    animate.stop();
    isAnimating.value = false;
  };
  onDispose(dispose);

  return {
    controls,
    isHovered,
    isPressed,
    isInView,
    isAnimating,
    start(definition, transition) {
      const [keyframes, own] = splitTarget(resolve(definition));
      last = undefined;
      return run(keyframes as Record<string, unknown>, { ...own, ...transition });
    },
    stop() {
      generation++;
      animate.stop();
      isAnimating.value = false;
    },
    dispose,
  };
}

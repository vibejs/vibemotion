import { shallowRef, toValue, watch, type Ref } from '@usevibejs/ui';
import {
  inView,
  motionValue,
  scroll,
  type AnimationOptions,
  type DOMKeyframesDefinition,
  type MotionValue,
} from 'motion';

/** Options of Motion's `inView()`: `root`, `margin` and `amount`. */
export type InViewOptions = NonNullable<Parameters<typeof inView>[2]>;
import { createAnimate } from './animate.ts';
import { useMotionSettings } from './config.ts';
import { bindElement, onDispose, type ElementTarget } from './internal.ts';

type ScrollOffset = NonNullable<NonNullable<Parameters<typeof scroll>[1]>['offset']>;

export interface UseScrollOptions {
  /** The scrolling element; the page when omitted. A template ref waits for its element. */
  container?: ElementTarget;
  /** Track this element's progress through the container instead of the container's own scroll. */
  target?: ElementTarget;
  /** Where tracking starts and ends, for example `['start end', 'end start']`. */
  offset?: ScrollOffset;
  axis?: 'x' | 'y';
}

export interface ScrollValues {
  readonly scrollX: MotionValue<number>;
  readonly scrollY: MotionValue<number>;
  readonly scrollXProgress: MotionValue<number>;
  readonly scrollYProgress: MotionValue<number>;
  stop(): void;
}

/** Waits until every provided element target has an element, then calls `setup` with them. */
function bindTargets(
  targets: (ElementTarget | undefined)[],
  setup: (elements: (Element | undefined)[]) => () => void,
  extra?: () => unknown,
): () => void {
  let cleanup: (() => void) | undefined;
  const stopWatch = watch(
    () => [...targets.map((t) => (t === undefined ? undefined : toValue(t))), extra?.()],
    (all) => {
      const elements = all.slice(0, targets.length) as (Element | null | undefined)[];
      cleanup?.();
      cleanup = undefined;
      if (elements.every((element, i) => element || targets[i] === undefined)) {
        cleanup = setup(elements.map((element) => element ?? undefined));
      }
    },
    { immediate: true, flush: 'post' },
  );
  const stop = () => {
    stopWatch();
    cleanup?.();
    cleanup = undefined;
  };
  onDispose(stop);
  return stop;
}

/**
 * Scroll position and progress as motion values, from Motion's `scroll()`, which shares one
 * listener per container and measures only on resize. The values are destroyed with the scope.
 * Feed them to `useTransform()` and `useMotionStyle()` for parallax and progress bars.
 */
export function useScroll(options: UseScrollOptions = {}): ScrollValues {
  const scrollX = motionValue(0);
  const scrollY = motionValue(0);
  const scrollXProgress = motionValue(0);
  const scrollYProgress = motionValue(0);
  const stopBinding = bindTargets([options.container, options.target], ([container, target]) =>
    scroll(
      (_progress, { x, y }) => {
        scrollX.set(x.current);
        scrollXProgress.set(x.progress);
        scrollY.set(y.current);
        scrollYProgress.set(y.progress);
      },
      {
        container: container as HTMLElement | undefined,
        target,
        offset: options.offset,
        axis: options.axis,
      },
    ),
  );
  const stop = () => {
    stopBinding();
    for (const value of [scrollX, scrollY, scrollXProgress, scrollYProgress]) value.destroy();
  };
  onDispose(stop);
  return { scrollX, scrollY, scrollXProgress, scrollYProgress, stop };
}

export interface ScrollAnimationOptions extends UseScrollOptions {
  /** Options of the animation; `ease` maps scroll progress to animation progress. */
  transition?: AnimationOptions;
}

/**
 * Links an animation's progress to scroll. Motion drives it with a native `ScrollTimeline` where
 * the browser supports one, off the main thread. With reduced motion, the element stays in its
 * resting styles and nothing is linked.
 */
export function useScrollAnimation(
  element: ElementTarget,
  keyframes: DOMKeyframesDefinition,
  options: ScrollAnimationOptions = {},
): { stop(): void } {
  const settings = useMotionSettings();
  const animate = createAnimate(settings);
  const stop = bindTargets(
    [element, options.container, options.target],
    ([el, container, target]) => {
      if (settings.reduced.value || settings.config.value.skipAnimations) return () => {};
      const animation = animate(el!, keyframes, {
        duration: 1,
        ease: 'linear',
        ...options.transition,
      });
      animation.pause();
      // Motion 14.6's native timeline cache strongly retains element targets/containers.
      // Use its shared callback tracker for replaceable elements, and native linking for page scroll.
      const link =
        options.container !== undefined || options.target !== undefined
          ? (progress: number) => {
              animation.time = progress * animation.duration;
            }
          : animation;
      const unlink = scroll(link, {
        container: container as HTMLElement | undefined,
        target,
        offset: options.offset,
        axis: options.axis,
      });
      return () => {
        unlink();
        animation.cancel();
      };
    },
    () => [settings.reduced.value, settings.config.value.skipAnimations],
  );
  return { stop };
}

export interface UseInViewOptions extends InViewOptions {
  /** Stop observing after the first entry. */
  once?: boolean;
  onEnter?: (entry: IntersectionObserverEntry) => void;
  onLeave?: (entry: IntersectionObserverEntry) => void;
}

/** Whether the element intersects the viewport (or `root`), from Motion's shared `inView()` observers. */
export function useInView(
  target: ElementTarget,
  options: UseInViewOptions = {},
): { readonly isInView: Readonly<Ref<boolean>>; stop(): void } {
  const isInView = shallowRef(false);
  const { once, onEnter, onLeave, ...observerOptions } = options;
  let done = false;
  const stop = bindElement(target, (element) => {
    if (done) return;
    let remove: (() => void) | undefined = inView(
      element,
      (_element, entry) => {
        isInView.value = true;
        onEnter?.(entry);
        if (once) {
          done = true;
          // The observer cannot be removed inside its own callback.
          queueMicrotask(() => {
            remove?.();
            remove = undefined;
          });
          return;
        }
        return (leaveEntry) => {
          isInView.value = false;
          onLeave?.(leaveEntry);
        };
      },
      observerOptions,
    );
    return () => {
      remove?.();
      remove = undefined;
      if (!once) isInView.value = false;
    };
  });
  return { isInView, stop };
}

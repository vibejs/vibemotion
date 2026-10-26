import { nextTick, toValue } from '@usevibejs/ui';
import {
  animateView,
  scopeMotion,
  type AnimationOptions,
  type DOMKeyframesDefinition,
} from 'motion';
import { createAnimate } from './animate.ts';
import { applySettings, useMotionSettings } from './config.ts';
import { onDispose, type ElementTarget } from './internal.ts';
import { fromTo } from './target.ts';

export interface RouterHooks {
  beforeResolve(
    guard: (to: { fullPath: string }, from: { fullPath: string }) => unknown,
  ): () => void;
  afterEach(
    hook: (to: { fullPath: string }, from: { fullPath: string }, failure?: unknown) => void,
  ): () => void;
}
export interface RouteTransitionOptions {
  mode?: 'animate' | 'view';
  initial?: DOMKeyframesDefinition;
  animate?: DOMKeyframesDefinition;
  exit?: DOMKeyframesDefinition;
  transition?: AnimationOptions;
}

/** Retain the old route through a public beforeResolve guard, then animate the flushed new page. */
export function useRouteTransition(
  router: RouterHooks,
  container: ElementTarget<HTMLElement>,
  options: RouteTransitionOptions = {},
): { stop(): void } {
  const settings = useMotionSettings();
  const animate = createAnimate(settings);
  const owner = scopeMotion();
  const { mode = 'animate', initial = {}, animate: target = {}, exit = {}, transition } = options;
  let disposed = false;
  let generation = 0;
  let pending: { path: string; release(): void; rendered?(): void; restore?(): void } | undefined;
  const clear = () => {
    pending?.release();
    pending?.rendered?.();
    pending?.restore?.();
    pending = undefined;
  };
  const removeGuard = router.beforeResolve((to, from) => {
    clear(); // A superseded animation's finished promise is not guaranteed to settle.
    const id = ++generation;
    const element = toValue(container);
    if (
      disposed ||
      !element ||
      to.fullPath === from.fullPath ||
      settings.reduced.value ||
      settings.config.value.skipAnimations
    )
      return;
    let release!: () => void;
    const interrupted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = { path: to.fullPath, release } as NonNullable<typeof pending>;
    pending = request;
    if (mode === 'view' && typeof document.startViewTransition === 'function') {
      return new Promise<void>((proceed) => {
        request.release = proceed;
        void owner
          .run(() =>
            animateView(
              async () => {
                if (disposed || id !== generation) return;
                const rendered = new Promise<void>((resolve) => {
                  request.rendered = resolve;
                });
                proceed();
                await rendered;
                await nextTick();
              },
              applySettings(settings, transition),
            ).new({ opacity: [0, 1] }),
          )
          .then(
            () => {},
            () => proceed(),
          );
      });
    }
    if (!Object.keys(exit).length) return;
    const inert = element.getAttribute('inert');
    element.setAttribute('inert', '');
    request.restore = () => {
      if (inert === null) element.removeAttribute('inert');
      else element.setAttribute('inert', inert);
    };
    return Promise.race([animate(element, exit, transition).finished, interrupted]).then(() =>
      request.restore?.(),
    );
  });
  const removeHook = router.afterEach((to, from, failure) => {
    if (disposed || (pending && pending.path !== to.fullPath)) return;
    const view = !!pending?.rendered;
    clear();
    const id = generation;
    void nextTick(() => {
      const element = toValue(container);
      if (
        disposed ||
        id !== generation ||
        view ||
        !element ||
        settings.reduced.value ||
        to.fullPath === from.fullPath
      )
        return;
      const keyframes = failure ? target : fromTo(initial, target as Record<string, unknown>);
      if (Object.keys(keyframes).length)
        animate(element, keyframes as DOMKeyframesDefinition, transition);
    });
  });
  const stop = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    removeGuard();
    removeHook();
    clear();
    animate.stop();
    owner.stop();
  };
  onDispose(stop);
  return { stop };
}

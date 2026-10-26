import { nextTick, toValue } from '@usevibejs/ui';
import { animateView, type AnimationOptions, type DOMKeyframesDefinition } from 'motion';
import { createAnimate } from './animate.ts';
import { applySettings, useMotionSettings } from './config.ts';
import { onDispose, type ElementTarget } from './internal.ts';
import { fromTo } from './target.ts';

/** The part of a Vibe.js router that route transitions use; `useRouter()` satisfies it. */
export interface RouterHooks {
  beforeResolve(guard: (to: { fullPath: string }, from: { fullPath: string }) => unknown): () => void;
  afterEach(hook: (to: { fullPath: string }, from: { fullPath: string }, failure?: unknown) => void): () => void;
}

export interface RouteTransitionOptions {
  /**
   * `'animate'` (default) plays `exit` on the container, navigates, then plays `initial` → `animate`
   * on the new page. `'view'` wraps the navigation in a View Transition (cross-fade by default),
   * falling back to `'animate'` where the API is missing.
   */
  mode?: 'animate' | 'view';
  initial?: DOMKeyframesDefinition;
  animate?: DOMKeyframesDefinition;
  exit?: DOMKeyframesDefinition;
  transition?: AnimationOptions;
}

/**
 * Animates navigations of a Vibe.js router: wrap `<RouterView />` in an element and pass its
 * template ref. Exits run in a `beforeResolve` guard, so the old page stays rendered until its
 * exit finishes; a navigation superseded during the exit simply continues with the newest one.
 * With reduced motion, pages swap without animation. Guards are removed with the scope.
 *
 * ```ts
 * const view = useTemplateRef<HTMLElement>('view')
 * useRouteTransition(useRouter(), view, { exit: { opacity: 0 }, initial: { opacity: 0 }, animate: { opacity: 1 } })
 * // <main ref="view"><RouterView /></main>
 * ```
 */
export function useRouteTransition(
  router: RouterHooks,
  container: ElementTarget<HTMLElement>,
  options: RouteTransitionOptions = {},
): { stop(): void } {
  const settings = useMotionSettings();
  const animate = createAnimate(settings);
  const { mode = 'animate', initial = {}, animate: target = {}, exit = {}, transition } = options;
  const useView = () =>
    mode === 'view' && typeof document !== 'undefined' && 'startViewTransition' in document;
  let finishView: (() => void) | undefined;

  const removeGuard = router.beforeResolve((to, from) => {
    const element = toValue(container);
    if (!element || to.fullPath === from.fullPath || settings.reduced.value) return;
    if (useView()) {
      // Resolve the guard from inside the transition's update, after the old snapshot is taken;
      // the update completes once the new route has rendered.
      return new Promise<void>((proceed) => {
        void animateView(
          () =>
            new Promise<void>((rendered) => {
              finishView = rendered;
              proceed();
            }),
          applySettings(settings, transition),
        );
      });
    }
    if (!Object.keys(exit).length) return;
    element.setAttribute('inert', '');
    return animate(element, exit, transition).finished.then(() => element.removeAttribute('inert'));
  });

  const removeHook = router.afterEach((to, from, failure) => {
    const finish = finishView;
    finishView = undefined;
    const element = toValue(container);
    void nextTick(() => {
      finish?.();
      if (finish || !element || settings.reduced.value || to.fullPath === from.fullPath) return;
      // A failed navigation keeps the old page: bring it back.
      const keyframes = failure ? target : fromTo(initial, target as Record<string, unknown>);
      if (Object.keys(keyframes).length) animate(element, keyframes as DOMKeyframesDefinition, transition);
    });
  });

  const stop = () => {
    removeGuard();
    removeHook();
    finishView?.();
  };
  onDispose(stop);
  return { stop };
}

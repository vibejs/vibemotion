import {
  nextTick,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
  type ShallowRef,
} from '@usevibejs/ui';
import { onDispose, type ElementTarget } from './internal.ts';
import type { RouterHooks } from './route.ts';

export interface RouteClassOptions {
  /** Class added for the duration of a navigation. Default `route-transition`. */
  className?: MaybeRefOrGetter<string>;
}

interface Mark {
  element: Element;
  className: string;
  id: number;
  path: string;
  /** The element already had the class, so completion must not remove it. */
  restore: boolean;
}

/**
 * Toggles one CSS class around a route change.
 * The class is added in `beforeResolve` and removed after the matching `afterEach` flushes.
 * This is not a transition component and it does not animate. Stylesheets own the motion,
 * including `prefers-reduced-motion`.
 */
export function useRouteClass(
  router: RouterHooks,
  target: ElementTarget<Element>,
  options: RouteClassOptions = {},
): { readonly active: Readonly<ShallowRef<boolean>>; stop(): void } {
  const active = shallowRef(false);
  let disposed = false;
  let generation = 0;
  let marked: Mark | undefined;
  const className = () => toValue(options.className ?? 'route-transition');
  const clear = () => {
    if (marked && !marked.restore) marked.element.classList.remove(marked.className);
    marked = undefined;
    active.value = false;
  };
  const removeGuard = router.beforeResolve((to, from) => {
    if (disposed || to.fullPath === from.fullPath) return;
    const id = ++generation;
    clear();
    const element = toValue(target);
    const name = className();
    if (!element || !name) return;
    const restore = element.classList.contains(name);
    element.classList.add(name);
    marked = { element, className: name, id, path: to.fullPath, restore };
    active.value = true;
  });
  const removeHook = router.afterEach((to, from) => {
    if (disposed || to.fullPath === from.fullPath) return;
    if (!marked || marked.path !== to.fullPath) return;
    const id = marked.id;
    void nextTick(() => {
      if (disposed || id !== generation) return;
      clear();
    });
  });
  const stop = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    removeGuard();
    removeHook();
    clear();
  };
  onDispose(stop);
  return { active: active as Readonly<typeof active>, stop };
}

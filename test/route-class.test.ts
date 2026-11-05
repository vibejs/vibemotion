import { effectScope, nextTick, ref, shallowRef } from '@usevibejs/ui';
import { describe, expect, it, vi } from 'vitest';
import { useRouteClass, type RouterHooks } from '../src/index.ts';

function routerHarness() {
  let before!: Parameters<RouterHooks['beforeResolve']>[0];
  let after!: Parameters<RouterHooks['afterEach']>[0];
  const removeBefore = vi.fn<() => void>();
  const removeAfter = vi.fn<() => void>();
  const router: RouterHooks = {
    beforeResolve(fn) {
      before = fn;
      return removeBefore;
    },
    afterEach(fn) {
      after = fn;
      return removeAfter;
    },
  };
  return {
    router,
    removeBefore,
    removeAfter,
    before: (path = '/b', from = '/a') => before({ fullPath: path }, { fullPath: from }),
    after: (path = '/b', from = '/a', failure?: unknown) =>
      after({ fullPath: path }, { fullPath: from }, failure),
  };
}

describe('route class', () => {
  it('toggles the default class around a navigation and ignores a superseded completion', async () => {
    const el = document.createElement('main');
    document.body.append(el);
    const hooks = routerHarness();
    const scope = effectScope();
    const route = scope.run(() => useRouteClass(hooks.router, el))!;
    hooks.before('/same', '/same');
    hooks.after('/same', '/same');
    expect(el.classList.contains('route-transition')).toBe(false);
    hooks.before('/first');
    expect(route.active.value).toBe(true);
    expect(el.classList.contains('route-transition')).toBe(true);
    hooks.after('/first');
    hooks.before('/second');
    await nextTick();
    expect(el.classList.contains('route-transition')).toBe(true);
    hooks.after('/first');
    await nextTick();
    expect(el.classList.contains('route-transition')).toBe(true);
    hooks.after('/second', '/first', new Error('cancelled'));
    await nextTick();
    expect(route.active.value).toBe(false);
    expect(el.classList.contains('route-transition')).toBe(false);
    scope.stop();
    expect(hooks.removeBefore).toHaveBeenCalledOnce();
    expect(hooks.removeAfter).toHaveBeenCalledOnce();
    route.stop();
  });

  it('keeps a pre-existing class, skips a missing target, and removes its own class on stop', async () => {
    const el = document.createElement('main');
    el.classList.add('leave');
    const other = document.createElement('section');
    document.body.append(el, other);
    const target = shallowRef<Element | null>(null);
    const className = ref('leave');
    const hooks = routerHarness();
    const scope = effectScope();
    const route = scope.run(() => useRouteClass(hooks.router, target, { className }))!;
    hooks.before();
    hooks.after();
    await nextTick();
    expect(route.active.value).toBe(false);
    target.value = el;
    hooks.before();
    expect(el.classList.contains('leave')).toBe(true);
    hooks.after();
    await nextTick();
    expect(el.classList.contains('leave')).toBe(true);
    className.value = '';
    hooks.before('/empty');
    expect(route.active.value).toBe(false);
    expect(el.classList.contains('leave')).toBe(true);
    className.value = 'enter';
    target.value = other;
    hooks.before('/next', '/empty');
    expect(other.classList.contains('enter')).toBe(true);
    expect(el.classList.contains('enter')).toBe(false);
    hooks.after('/next', '/empty');
    route.stop();
    await nextTick();
    expect(other.classList.contains('enter')).toBe(false);
    route.stop();
    hooks.before('/later');
    hooks.after('/later', '/next');
    expect(other.classList.contains('enter')).toBe(false);
    scope.stop();
  });
});

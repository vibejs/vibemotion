import { effectScope, nextTick, ref, shallowRef } from '@usevibejs/ui';
import { describe, expect, it, vi } from 'vitest';
import { usePresence, usePresenceList, type LayoutMotion } from '../src/index.ts';
import { frames, mockReducedMotion } from './media.ts';

describe('unrendered and list presence', () => {
  it('hides unrendered content and supports appear:false and disabled focus restoration', async () => {
    mockReducedMotion(false);
    const scope = effectScope();
    const show = ref(true);
    const target = shallowRef<HTMLElement | null>(null);
    const p = scope.run(() => usePresence(show, target, { appear: false, restoreFocus: false }))!;
    show.value = false;
    await nextTick();
    expect(p.isPresent.value).toBe(false);
    show.value = true;
    await nextTick();
    const element = document.createElement('div');
    document.body.append(element);
    target.value = element;
    await nextTick();
    await frames(30);
    expect(p.isPresent.value).toBe(true);
    scope.stop();
  });
  it('removes unbound items, invokes callbacks, supports layout commits and rejects duplicate keys', async () => {
    mockReducedMotion(false);
    const scope = effectScope();
    const source = ref(['a', 'b']);
    const onExitComplete = vi.fn<() => void>();
    const layout: LayoutMotion = {
      update: async (fn) => {
        await fn();
      },
      isAnimating: ref(false),
      stop() {},
    };
    const list = scope.run(() =>
      usePresenceList(source, { key: (x) => x, layout, onExitComplete, appear: true }),
    )!;
    source.value = ['b'];
    await nextTick();
    expect(list.items.value.map((x) => x.key)).toEqual(['b']);
    expect(onExitComplete).toHaveBeenCalledWith('a');
    const el = document.createElement('div');
    list.bind('b', el);
    list.bind('b', el);
    list.bind('b', null);
    scope.stop();
    list.bind('b', el);
    const second = effectScope();
    expect(() => second.run(() => usePresenceList(['a', 'a'], { key: (x) => x }))).toThrow(
      'Duplicate presence key',
    );
    second.stop();
  });
});

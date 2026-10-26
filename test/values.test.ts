import { effectScope, nextTick, ref, shallowRef } from '@usevibejs/ui';
import { mountComposable } from '@usevibejs/ui/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  motionValue,
  useAnimate,
  useScroll,
  useMotionAttrs,
  useMotionStyle,
  useMotionValue,
  useMotionValueState,
  useSpring,
  useTransform,
  getVelocity,
} from '../src/index.ts';
import { useAnimate as useMini } from '../src/mini.ts';
import { bindElement, sameTarget } from '../src/internal.ts';
import { frames, mockReducedMotion } from './media.ts';

describe('Motion values and scope ownership', () => {
  it('does not silently allocate resources without an owner', () => {
    expect(() => useAnimate()).toThrow('effectScope');
    expect(() => useMotionValue(0)).toThrow('effectScope');
    const input = motionValue(0);
    const subscribe = vi.spyOn(input, 'on');
    expect(() => useTransform(input, [0, 1], [0, 100])).toThrow('effectScope');
    expect(subscribe).not.toHaveBeenCalled();
    expect(() => useScroll()).toThrow('effectScope');
    input.destroy();
  });
  it('destroys owned values and leaves caller-owned inputs alive', async () => {
    mockReducedMotion(false);
    const source = motionValue(0);
    const destroy = vi.spyOn(source, 'destroy');
    const scope = effectScope();
    const result = scope.run(() => {
      const own = useMotionValue(1);
      const state = useMotionValueState(source);
      const derived = useTransform(() => own.get() * 2);
      const mapped = useTransform(own, [0, 2], [0, 100]);
      const spring = useSpring(source, { stiffness: 300, damping: 30 });
      return { own, state, derived, mapped, spring };
    })!;
    expect(result.derived.get()).toBe(2);
    expect(result.mapped.get()).toBe(50);
    const ownedDestroy = vi.spyOn(result.own, 'destroy');
    source.set(20);
    expect(result.state.value).toBe(20);
    await frames(600);
    expect(result.spring.get()).toBeCloseTo(20, 0);
    expect(Number.isFinite(getVelocity(result.spring))).toBe(true);
    scope.stop();
    expect(ownedDestroy).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    source.set(40);
    expect(result.state.value).toBe(20);
    source.destroy();
  });
  it('follows refs/getters, reacts to spring options and preference changes', async () => {
    const media = mockReducedMotion(false);
    const input = ref(0);
    const options = ref({ stiffness: 400, damping: 40 });
    const scope = effectScope();
    const spring = scope.run(() => useSpring(() => input.value, options))!;
    input.value = 60;
    await frames(30);
    expect(spring.get()).toBeGreaterThan(0);
    options.value = { stiffness: 500, damping: 50 };
    media.set(true);
    await nextTick();
    expect(spring.get()).toBe(60);
    input.value = 20;
    expect(spring.get()).toBe(20);
    const constant = scope.run(() => useSpring(3))!;
    expect(constant.get()).toBe(3);
    scope.stop();
    expect(media.listeners.size).toBe(0);
  });
  it('binds styles/attributes outside reactive DOM and rebinds element/configuration', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const target = shallowRef(a);
    const x = motionValue(0);
    const styles = shallowRef({ x });
    const scope = effectScope();
    const stop = scope.run(() => useMotionStyle(target, styles))!;
    const stopAttr = scope.run(() => useMotionAttrs(target, { 'data-progress': x }))!;
    x.set(10);
    await frames(40);
    expect(a.style.transform).toContain('10px');
    expect(a.getAttribute('data-progress')).toBe('10');
    target.value = b;
    styles.value = { x: motionValue(20) };
    await nextTick();
    await frames(40);
    expect(b.style.transform).toContain('20px');
    stop();
    stopAttr();
    scope.stop();
    styles.value.x.set(50);
    await frames(40);
    expect(b.style.transform).toContain('20px');
    x.destroy();
    styles.value.x.destroy();
  });
  it('bindElement releases on null, replacement and explicit stop', async () => {
    const target = shallowRef<HTMLElement | null>(null);
    const release = vi.fn<(...args: unknown[]) => unknown>();
    const setup = vi.fn<() => () => unknown>(() => release);
    const scope = effectScope();
    const stop = scope.run(() => bindElement(target, setup))!;
    target.value = document.body;
    await nextTick();
    expect(setup).toHaveBeenCalledOnce();
    target.value = null;
    await nextTick();
    expect(release).toHaveBeenCalledOnce();
    stop();
    stop();
    scope.stop();
  });
  it('compares function identity and array entries without serializing them away', () => {
    expect(sameTarget({ x: [1, 2] }, { x: [1, 2] })).toBe(true);
    expect(sameTarget({ a: () => 1 }, { a: () => 1 })).toBe(false);
    expect(sameTarget(null, {})).toBe(false);
    expect(sameTarget({ a: 1 }, { b: 1 })).toBe(false);
  });
  it('mini completes native CSS keyframes with explicit reduced motion', async () => {
    mockReducedMotion(true);
    // jsdom has no WAAPI; this boundary test supplies the browser protocol. Browser/package
    // consumption tests exercise the native implementation in Chromium.
    const animation = {
      finished: Promise.resolve(),
      cancel: vi.fn<(...args: unknown[]) => unknown>(),
      finish: vi.fn<(...args: unknown[]) => unknown>(),
      pause: vi.fn<(...args: unknown[]) => unknown>(),
      play: vi.fn<(...args: unknown[]) => unknown>(),
      effect: { getComputedTiming: () => ({ duration: 0 }) },
      commitStyles: vi.fn<(...args: unknown[]) => unknown>(),
      currentTime: 0,
      playbackRate: 1,
      playState: 'finished',
      startTime: 0,
      addEventListener: vi.fn<(...args: unknown[]) => unknown>(),
    };
    const el = document.createElement('div');
    el.animate = vi.fn<typeof el.animate>(() => animation as unknown as Animation);
    const { result, unmount } = mountComposable(() => useMini());
    const control = result(el, { opacity: [0, 1] });
    expect(control).toBeDefined();
    result.stop();
    unmount();
  });
});

describe('static effect values', () => {
  it('wraps scalars, rebinds reduced alternatives and preserves caller-owned values', async () => {
    const opacity = motionValue(0.3);
    const destroy = vi.spyOn(opacity, 'destroy');
    const reduced = ref(false);
    const el = document.createElement('div');
    document.body.append(el);
    const scope = effectScope();
    scope.run(() => {
      useMotionStyle(el, () => ({ opacity: reduced.value ? 1 : opacity, x: 10 }));
      useMotionAttrs(el, { 'data-mode': 'ready' });
    });
    await frames(40);
    expect(el.style.opacity).toBe('0.3');
    expect(el.getAttribute('data-mode')).toBe('ready');
    reduced.value = true;
    await nextTick();
    await frames(40);
    expect(el.style.opacity).toBe('1');
    scope.stop();
    expect(destroy).not.toHaveBeenCalled();
    opacity.destroy();
  });
});

import { effectScope, nextTick, ref, shallowRef } from '@usevibejs/ui';
import { describe, expect, it, vi } from 'vitest';
import type { drag, hover, press, inView, scroll, PanInfo } from 'motion';
const calls = vi.hoisted(() => ({
  hover: [] as Parameters<typeof hover>[],
  press: [] as Parameters<typeof press>[],
  drag: [] as Parameters<typeof drag>[],
  view: [] as Parameters<typeof inView>[],
  scroll: [] as Parameters<typeof scroll>[],
  cleanups: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock('motion', async (original) => {
  const real = await original<typeof import('motion')>();
  const record =
    (list: unknown[][]) =>
    (...args: unknown[]) => {
      list.push(args);
      const stop = vi.fn<(...args: unknown[]) => unknown>();
      calls.cleanups.push(stop);
      return stop;
    };
  return {
    ...real,
    hover: record(calls.hover),
    press: record(calls.press),
    drag: record(calls.drag),
    inView: record(calls.view),
    scroll: record(calls.scroll),
  };
});
import {
  useDrag,
  useHover,
  usePress,
  useInView,
  useScroll,
  useScrollAnimation,
  useMotion,
} from '../src/index.ts';
import { frames, mockReducedMotion } from './media.ts';
const pointer = () => new PointerEvent('pointerdown', { pointerType: 'mouse' });
const info: PanInfo = {
  point: { x: 0, y: 0 },
  delta: { x: 2, y: 0 },
  offset: { x: 10, y: 20 },
  velocity: { x: 100, y: 0 },
};

describe('gesture bindings', () => {
  it('reports hover and press activation/cancellation and releases old listeners', async () => {
    const el = document.createElement('button');
    const target = shallowRef<Element | null>(el);
    const onStart = vi.fn<(...args: unknown[]) => unknown>(),
      onEnd = vi.fn<(...args: unknown[]) => unknown>(),
      onCancel = vi.fn<(...args: unknown[]) => unknown>();
    const scope = effectScope();
    const h = scope.run(() => useHover(target, { onStart, onEnd }))!;
    const p = scope.run(() => usePress(target, { onStart, onEnd, onCancel }))!;
    const endHover = calls.hover.at(-1)![1](el, pointer());
    expect(h.isHovered.value).toBe(true);
    if (endHover) endHover(pointer());
    expect(h.isHovered.value).toBe(false);
    const endPress = calls.press.at(-1)![1](el, pointer());
    expect(p.isPressed.value).toBe(true);
    if (endPress) endPress(pointer(), { success: false });
    expect(onCancel).toHaveBeenCalledOnce();
    const success = calls.press.at(-1)![1](el, pointer());
    if (success) success(pointer(), { success: true });
    expect(onEnd).toHaveBeenCalledTimes(2);
    target.value = null;
    await nextTick();
    h.stop();
    p.stop();
    scope.stop();
    expect(calls.cleanups.at(-1)).toHaveBeenCalled();
  });
  it('resolves late constraints, tracks release, resets drag state on disable, and cleans up', async () => {
    const media = mockReducedMotion(false);
    const el = document.createElement('div');
    const constraints = shallowRef<Element | null>(null);
    const disabled = ref(false);
    const onStart = vi.fn<(...args: unknown[]) => unknown>(),
      onEnd = vi.fn<(...args: unknown[]) => unknown>(),
      onSettle = vi.fn<(...args: unknown[]) => unknown>(),
      onDirectionLock = vi.fn<(...args: unknown[]) => unknown>();
    const scope = effectScope();
    const handle = scope.run(() =>
      useDrag(el, () => ({
        constraints,
        disabled: disabled.value,
        onStart,
        onEnd,
        onSettle,
        onDirectionLock,
        directionLock: true,
      })),
    )!;
    constraints.value = document.body;
    await nextTick();
    let options = calls.drag.at(-1)![1]!;
    expect(options.constraints).toBe(document.body);
    options.onStart!(pointer(), info);
    options.onDirectionLock!('x');
    expect(handle.isDragging.value).toBe(true);
    expect(handle.lockedAxis.value).toBe('x');
    options.onEnd!(pointer(), info);
    options.onTransitionEnd!();
    expect(handle.isDragging.value).toBe(false);
    expect(handle.lastRelease.value?.velocity.x).toBe(100);
    expect(onSettle).toHaveBeenCalledOnce();
    media.set(true);
    await nextTick();
    options = calls.drag.at(-1)![1]!;
    expect(options.momentum).toBe(false);
    options.onStart!(pointer(), info);
    disabled.value = true;
    await nextTick();
    expect(handle.isDragging.value).toBe(false);
    disabled.value = false;
    await nextTick();
    handle.stop();
    scope.stop();
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenCalledOnce();
  });
  it('accepts pixel constraints and follows element replacement', async () => {
    mockReducedMotion(false);
    const target = shallowRef<Element>(document.createElement('div'));
    const scope = effectScope();
    scope.run(() => useDrag(target, { constraints: { left: 0, right: 100 }, axis: 'x' }));
    expect(calls.drag.at(-1)![1]!.constraints).toEqual({ left: 0, right: 100 });
    const oldCleanup = calls.cleanups.at(-1)!;
    target.value = document.createElement('div');
    await nextTick();
    expect(oldCleanup).toHaveBeenCalledOnce();
    scope.stop();
  });
});

describe('scroll and viewport bindings', () => {
  it('tracks repeat entries, clears on replacement, and supports once', async () => {
    const el = document.createElement('div');
    const target = shallowRef<Element | null>(el);
    const enter = vi.fn<(...args: unknown[]) => unknown>(),
      leave = vi.fn<(...args: unknown[]) => unknown>();
    const scope = effectScope();
    const handle = scope.run(() => useInView(target, { onEnter: enter, onLeave: leave }))!;
    const entry = { isIntersecting: true } as IntersectionObserverEntry;
    const exit = calls.view.at(-1)![1](el, entry);
    expect(handle.isInView.value).toBe(true);
    if (exit) exit(entry);
    expect(handle.isInView.value).toBe(false);
    expect(leave).toHaveBeenCalledOnce();
    target.value = null;
    await nextTick();
    handle.stop();
    const once = scope.run(() => useInView(target, { once: true }))!;
    target.value = el;
    await nextTick();
    const remove = calls.cleanups.at(-1)!;
    calls.view.at(-1)![1](el, entry);
    await Promise.resolve();
    expect(remove).toHaveBeenCalledOnce();
    target.value = null;
    await nextTick();
    target.value = el;
    await nextTick();
    expect(once.isInView.value).toBe(true);
    scope.stop();
  });
  it('waits for a container and target and rebinds progress when they change', async () => {
    const container = shallowRef<Element | null>(null);
    const target = shallowRef<Element | null>(null);
    const scope = effectScope();
    const before = calls.scroll.length;
    const values = scope.run(() =>
      useScroll({ container, target, axis: 'x', offset: ['start end', 'end start'] }),
    )!;
    container.value = document.createElement('div');
    await nextTick();
    expect(calls.scroll.length).toBe(before);
    target.value = document.createElement('div');
    await nextTick();
    const callback = calls.scroll.at(-1)![0];
    if (typeof callback === 'function')
      callback(0.5, {
        x: { current: 12, progress: 0.5 },
        y: { current: 20, progress: 0.8 },
      } as never);
    expect(values.scrollX.get()).toBe(12);
    expect(values.scrollY.get()).toBe(20);
    expect(values.scrollXProgress.get()).toBe(0.5);
    expect(values.scrollYProgress.get()).toBe(0.8);
    const cleanup = calls.cleanups.at(-1)!;
    target.value = null;
    await nextTick();
    expect(cleanup).toHaveBeenCalledOnce();
    values.stop();
    scope.stop();
  });
  it('supports page scroll without optional elements', () => {
    const scope = effectScope();
    scope.run(() => useScroll());
    expect(calls.scroll.at(-1)![1]!.container).toBeUndefined();
    scope.stop();
  });
  it('links an animation, unlinks on preference changes and reattaches on return', async () => {
    const media = mockReducedMotion(false);
    const el = document.createElement('div');
    document.body.append(el);
    const scope = effectScope();
    const h = scope.run(() => useScrollAnimation(el, { opacity: [0, 1] }))!;
    const cleanup = calls.cleanups.at(-1)!;
    media.set(true);
    await nextTick();
    expect(cleanup).toHaveBeenCalledOnce();
    const before = calls.scroll.length;
    media.set(false);
    await nextTick();
    expect(calls.scroll.length).toBe(before + 1);
    h.stop();
    scope.stop();
  });
  it('layers declarative viewport/hover/press, supports reactive variants and replaces targets', async () => {
    mockReducedMotion(false);
    const first = document.createElement('button');
    document.body.append(first);
    const target = shallowRef<HTMLElement | null>(first);
    const variants = ref({ base: { opacity: 0.4 }, active: { opacity: 1 } });
    const state = ref<'base' | 'active'>('base');
    const scope = effectScope();
    const h = scope.run(() =>
      useMotion(target, {
        variants,
        animate: state,
        hover: { scale: 1.1 },
        press: { scale: 0.9 },
        inView: { y: 0 },
        transition: { duration: 0.02 },
      }),
    )!;
    const hoverEnd = calls.hover.at(-1)![1](first, pointer());
    const pressEnd = calls.press.at(-1)![1](first, pointer());
    const viewEnd = calls.view.at(-1)![1](first, {} as IntersectionObserverEntry);
    await nextTick();
    expect(h.isPressed.value).toBe(true);
    if (pressEnd) pressEnd(pointer(), { success: false });
    if (hoverEnd) hoverEnd(pointer());
    if (viewEnd) viewEnd({} as IntersectionObserverEntry);
    state.value = 'active';
    await nextTick();
    await frames(80);
    expect(Number(first.style.opacity)).toBe(1);
    variants.value = { base: { opacity: 0.4 }, active: { opacity: 0.6 } };
    await nextTick();
    await frames(80);
    expect(Number(first.style.opacity)).toBeCloseTo(0.6);
    target.value = null;
    await nextTick();
    expect(h.isAnimating.value).toBe(false);
    h.dispose();
    h.dispose();
    await h.start('base');
    scope.stop();
  });
});

import { effectScope, nextTick, ref, shallowRef } from '@usevibejs/ui';
import { mountComposable } from '@usevibejs/ui/testing';
import {
  GroupAnimationWithThen,
  type AnimationPlaybackControls,
  type AnimationPlaybackControlsWithThen,
} from 'motion';
import { describe, expect, it, vi } from 'vitest';
import { createAnimate } from '../src/animate.ts';
import { useMotionSettings } from '../src/config.ts';
import {
  motionConfigKey,
  motionValue,
  useAnimate,
  useMotion,
  useMotionControls,
} from '../src/index.ts';
import { frames, mockReducedMotion } from './media.ts';

function fakeAnimation() {
  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));
  const animation = {
    time: 0,
    speed: 1,
    duration: 2,
    state: 'running',
    finished,
    play: vi.fn<(...args: unknown[]) => unknown>(),
    pause: vi.fn<(...args: unknown[]) => unknown>(),
    stop: vi.fn<(...args: unknown[]) => unknown>(),
    cancel: vi.fn<(...args: unknown[]) => unknown>(),
    complete: vi.fn<(...args: unknown[]) => unknown>(),
  };
  return { animation: animation as unknown as AnimationPlaybackControls, resolve };
}

describe('useAnimate', () => {
  it('animates a motion value to completion with the real Motion engine', async () => {
    const { result: animate, unmount } = mountComposable(() => useAnimate());
    const value = motionValue(0);
    await animate(value, 100, { duration: 0.05 });
    expect(value.get()).toBe(100);
    expect(animate.running).toBe(0);
    unmount();
  });

  it('runs sequences and multi-property keyframes on elements', async () => {
    const { result: animate, unmount } = mountComposable(() => useAnimate());
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    await animate([
      [a, { opacity: [0, 1] }, { duration: 0.03 }],
      [b, { opacity: [0, 0.5], x: [0, 10] }, { duration: 0.03 }],
    ]);
    expect(Number(b.style.opacity)).toBeCloseTo(0.5);
    expect(b.style.transform).toContain('translateX(10px)');
    unmount();
  });

  it('passes reduced motion and configured defaults to Motion', () => {
    mockReducedMotion(true);
    const engine = vi.fn<(...args: unknown[]) => GroupAnimationWithThen>(
      (..._args: unknown[]) => new GroupAnimationWithThen([]),
    );
    const { unmount } = mountComposable(
      () => {
        const animate = createAnimate(useMotionSettings(), undefined, engine);
        animate(document.body, { x: 10 }, { duration: 1 });
        animate([[document.body, { x: 1 }]] as never);
      },
      { provide: { [motionConfigKey as symbol]: { transition: { ease: 'linear' } } } },
    );
    expect(engine).toHaveBeenNthCalledWith(
      1,
      document.body,
      { x: 10 },
      { ease: 'linear', duration: 1, reduceMotion: true },
    );
    expect(engine.mock.calls[1]![1]).toEqual({ ease: 'linear', reduceMotion: true });
    unmount();
  });

  it('resolves selectors inside the root element only', () => {
    const engine = vi.fn<(...args: unknown[]) => GroupAnimationWithThen>(
      (..._args: unknown[]) => new GroupAnimationWithThen([]),
    );
    const root = document.createElement('div');
    root.innerHTML = '<i></i><i></i>';
    document.body.append(root, document.createElement('i'));
    const scope = effectScope();
    scope.run(() =>
      createAnimate(useMotionSettings(), shallowRef(root), engine)('i', { opacity: 1 }),
    );
    expect((engine.mock.calls[0]![0] as unknown as Element[]).length).toBe(2);
    scope.stop();
  });

  it('stops running animations when the scope stops, and starts nothing afterwards', () => {
    const { animation } = fakeAnimation();
    const engine = vi.fn<(...args: unknown[]) => AnimationPlaybackControlsWithThen>(
      () => animation as never,
    );
    const scope = effectScope();
    const animate = scope.run(() => createAnimate(useMotionSettings(), undefined, engine))!;
    animate(document.body, { x: 1 });
    expect(animate.running).toBe(1);
    scope.stop();
    expect(animation.stop).toHaveBeenCalled();
    const late = animate(document.body, { x: 2 });
    expect(engine).toHaveBeenCalledTimes(1);
    expect(late).toBeInstanceOf(GroupAnimationWithThen);
  });

  it('prunes interrupted animations whose finished promise never settles', () => {
    const engine = vi.fn<(...args: unknown[]) => AnimationPlaybackControlsWithThen>(() => {
      const { animation } = fakeAnimation();
      (animation as { state: string }).state = 'idle';
      return animation as never;
    });
    const scope = effectScope();
    const animate = scope.run(() => createAnimate(useMotionSettings(), undefined, engine))!;
    for (let i = 0; i < 50; i++) animate(document.body, { x: i });
    expect(animate.running).toBe(1);
    scope.stop();
  });
});

describe('useMotionControls', () => {
  it('tracks play state, speed and time of the controlled animation', async () => {
    const { result: controls, unmount } = mountComposable(() => useMotionControls());
    expect(controls.state.value).toBe('idle');
    expect(controls.duration).toBe(0);
    controls.play();
    await controls.finished;
    const first = fakeAnimation();
    controls.set(first.animation);
    expect(controls.state.value).toBe('running');
    controls.pause();
    expect(controls.state.value).toBe('paused');
    expect(first.animation.pause).toHaveBeenCalled();
    controls.play();
    expect(controls.state.value).toBe('running');
    controls.speed.value = 2;
    expect(first.animation.speed).toBe(2);
    controls.time = 1.5;
    expect(controls.time).toBe(1.5);
    expect(controls.duration).toBe(2);
    first.resolve();
    await controls.finished;
    await nextTick();
    expect(controls.state.value).toBe('finished');

    const second = fakeAnimation();
    controls.set(second.animation);
    expect(second.animation.speed).toBe(2);
    controls.complete();
    expect(second.animation.complete).toHaveBeenCalled();
    expect(controls.state.value).toBe('finished');
    controls.cancel();
    expect(controls.state.value).toBe('idle');
    unmount();
    expect(second.animation.stop).toHaveBeenCalled();
  });

  it('ignores the completion of a replaced animation', async () => {
    const { result: controls, unmount } = mountComposable(() => useMotionControls());
    const old = fakeAnimation();
    controls.set(old.animation);
    controls.set(fakeAnimation().animation);
    old.resolve();
    await old.animation.finished;
    await nextTick();
    expect(controls.state.value).toBe('running');
    controls.stop();
    expect(controls.state.value).toBe('idle');
    unmount();
  });
});

describe('useMotion', () => {
  it('enters from initial, retargets reactively and reports completion once per target', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const target = ref<'a' | 'b'>('a');
    const done = vi.fn<(...args: unknown[]) => unknown>();
    const { result, unmount } = mountComposable(() =>
      useMotion(el, {
        variants: { a: { opacity: 0.5 }, b: { opacity: 1 } },
        initial: { opacity: 0 },
        animate: target,
        transition: { duration: 0.04 },
        onAnimationComplete: done,
      }),
    );
    await frames(120);
    expect(Number(el.style.opacity)).toBeCloseTo(0.5);
    target.value = 'b';
    await nextTick();
    await frames(20);
    target.value = 'a'; // interrupt
    await nextTick();
    target.value = 'b';
    await nextTick();
    await frames(150);
    expect(Number(el.style.opacity)).toBeCloseTo(1);
    // The interrupted animations never report completion.
    expect(done).toHaveBeenCalledTimes(2);
    expect(result.isAnimating.value).toBe(false);
    await result.start({ opacity: 0.2 }, { duration: 0.02 });
    expect(Number(el.style.opacity)).toBeCloseTo(0.2);
    unmount();
  });

  it('with initial: false jumps straight to the target', async () => {
    const el = document.createElement('div');
    const { unmount } = mountComposable(() =>
      useMotion(el, { initial: false, animate: { opacity: 0.3 } }),
    );
    await frames(40);
    expect(Number(el.style.opacity)).toBeCloseTo(0.3);
    unmount();
  });

  it('binds gestures to the current element and removes them on replacement', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const first = document.createElement('button');
    const second = document.createElement('button');
    document.body.append(first, second);
    const target = shallowRef<HTMLElement>(first);
    const { result, unmount } = mountComposable(() =>
      useMotion(target, { hover: { scale: 1.1 }, press: { scale: 0.9 }, inView: { opacity: 1 } }),
    );
    const enter = (el: Element) =>
      el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    const leave = (el: Element) =>
      el.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    enter(first);
    expect(result.isHovered.value).toBe(true);
    leave(first);
    target.value = second;
    await nextTick();
    enter(first);
    expect(result.isHovered.value).toBe(false);
    enter(second);
    expect(result.isHovered.value).toBe(true);
    result.stop();
    unmount();
    expect(result.isHovered.value).toBe(false);
    enter(second);
    expect(result.isHovered.value).toBe(false);
  });
});

describe('control edge cases', () => {
  it('handles empty controls, rejection, replay and calls after disposal', async () => {
    const scope = effectScope();
    const c = scope.run(() => useMotionControls())!;
    c.stop();
    c.cancel();
    c.complete();
    c.pause();
    c.time = 1;
    c.speed.value = 2;
    expect(c.time).toBe(0);
    expect(c.speed.value).toBe(2);
    let reject!: (error: Error) => void;
    const a = fakeAnimation();
    a.animation.finished = new Promise((_, r) => {
      reject = r;
    });
    c.set(a.animation);
    reject(new Error('aborted'));
    await Promise.resolve();
    expect(c.state.value).toBe('idle');
    const next = fakeAnimation();
    c.set(next.animation);
    c.complete();
    c.play();
    expect(next.animation.play).toHaveBeenCalledOnce();
    scope.stop();
    const late = fakeAnimation();
    c.set(late.animation);
    c.play();
    c.pause();
    c.complete();
    expect(late.animation.stop).toHaveBeenCalledOnce();
  });
  it.each(['replace', 'cancel'] as const)(
    'implements explicit %s interruption',
    async (interrupt) => {
      mockReducedMotion(false);
      const el = document.createElement('div');
      document.body.append(el);
      const state = ref(0);
      const scope = effectScope();
      const h = scope.run(() =>
        useMotion(el, {
          initial: false,
          animate: () => ({ x: state.value }),
          interrupt,
          transition: { duration: 0.04 },
        }),
      )!;
      state.value = 100;
      await nextTick();
      await frames(20);
      state.value = 20;
      await nextTick();
      await frames(100);
      expect(el.style.transform).toContain('20px');
      h.dispose();
      scope.stop();
    },
  );
});

import { shallowRef, type Ref, type ShallowRef } from '@usevibejs/ui';
import type { AnimationPlaybackControls } from 'motion';
import { onDispose } from './internal.ts';

export type MotionPlayState = 'idle' | 'running' | 'paused' | 'finished';

/**
 * Reactive playback controls around the latest Motion animation handed to `set()`. The play
 * state and speed are reactive; `time` is read and written on demand so that a running animation
 * never schedules a Vibe.js update per frame.
 */
export interface MotionControls {
  /** The animation being controlled, `null` before the first one. */
  readonly animation: Readonly<ShallowRef<AnimationPlaybackControls | null>>;
  readonly state: Readonly<Ref<MotionPlayState>>;
  /** Playback rate. Writing it changes the current animation and every later one. */
  readonly speed: Ref<number>;
  /** The current time of the animation in seconds (not reactive). */
  time: number;
  /** The duration in seconds, `0` without an animation (not reactive). */
  readonly duration: number;
  /** Resolves when the current animation finishes, immediately without one. */
  readonly finished: Promise<void>;
  /** Takes control of `animation`; the previous one keeps running unless stopped first. */
  set<A extends AnimationPlaybackControls>(animation: A): A;
  play(): void;
  pause(): void;
  /** Stops at the current values. The animation cannot resume. */
  stop(): void;
  /** Stops and reverts to the values before the animation started. */
  cancel(): void;
  /** Jumps to the end state. */
  complete(): void;
}

export function useMotionControls(): MotionControls {
  const animation = shallowRef<AnimationPlaybackControls | null>(null);
  const state = shallowRef<MotionPlayState>('idle');
  const speed = shallowRef(1);
  let generation = 0;

  const track = (current: AnimationPlaybackControls, id: number) => {
    current.finished.then(
      () => {
        if (id === generation && state.value !== 'idle') state.value = 'finished';
      },
      () => {
        if (id === generation) state.value = 'idle';
      },
    );
  };

  const end = (method: 'stop' | 'cancel' | 'complete', next: MotionPlayState) => {
    const current = animation.value;
    if (!current) return;
    generation++;
    current[method]();
    state.value = next;
  };

  const controls: MotionControls = {
    animation,
    state,
    speed: {
      get value() {
        return speed.value;
      },
      set value(rate: number) {
        speed.value = rate;
        if (animation.value) animation.value.speed = rate;
      },
    } as Ref<number>,
    get time() {
      return animation.value?.time ?? 0;
    },
    set time(seconds: number) {
      if (animation.value) animation.value.time = seconds;
    },
    get duration() {
      return animation.value?.duration ?? 0;
    },
    get finished() {
      return animation.value ? animation.value.finished.then(() => {}) : Promise.resolve();
    },
    set(next) {
      const id = ++generation;
      animation.value = next;
      if (speed.value !== 1) next.speed = speed.value;
      state.value = 'running';
      track(next, id);
      return next;
    },
    play() {
      const current = animation.value;
      if (!current) return;
      if (state.value === 'finished' || state.value === 'idle') track(current, ++generation);
      current.play();
      state.value = 'running';
    },
    pause() {
      if (!animation.value || state.value !== 'running') return;
      animation.value.pause();
      state.value = 'paused';
    },
    stop: () => end('stop', 'idle'),
    cancel: () => end('cancel', 'idle'),
    complete: () => end('complete', 'finished'),
  };
  onDispose(() => {
    generation++;
    animation.value?.stop();
  });
  return controls;
}

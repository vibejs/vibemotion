import { effectScope, ref } from '@usevibejs/ui';
import { mountComposable } from '@usevibejs/ui/testing';
import { describe, expect, it } from 'vitest';
import { mockReducedMotion } from '../test/media.ts';
import { applySettings, motionConfigKey, useMotionSettings, useReducedMotion } from './config.ts';

describe('useReducedMotion', () => {
  it('follows the media query and shares one listener between consumers', () => {
    const media = mockReducedMotion(false);
    const a = mountComposable(() => useReducedMotion());
    const b = mountComposable(() => useReducedMotion());
    expect(media.listeners.size).toBe(1);
    expect(a.result.value).toBe(false);
    media.set(true);
    expect(a.result.value).toBe(true);
    expect(b.result.value).toBe(true);
    a.unmount();
    expect(media.listeners.size).toBe(1);
    b.unmount();
    expect(media.listeners.size).toBe(0);
    media.set(false);
  });

  it('is overridden by a provided configuration, reactively', () => {
    mockReducedMotion(true);
    const setting = ref<'user' | 'always' | 'never'>('never');
    const { result, unmount } = mountComposable(() => useReducedMotion(), {
      provide: { [motionConfigKey as symbol]: () => ({ reducedMotion: setting.value }) },
    });
    expect(result.value).toBe(false);
    setting.value = 'always';
    expect(result.value).toBe(true);
    setting.value = 'user';
    expect(result.value).toBe(true);
    unmount();
  });

  it('works outside a component and without matchMedia', () => {
    const scope = effectScope();
    const reduced = scope.run(() => useReducedMotion())!;
    expect(typeof reduced.value).toBe('boolean');
    scope.stop();
  });
});

describe('applySettings', () => {
  it('merges the default transition and adds the accessibility flags', () => {
    mockReducedMotion(true);
    const scope = effectScope();
    scope.run(() => {
      const settings = useMotionSettings();
      expect(applySettings(settings, { duration: 1 })).toEqual({ duration: 1, reduceMotion: true });
    });
    scope.stop();
    const { result, unmount } = mountComposable(() => useMotionSettings(), {
      provide: {
        [motionConfigKey as symbol]: {
          reducedMotion: 'never',
          skipAnimations: true,
          transition: { duration: 3, ease: 'linear' },
        },
      },
    });
    expect(applySettings(result, { duration: 1 })).toEqual({
      duration: 1,
      ease: 'linear',
      reduceMotion: false,
      skipAnimations: true,
    });
    unmount();
  });
});

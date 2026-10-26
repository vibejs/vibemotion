import { describe, expect, it } from 'vitest';
import { composeLayers, fromTo, resolveTarget, splitTarget } from './target.ts';

const variants = { hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0 }, big: { scale: 2 } };

describe('resolveTarget', () => {
  it('returns objects as they are and merges variant names left to right', () => {
    const target = { x: 1 };
    expect(resolveTarget(target, variants)).toBe(target);
    expect(resolveTarget('hidden', variants)).toEqual({ opacity: 0, y: 10 });
    expect(resolveTarget(['hidden', 'big'], variants)).toEqual({ opacity: 0, y: 10, scale: 2 });
    expect(resolveTarget(undefined, variants)).toEqual({});
    expect(resolveTarget(false, variants)).toEqual({});
  });

  it('throws on an unknown variant', () => {
    expect(() => resolveTarget('nope' as never, variants)).toThrow(
      '[VibeMotion] Unknown variant "nope".',
    );
    expect(() => resolveTarget('nope', undefined)).toThrow('Unknown variant');
  });
});

describe('splitTarget', () => {
  it('separates the transition from the keyframes', () => {
    expect(splitTarget({ x: 1, transition: { duration: 2 } })).toEqual([{ x: 1 }, { duration: 2 }]);
  });
});

describe('composeLayers', () => {
  it('lets the last active layer win and returns inactive keys to their resting values', () => {
    const [keyframes, transition] = composeLayers(
      [
        { active: true, target: { opacity: 1 } },
        { active: false, target: { scale: 1.1, backgroundColor: 'red' } },
        { active: true, target: { y: -4, transition: { duration: 0.1 } } },
      ],
      { opacity: 0 },
    );
    // backgroundColor has no resting value, so it is left alone.
    expect(keyframes).toEqual({ opacity: 1, scale: 1, y: -4 });
    expect(transition).toEqual({ duration: 0.1 });
  });

  it('keeps a value set by a lower active layer when a higher layer is inactive', () => {
    const [keyframes] = composeLayers(
      [
        { active: true, target: { y: 0 } },
        { active: false, target: { y: -4 } },
      ],
      { y: 24 },
    );
    expect(keyframes).toEqual({ y: 0 });
  });

  it('uses rest values from initial for keys no active layer defines', () => {
    const [keyframes] = composeLayers([{ active: false, target: { y: 0 } }], { y: 24 });
    expect(keyframes).toEqual({ y: 24 });
  });
});

describe('fromTo', () => {
  it('prepends start values for shared keys only', () => {
    expect(fromTo({ opacity: 0, y: [20, 10], z: 5 }, { opacity: 1, y: 0, x: 3 })).toEqual({
      opacity: [0, 1],
      y: [20, 0],
      x: 3,
    });
    expect(fromTo({ x: 0 }, { x: [5, 10] })).toEqual({ x: [0, 5, 10] });
  });
});

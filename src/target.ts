import type { AnimationOptions, DOMKeyframesDefinition } from 'motion';

/** A keyframe target with an optional transition that overrides the default one. */
export type MotionTarget = DOMKeyframesDefinition & { transition?: AnimationOptions };

/** Named targets. */
export type Variants<V extends string = string> = Record<V, MotionTarget>;

/** A target, a variant name, or variant names merged left to right. */
export type TargetOrVariant<V extends string = string> = MotionTarget | V | readonly V[];

/** The values a property returns to when no state defines it. */
const restingValues: Record<string, number> = {
  x: 0,
  y: 0,
  z: 0,
  rotate: 0,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  skewX: 0,
  skewY: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
};

/** Resolves variant names to one target. Unknown names throw, so typos fail loudly. */
export function resolveTarget<V extends string>(
  definition: TargetOrVariant<V> | undefined | false,
  variants: Partial<Variants<V>> | undefined,
): MotionTarget {
  if (!definition) return {};
  if (typeof definition === 'object' && !Array.isArray(definition)) return definition as MotionTarget;
  const names = (typeof definition === 'string' ? [definition] : definition) as readonly V[];
  const merged: MotionTarget = {};
  for (const name of names) {
    const variant = variants?.[name];
    if (!variant) throw new Error(`[VibeMotion] Unknown variant "${name}".`);
    Object.assign(merged, variant);
  }
  return merged;
}

/** Splits `transition` off a target. */
export function splitTarget(target: MotionTarget): [DOMKeyframesDefinition, AnimationOptions | undefined] {
  const { transition, ...keyframes } = target;
  return [keyframes, transition];
}

/**
 * Layers targets by priority: the last active layer that defines a property wins; a property no
 * active layer defines returns to its value in `rest`, or the CSS default for transforms and
 * opacity. Returns the keyframes and the transition of the highest active layer that has one.
 */
export function composeLayers(
  layers: readonly { active: boolean; target: MotionTarget }[],
  rest: MotionTarget,
): [Record<string, unknown>, AnimationOptions | undefined] {
  const out: Record<string, unknown> = {};
  let transition: AnimationOptions | undefined;
  for (const { active, target } of layers) {
    const [keyframes, own] = splitTarget(target);
    for (const key of Object.keys(keyframes)) {
      if (active) out[key] = (keyframes as Record<string, unknown>)[key];
      else if (!(key in out)) {
        const fallback = (rest as Record<string, unknown>)[key] ?? restingValues[key];
        if (fallback !== undefined) out[key] = fallback;
      }
    }
    if (active && own) transition = own;
  }
  return [out, transition];
}

/** Prepends the `from` values as first keyframes, so an enter animation starts from them. */
export function fromTo(
  from: DOMKeyframesDefinition,
  to: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...to };
  for (const [key, start] of Object.entries(from)) {
    if (!(key in to) || start === undefined) continue;
    const end = to[key];
    const first = Array.isArray(start) ? start[0] : start;
    out[key] = Array.isArray(end) ? [first, ...end] : [first, end];
  }
  return out;
}

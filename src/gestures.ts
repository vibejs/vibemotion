import { shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from '@usevibejs/ui';
import { drag, hover, press, type DragOptions, type EventOptions, type PanInfo } from 'motion';
import { useMotionSettings } from './config.ts';
import { bindElement, onDispose, type ElementTarget } from './internal.ts';

export interface HoverOptions extends EventOptions {
  onStart?: (event: PointerEvent) => void;
  onEnd?: (event: PointerEvent) => void;
}

export interface GestureHandle {
  /** Removes the gesture. Called automatically when the scope stops. */
  stop(): void;
}

/**
 * Tracks pointer hover with Motion's `hover()` gesture, which ignores emulated touch hover.
 * Follows the element of the template ref when it is replaced.
 */
export function useHover(
  target: ElementTarget,
  options: HoverOptions = {},
): GestureHandle & { readonly isHovered: Readonly<Ref<boolean>> } {
  const isHovered = shallowRef(false);
  const { onStart, onEnd, ...eventOptions } = options;
  const stop = bindElement(target, (element) => {
    const remove = hover(
      element,
      (_element, event) => {
        isHovered.value = true;
        onStart?.(event);
        return (endEvent) => {
          isHovered.value = false;
          onEnd?.(endEvent);
        };
      },
      eventOptions,
    );
    return () => {
      remove();
      isHovered.value = false;
    };
  });
  return { isHovered, stop };
}

export interface PressOptions extends EventOptions {
  /** Listen for the release on `window`, so dragging off the element still ends the press. */
  useGlobalTarget?: boolean;
  stopPropagation?: boolean;
  onStart?: (event: PointerEvent) => void;
  /** The press ended on the element (or with Enter): an activation. */
  onEnd?: (event: PointerEvent) => void;
  /** The press ended off the element, or was cancelled. */
  onCancel?: (event: PointerEvent) => void;
}

/**
 * Tracks presses with Motion's `press()` gesture: primary pointer only, Enter on focused elements,
 * and cancellation when the pointer is released outside. Elements that are not natively focusable
 * receive `tabindex="0"` from Motion so keyboard users can press them; give them a role too.
 */
export function usePress(
  target: ElementTarget,
  options: PressOptions = {},
): GestureHandle & { readonly isPressed: Readonly<Ref<boolean>> } {
  const isPressed = shallowRef(false);
  const { onStart, onEnd, onCancel, ...eventOptions } = options;
  const stop = bindElement(target, (element) => {
    const remove = press(
      element,
      (_element, event) => {
        isPressed.value = true;
        onStart?.(event);
        return (endEvent, { success }) => {
          isPressed.value = false;
          (success ? onEnd : onCancel)?.(endEvent);
        };
      },
      eventOptions,
    );
    return () => {
      remove();
      isPressed.value = false;
    };
  });
  return { isPressed, stop };
}

export interface UseDragOptions
  extends Omit<DragOptions, 'constraints' | 'onStart' | 'onMove' | 'onEnd' | 'onTransitionEnd'> {
  /** Pixel distances from the origin, or an element (or template ref) to stay within. */
  constraints?: DragOptions['constraints'] | ElementTarget;
  /** Disable dragging without removing the composable. */
  disabled?: boolean;
  onStart?: (event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => void;
  onMove?: (event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => void;
  onEnd?: (event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => void;
  /** The momentum or snap-back animation after release has finished. */
  onSettle?: () => void;
}

export interface DragHandle extends GestureHandle {
  readonly isDragging: Readonly<Ref<boolean>>;
  /** The axis chosen by `directionLock`, `null` while unlocked. */
  readonly lockedAxis: Readonly<Ref<'x' | 'y' | null>>;
  /** The pointer offset and velocity when the last drag ended, in pixels and pixels per second. */
  readonly lastRelease: Readonly<Ref<Pick<PanInfo, 'offset' | 'velocity'> | null>>;
}

const isElementConstraint = (value: unknown): boolean =>
  value instanceof Element || (typeof value === 'object' && value !== null && 'value' in value) || typeof value === 'function';

/**
 * Makes an element draggable with Motion's `drag()` gesture: axis and direction locking,
 * constraints in pixels or an element, elastic edges, momentum and snap-to-origin. The element
 * moves through its `x`/`y` transform, which `useAnimate()` can animate afterwards. Options are
 * reactive: a change rebinds the gesture without moving the element. With reduced motion,
 * momentum and snap-back become instant.
 *
 * Drag here is visual: for sortable lists or moving data between containers, use a drag-and-drop
 * library and let VibeMotion animate the result.
 */
export function useDrag(target: ElementTarget, options: MaybeRefOrGetter<UseDragOptions> = {}): DragHandle {
  const settings = useMotionSettings();
  const isDragging = shallowRef(false);
  const lockedAxis = shallowRef<'x' | 'y' | null>(null);
  const lastRelease = shallowRef<Pick<PanInfo, 'offset' | 'velocity'> | null>(null);
  let rebind: (() => void) | undefined;

  const stopElement = bindElement(target, (element) => {
    let remove: (() => void) | undefined;
    const bind = () => {
      remove?.();
      remove = undefined;
      const { constraints, disabled, onStart, onMove, onEnd, onSettle, onDirectionLock, ...rest } = toValue(options);
      if (disabled) return;
      const resolvedConstraints = isElementConstraint(constraints)
        ? (toValue(constraints as ElementTarget) ?? undefined)
        : (constraints as DragOptions['constraints']);
      const reduced = settings.reduced.value;
      remove = drag(element, {
        ...rest,
        constraints: resolvedConstraints,
        ...(reduced ? { momentum: false } : {}),
        onStart: (event, info) => {
          isDragging.value = true;
          onStart?.(event, info);
        },
        onMove,
        onEnd: (event, info) => {
          isDragging.value = false;
          lockedAxis.value = null;
          lastRelease.value = { offset: { ...info.offset }, velocity: { ...info.velocity } };
          onEnd?.(event, info);
        },
        onDirectionLock: (axis) => {
          lockedAxis.value = axis;
          onDirectionLock?.(axis);
        },
        onTransitionEnd: onSettle,
      });
    };
    rebind = bind;
    bind();
    return () => {
      remove?.();
      rebind = undefined;
      isDragging.value = false;
      lockedAxis.value = null;
    };
  });
  const stopOptions = watch(
    () => {
      const value = toValue(options);
      return [value, isElementConstraint(value.constraints) ? toValue(value.constraints as ElementTarget) : null, settings.reduced.value];
    },
    () => rebind?.(),
  );
  const stop = () => {
    stopOptions();
    stopElement();
  };
  onDispose(stop);
  return { isDragging, lockedAxis, lastRelease, stop };
}

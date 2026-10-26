// Shared state and behavior for dialogs, popovers, tooltips and other overlays.
import {
  inject,
  onUnmounted,
  provide,
  ref,
  useId,
  watch,
  type InjectionKey,
  type Ref,
  type ShallowRef,
} from '@usevibejs/ui';

export interface OverlayContext {
  open: Ref<boolean>;
  /** Base id: `${id}-content`, `${id}-title` and `${id}-description` name the parts. */
  id: string;
}

/** Opens and closes with a delay, for hover and focus: `show` and `hide` cancel each other. */
export interface DelayedOpen {
  show: () => void;
  hide: () => void;
}

const keys = new Map<string, InjectionKey<OverlayContext>>();
const key = (name: string): InjectionKey<OverlayContext> => {
  if (!keys.has(name)) keys.set(name, Symbol(name));
  return keys.get(name)!;
};

/** Shares the open state of an overlay root, and any `extra` members, with its parts. */
export function provideOverlay<T extends object = {}>(
  name: string,
  open: Ref<boolean>,
  extra = {} as T,
): OverlayContext & T {
  const context = { ...extra, open, id: useId() };
  provide(key(name), context);
  return context;
}

/** Reads the state that the enclosing root provides. */
export function injectOverlay<T extends object = {}>(name: string): OverlayContext & T {
  const context = inject(key(name), null);
  if (!context) throw new Error(`This part must be placed inside ${name}.`);
  return context as OverlayContext & T;
}

/** Sets `open` after the delays from `delays`, for hover cards and tooltips. */
export function useDelayedOpen(
  open: Ref<boolean>,
  delays: () => { open: number; close: number },
): DelayedOpen {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (value: boolean, delay: number): void => {
    clearTimeout(timer);
    if (open.value === value) return;
    if (delay > 0) timer = setTimeout(() => (open.value = value), delay);
    else open.value = value;
  };
  onUnmounted(() => clearTimeout(timer));
  return { show: () => schedule(true, delays().open), hide: () => schedule(false, delays().close) };
}

/**
 * Shows a `popover` element while `open` is true. Returns the `beforetoggle` handler, which syncs
 * changes the browser makes, such as a light dismiss or a `popovertarget` button, back to `open`.
 */
export function usePopover(
  element: Readonly<ShallowRef<HTMLElement | null>>,
  open: Ref<boolean>,
): (event: Event) => void {
  // beforetoggle fires synchronously inside showPopover and hidePopover, so this stays exact.
  let shown = false;
  watch(
    [open, element],
    ([value, current]) => {
      if (!current || value === shown) return;
      if (value) current.showPopover();
      else current.hidePopover();
    },
    { immediate: true, flush: 'post' },
  );
  return (event) => {
    shown = (event as ToggleEvent).newState === 'open';
    open.value = shown;
  };
}

/**
 * Opens a native `<dialog>` as a modal while `open` is true. The browser traps focus, closes on
 * Escape and restores focus on close; the returned handlers sync that back and close on a click
 * on the backdrop when `dismissible` allows it.
 */
export function useModal(
  dialog: Readonly<ShallowRef<HTMLDialogElement | null>>,
  open: Ref<boolean>,
  dismissible: () => boolean,
): { onClose: () => void; onClick: (event: MouseEvent) => void } {
  watch(
    [open, dialog],
    ([value, element]) => {
      if (!element) return;
      if (value && !element.open) element.showModal();
      if (!value && element.open) element.close();
    },
    { immediate: true, flush: 'post' },
  );
  return {
    onClose: () => {
      open.value = false;
    },
    onClick: (event) => {
      // Clicks inside the content target its children; the dialog itself is only hit on the
      // backdrop, or on its own padding, which the bounds check rules out.
      const element = dialog.value;
      if (!dismissible() || !element || event.target !== element) return;
      const box = element.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (!inside) open.value = false;
    },
  };
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Align = 'start' | 'center' | 'end';

export interface Placement {
  side: Side;
  align: Align;
  sideOffset: number;
  alignOffset: number;
}

const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/**
 * Places a floating box next to an anchor: on `side` when it fits, else on the opposite side, then
 * aligned and shifted to stay `padding` pixels inside the viewport.
 */
export function place(
  anchor: { top: number; left: number; width: number; height: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: Placement,
  padding = 8,
): { x: number; y: number; side: Side } {
  const room: Record<Side, number> = {
    top: anchor.top,
    bottom: viewport.height - anchor.top - anchor.height,
    left: anchor.left,
    right: viewport.width - anchor.left - anchor.width,
  };
  const vertical = placement.side === 'top' || placement.side === 'bottom';
  const needed = (vertical ? size.height : size.width) + placement.sideOffset + padding;
  const side =
    room[placement.side] < needed && room[opposite[placement.side]] > room[placement.side]
      ? opposite[placement.side]
      : placement.side;

  const along = (start: number, length: number, extent: number): number =>
    placement.align === 'start'
      ? start + placement.alignOffset
      : placement.align === 'end'
        ? start + length - extent - placement.alignOffset
        : start + (length - extent) / 2;
  const clamp = (value: number, extent: number, limit: number): number =>
    Math.min(Math.max(value, padding), Math.max(padding, limit - extent - padding));

  if (vertical) {
    const y =
      side === 'top'
        ? anchor.top - size.height - placement.sideOffset
        : anchor.top + anchor.height + placement.sideOffset;
    const x = clamp(along(anchor.left, anchor.width, size.width), size.width, viewport.width);
    return { x, y, side };
  }
  const x =
    side === 'left'
      ? anchor.left - size.width - placement.sideOffset
      : anchor.left + anchor.width + placement.sideOffset;
  const y = clamp(along(anchor.top, anchor.height, size.height), size.height, viewport.height);
  return { x, y, side };
}

const sides: Record<Side, Side> = { left: 'right', right: 'left', top: 'top', bottom: 'bottom' };
const aligns: Record<Align, Align> = { start: 'end', end: 'start', center: 'center' };

/** In right-to-left text, `start` and `end` and the left and right sides swap. */
export const mirror = (placement: Placement, rtl: boolean): Placement =>
  rtl ? { ...placement, side: sides[placement.side], align: aligns[placement.align] } : placement;

/**
 * Keeps a fixed-position floating element next to its anchor while `open` is true, following
 * scrolling and resizing. Returns the side it was placed on, for `data-side` styles.
 */
export function useFloating(
  /** An element, or a fixed box such as the point where a context menu opens. */
  anchor: () => Element | { top: number; left: number; width: number; height: number } | null,
  floating: Readonly<ShallowRef<HTMLElement | null>>,
  open: () => boolean,
  placement: () => Placement,
): Ref<Side> {
  const side = ref<Side>(placement().side);
  const update = (): void => {
    const target = anchor();
    const element = floating.value;
    if (!target || !element) return;
    const result = place(
      target instanceof Element ? target.getBoundingClientRect() : target,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      mirror(placement(), element.closest('[dir]')?.getAttribute('dir') === 'rtl'),
    );
    element.style.left = `${result.x}px`;
    element.style.top = `${result.y}px`;
    side.value = result.side;
  };
  const stop = (): void => {
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', update);
  };
  watch(
    open,
    (value) => {
      stop();
      if (!value) return;
      update();
      // A popovertarget click opens the state from beforetoggle, before the browser shows the
      // popover, so the first measure can see no size. Measure again before the first paint.
      requestAnimationFrame(update);
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
    },
    { immediate: true, flush: 'post' },
  );
  onUnmounted(stop);
  return side;
}

/** Finds the element that anchors overlay `id`: a trigger or an anchor part marks itself. */
export const anchorOf = (id: string): Element | null =>
  document.querySelector(`[data-anchor="${id}"]`);

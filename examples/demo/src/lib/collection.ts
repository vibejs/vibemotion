// Keyboard navigation for groups of items: tabs, toggle groups, menus and listboxes.
import {
  nextTick,
  onMounted,
  provide,
  ref,
  useId,
  watch,
  type Ref,
  type ShallowRef,
} from '@usevibejs/ui';

export type Orientation = 'horizontal' | 'vertical';

/** Whether `element` is in right-to-left text, from the nearest `dir` attribute. */
export const isRtl = (element: Element | null | undefined): boolean =>
  element?.closest('[dir]')?.getAttribute('dir') === 'rtl';

/**
 * The key as if the text ran left to right: in right-to-left text, ArrowLeft moves forward and
 * ArrowRight back, so they swap.
 */
export function logicalKey(key: string, element: Element | null | undefined): string {
  if (!isRtl(element)) return key;
  return key === 'ArrowLeft' ? 'ArrowRight' : key === 'ArrowRight' ? 'ArrowLeft' : key;
}

/**
 * Returns the item a navigation key moves to from `current`: arrow keys along `orientation`
 * (both axes for `both`), Home and End. Returns undefined for any other key.
 */
export function nextItem(
  items: readonly HTMLElement[],
  current: Element | null,
  key: string,
  orientation: Orientation | 'both',
  loop = true,
): HTMLElement | undefined {
  if (!items.length) return;
  if (key === 'Home') return items[0];
  if (key === 'End') return items[items.length - 1];
  const vertical = orientation !== 'horizontal';
  const horizontal = orientation !== 'vertical';
  const forward = (vertical && key === 'ArrowDown') || (horizontal && key === 'ArrowRight');
  const back = (vertical && key === 'ArrowUp') || (horizontal && key === 'ArrowLeft');
  if (!forward && !back) return;
  const index = items.indexOf(current as HTMLElement);
  if (index === -1) return forward ? items[0] : items[items.length - 1];
  const next = index + (forward ? 1 : -1);
  if (next >= 0 && next < items.length) return items[next];
  return loop ? items[(next + items.length) % items.length] : items[index];
}

/**
 * Matches typed characters against the items' labels (`data-label`, else their text). Typing the
 * same letter again cycles through the items that start with it. Returns the match, if any.
 */
export function createTypeahead(
  timeout = 500,
): (
  key: string,
  items: readonly HTMLElement[],
  current: Element | null,
) => HTMLElement | undefined {
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (key, items, current) => {
    if (key.length !== 1 || (key === ' ' && !buffer)) return;
    clearTimeout(timer);
    timer = setTimeout(() => (buffer = ''), timeout);
    buffer += key.toLowerCase();
    const repeated = [...buffer].every((character) => character === buffer[0]);
    const search = repeated ? buffer[0] : buffer;
    const index = items.indexOf(current as HTMLElement);
    const start = index === -1 ? 0 : index + (repeated ? 1 : 0);
    const label = (item: HTMLElement): string =>
      String(item.dataset.label ?? item.textContent)
        .trim()
        .toLowerCase();
    return [...items.slice(start), ...items.slice(0, start)].find((item) =>
      label(item).startsWith(search),
    );
  };
}

const disabled = ':disabled, [aria-disabled="true"], [data-disabled]';
const selected = '[aria-selected="true"], [aria-pressed="true"], [aria-checked="true"]';

/**
 * Keeps one item of `root` in the tab order: the focused one, else the selected one, else the
 * first. Arrow keys, Home and End move focus between the enabled items matching `selector`.
 */
export function useRovingFocus(
  root: Readonly<ShallowRef<HTMLElement | null>>,
  selector: string,
  options: () => { orientation: Orientation | 'both' },
): {
  onKeydown: (event: KeyboardEvent) => HTMLElement | undefined;
  onFocusin: (event: FocusEvent) => void;
  sync: () => void;
} {
  const items = (): HTMLElement[] =>
    [...root.value!.querySelectorAll<HTMLElement>(selector)].filter(
      (item) => !item.matches(disabled),
    );
  const focus = (active: Element | null | undefined): void => {
    const list = items();
    const current =
      list.find((item) => item === active) ??
      list.find((item) => item.matches(selected)) ??
      list[0];
    for (const item of list) item.tabIndex = item === current ? 0 : -1;
  };
  onMounted(() => focus(null));
  return {
    onKeydown: (event) => {
      const key = logicalKey(event.key, root.value);
      const next = nextItem(items(), document.activeElement, key, options().orientation);
      if (!next) return;
      event.preventDefault();
      next.focus();
      focus(next);
      return next;
    },
    onFocusin: (event) => focus(event.target as Element),
    sync: () => focus(null),
  };
}

/**
 * Keeps one option of a list active while focus stays in an input, as command menus and comboboxes
 * do: the input points at it with `aria-activedescendant`. Hidden and disabled options are skipped.
 */
export function useActiveDescendant(
  list: () => HTMLElement,
  selector: string,
): {
  active: Ref<string>;
  /** Activates the first visible option, after filtering. */
  reset: () => void;
  /** Activates an option, for example on hover. */
  activate: (option: HTMLElement) => void;
  /** Handles ArrowUp, ArrowDown and Enter; returns whether it did. */
  onKeydown: (event: KeyboardEvent) => boolean;
} {
  const active = ref('');
  const options = (): HTMLElement[] =>
    [...list().querySelectorAll<HTMLElement>(selector)].filter(
      (option) => !option.hidden && !option.hasAttribute('data-disabled'),
    );
  const activate = (option: HTMLElement | undefined): void => {
    active.value = option?.id ?? '';
    // Initial selection must not pull an embedded command menu into view on page load.
    if (list().contains(document.activeElement)) option?.scrollIntoView({ block: 'nearest' });
  };
  return {
    active,
    reset: () => activate(options()[0]),
    activate,
    onKeydown: (event) => {
      const visible = options();
      const current = visible.find((option) => option.id === active.value) ?? null;
      if (event.key === 'Enter') {
        if (!current) return false;
        event.preventDefault();
        current.click();
        return true;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
      event.preventDefault();
      activate(nextItem(visible, current, event.key, 'vertical', false));
      return true;
    },
  };
}

/**
 * Shares a command menu's search and active item with its input and items. Command and
 * CommandDialog call it, so that items in either one's slot find it.
 */
export function provideCommand(
  root: Readonly<ShallowRef<HTMLElement | null>>,
  search: Ref<string>,
): void {
  const options = useActiveDescendant(() => root.value!, '[data-slot="command-item"]');
  // After items filter themselves, the first visible one becomes active.
  onMounted(options.reset);
  watch(search, () => nextTick(options.reset));
  provide(Symbol.for('vibecn.command'), { id: useId(), search, ...options });
}

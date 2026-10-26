import { flushPromises, mount } from '@usevibejs/ui/testing';
import { describe, expect, it, vi } from 'vitest';
import ListFixture from './fixtures/ListFixture.vibe';
import PresenceFixture from './fixtures/PresenceFixture.vibe';
import { frames } from './media.ts';

const boxes = (root: Element) => root.querySelectorAll('.box').length;
const texts = (root: Element) => Array.from(root.querySelectorAll('li'), (li) => li.textContent);

describe('usePresence in a real .vibe component', () => {
  it('keeps exiting content rendered and inert until the exit animation ends', async () => {
    const onExited = vi.fn<(...args: unknown[]) => unknown>();
    const wrapper = mount(PresenceFixture, {
      props: { show: true, onExited },
      attachTo: document.body,
    });
    const root = wrapper.element as Element;
    await flushPromises();
    expect(boxes(root)).toBe(1);
    await wrapper.setProps({ show: false });
    await flushPromises();
    expect(boxes(root)).toBe(1);
    expect(root.querySelector('.box')!.hasAttribute('inert')).toBe(true);
    expect(root.querySelector('.box')!.getAttribute('aria-hidden')).toBe('true');
    await frames(250);
    await flushPromises();
    expect(boxes(root)).toBe(0);
    expect(onExited).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('reverses an interrupted exit and ignores its stale completion', async () => {
    const onExited = vi.fn<(...args: unknown[]) => unknown>();
    const wrapper = mount(PresenceFixture, {
      props: { show: true, onExited },
      attachTo: document.body,
    });
    const root = wrapper.element as Element;
    await frames(150); // Let enter finish: an exit from opacity 0 to 0 legitimately completes immediately.
    await wrapper.setProps({ show: false });
    expect(root.querySelector('.box')!.hasAttribute('inert')).toBe(true);
    await frames(30);
    await wrapper.setProps({ show: true });
    await frames(250);
    await flushPromises();
    expect(boxes(root)).toBe(1);
    expect(root.querySelector('.box')!.hasAttribute('inert')).toBe(false);
    expect(onExited).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('collapses a hide/show in the same tick into nothing', async () => {
    const wrapper = mount(PresenceFixture, { props: { show: true }, attachTo: document.body });
    await flushPromises();
    void wrapper.setProps({ show: false });
    await wrapper.setProps({ show: true });
    await frames(200);
    expect(boxes(wrapper.element as Element)).toBe(1);
    wrapper.unmount();
  });

  it('restores focus to the element focused when the content appeared', async () => {
    const wrapper = mount(PresenceFixture, { props: { show: false }, attachTo: document.body });
    const root = wrapper.element as Element;
    root.querySelector<HTMLElement>('.trigger')!.focus();
    await wrapper.setProps({ show: true });
    await flushPromises();
    root.querySelector<HTMLElement>('.inner')!.focus();
    await wrapper.setProps({ show: false });
    await flushPromises();
    expect(document.activeElement).toBe(root.querySelector('.trigger'));
    wrapper.unmount();
  });

  it('stops cleanly when unmounted during an exit', async () => {
    const onExited = vi.fn<(...args: unknown[]) => unknown>();
    const wrapper = mount(PresenceFixture, {
      props: { show: true, onExited },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.setProps({ show: false });
    wrapper.unmount();
    await frames(200);
    expect(onExited).not.toHaveBeenCalled();
  });
});

describe('usePresenceList', () => {
  it('keeps removed items at their position until they exit', async () => {
    const wrapper = mount(ListFixture, {
      props: { items: ['a', 'b', 'c'] },
      attachTo: document.body,
    });
    const root = wrapper.element as Element;
    await wrapper.setProps({ items: ['a', 'c', 'd'] });
    await flushPromises();
    expect(texts(root)).toEqual(['a', 'b', 'c', 'd']);
    expect(root.querySelectorAll('[data-exiting="true"]')).toHaveLength(1);
    await frames(250);
    await flushPromises();
    expect(texts(root)).toEqual(['a', 'c', 'd']);
    wrapper.unmount();
  });

  it('reverses items added back during their exit without duplicating them', async () => {
    const wrapper = mount(ListFixture, { props: { items: ['a', 'b'] }, attachTo: document.body });
    const root = wrapper.element as Element;
    await wrapper.setProps({ items: ['a'] });
    await frames(20);
    await wrapper.setProps({ items: ['a', 'b'] });
    await frames(250);
    await flushPromises();
    expect(texts(root)).toEqual(['a', 'b']);
    expect(root.querySelectorAll('[data-exiting="true"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it("mode 'wait' adds new items only after exits finish", async () => {
    const wrapper = mount(ListFixture, {
      props: { items: ['one'], mode: 'wait' },
      attachTo: document.body,
    });
    const root = wrapper.element as Element;
    await wrapper.setProps({ items: ['two'] });
    await flushPromises();
    expect(texts(root)).toEqual(['one']);
    await frames(250);
    await flushPromises();
    expect(texts(root)).toEqual(['two']);
    wrapper.unmount();
  });
});

describe('presence boundaries', () => {
  it('restores caller accessibility attributes when an exit is interrupted', async () => {
    const wrapper = mount(PresenceFixture, { props: { show: true }, attachTo: document.body });
    await frames(150);
    const element = (wrapper.element as Element).querySelector<HTMLElement>('.box')!;
    element.setAttribute('aria-hidden', 'false');
    element.setAttribute('inert', 'original');
    await wrapper.setProps({ show: false });
    await frames(20);
    await wrapper.setProps({ show: true });
    expect(element.getAttribute('aria-hidden')).toBe('false');
    expect(element.getAttribute('inert')).toBe('original');
    wrapper.unmount();
  });
  it('moves focus from a removed item to its surviving neighbour', async () => {
    const wrapper = mount(ListFixture, {
      props: { items: ['a', 'b', 'c'] },
      attachTo: document.body,
    });
    await frames(120);
    const root = wrapper.element as Element;
    const rows = root.querySelectorAll<HTMLElement>('li');
    rows.forEach((row) => (row.tabIndex = 0));
    rows[1]!.focus();
    await wrapper.setProps({ items: ['a', 'c'] });
    expect(document.activeElement?.textContent).toBe('c');
    wrapper.unmount();
  });
});

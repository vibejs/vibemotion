import { computed, effectScope, ref, type Ref } from '@usevibejs/ui';
import {
  useMotion,
  useMotionControls,
  useMotionStyle,
  useMotionValue,
  useSpring,
  useTransform,
  usePresenceList,
  type ElementTarget,
  type MotionValue,
} from '../src/index.ts';
import { useAnimate as mini } from '../src/mini.ts';

/** Compile-only public contract; negative assertions must remain errors. */
export function publicTypeContract(): void {
  effectScope().run(() => {
    const element: ElementTarget<HTMLElement> = ref<HTMLElement | null>(null);
    const variant = ref<'closed' | 'open'>('closed');
    const motion = useMotion(element, {
      variants: { closed: { opacity: 0 }, open: { opacity: 1 } },
      animate: computed(() => variant.value),
      transition: ref({ duration: 0.2 }),
    });
    motion.start('open');
    // @ts-expect-error Inferred variant names reject misspellings.
    motion.start('opened');
    const x: MotionValue<number> = useMotionValue(0);
    const spring: MotionValue<number> = useSpring(ref(0));
    const color: MotionValue<string> = useTransform(x, [0, 1], ['#fff', '#000']);
    const doubled: MotionValue<number> = useTransform(() => spring.get() * 2);
    useMotionStyle(element, { x, color, opacity: 1 });
    const speed: Ref<number> = useMotionControls().speed;
    speed.value = -1;
    // @ts-expect-error Playback speed remains numeric.
    speed.value = 'fast';
    mini()(document.body, { opacity: [0, 1] });
    // @ts-expect-error Native mini cannot animate MotionValues.
    mini()(x, 1);
    const list = usePresenceList(ref([{ id: 'a', title: 'Hello' }]), { key: (item) => item.id });
    const title: string | undefined = list.items.value[0]?.item.title;
    void doubled;
    void title;
  });
}

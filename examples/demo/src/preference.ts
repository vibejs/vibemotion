import { shallowRef } from '@usevibejs/ui';
import type { ReducedMotionSetting } from '@usevibejs/motion';

/** The demo's reduced-motion override; `'user'` follows the operating system setting. */
export const motionPreference = shallowRef<ReducedMotionSetting>('user');

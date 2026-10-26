import './style.css';
import { createApp } from '@usevibejs/ui';
import { motionConfigKey, type MotionConfig } from '@usevibejs/motion';
import { createRouter, createWebHistory } from '@usevibejs/ui/router';
import App from './App.vibe';
import { motionPreference } from './preference.ts';
import { routes } from './routes.ts';

export const router = createRouter({ history: createWebHistory(), routes });

declare module '@usevibejs/ui/router' {
  interface Register {
    router: typeof router;
  }
}

const app = createApp(App);
// App-wide motion configuration, driven by the toolbar's reduced-motion switch.
app.provide(motionConfigKey, (): MotionConfig => ({ reducedMotion: motionPreference.value }));
app.use(router);
app.mount('#app');

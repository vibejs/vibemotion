# VibeMotion

**Beautiful Motion for Vibe.js**

Native Vibe.js composables for Motion's JavaScript engine. Reactive targets,
springs, values, gestures, scroll, retained exits and shared layout transitions.
ESM, strict TypeScript, MIT. No React or Vue runtime.

```sh
pnpm add @usevibejs/motion @usevibejs/ui
```

Requires Vibe.js **0.1.x** and its matching compiler. Motion **14.6.0** is an
external runtime dependency, installed automatically. Tooling requires Node
`^24.15.0 || >=26`. See [compatibility research](docs/RESEARCH.md).

```html
<script setup lang="ts">
import { ref, useTemplateRef } from '@usevibejs/ui';
import { useMotion } from '@usevibejs/motion';

const active = ref(false);
const card = useTemplateRef<HTMLElement>('card');
useMotion(card, {
  initial: { opacity: 0, y: 16 },
  animate: () => ({ opacity: 1, y: active.value ? -12 : 0 }),
  hover: { scale: 1.03 },
  press: { scale: 0.97 },
  transition: { type: 'spring', stiffness: 350, damping: 28 },
});
</script>
<template>
  <button ref="card" type="button" @click="active = !active">Move me</button>
</template>
```

Use composables in component setup or an active `effectScope().run()`. The scope
owns resources and stops them on disposal. Motion writes styles through its frame
loop; application refs do not need to update each frame.

- [Handbook and API reference](docs/guide.md)
- [Architecture and framework constraints](docs/decisions/0001-architecture.md)
- [Performance and reproducible measurements](docs/performance.md)
- [Contributing and verification](CONTRIBUTING.md)
- [Third-party notices](THIRD-PARTY-NOTICES.md)

## Demo

```sh
pnpm install
pnpm dev
```

Thirteen interactive `.vibe` compositions include spring controls, animated Vibecn
buttons/cards/dialog/tabs, stagger, reveal, parallax, drag physics, a modal drawer,
shared elements, grid reordering and retained notification exits. `/guide` contains
live presence and View Transition examples; `/bench` runs repeatable workloads.

## Safe presence

```ts
const show = ref(false)
const panel = useTemplateRef<HTMLElement>('panel')
const presence = usePresence(show, panel, {
  initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 },
})
// <div v-if="presence.isPresent.value" ref="panel">...</div>
```

Create the controller outside the branch it retains. Vibe.js removes ordinary
`v-if="show"` content immediately. This library does not intercept removal or
promise automatic AnimatePresence parity. See [presence](docs/guide.md#presence).

## Lightweight imports

```ts
import { useAnimate } from '@usevibejs/motion/mini'
```

Mini supports native DOM-style keyframes (including full `transform` strings).
Use the root entry for independent transforms, Motion values and timelines.
Unused root exports are tree shaken. Neither runtime is bundled into the published
adapter. [Measurements](reports/bundle-size.json) include Motion in consumer bundles.

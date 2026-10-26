# VibeMotion handbook

## Installation and quick start

Install `@usevibejs/motion` with `@usevibejs/ui@^0.1.0`. Compile `.vibe` components
with the **same version** of `@usevibejs/compiler` as UI. The adapter pins Motion
14.6.0; do not alias it to React or Vue entry points. See the [README](../README.md)
for a complete component. No plugin installation or directive registration is needed.

All composables that allocate resources require component setup or an active
public effect scope. For non-component code:

```ts
import { effectScope } from '@usevibejs/ui'
import { useAnimate } from '@usevibejs/motion'
const scope = effectScope()
const animate = scope.run(() => useAnimate())!
// Use animate from event handlers; the captured owner remains the scope above.
scope.stop()
```

Calls outside an active scope throw a `[VibeMotion]` error. Calls made asynchronously
inside a component need a composable created synchronously in setup; do not create
new composables after `await` without an explicit scope.

## Core concepts and reactive animations

Vibe.js owns application state and DOM structure. Motion owns animated properties.
Give an animated element a typed `useTemplateRef<HTMLElement>('card')`. The adapter
waits for null refs and rebinds on replacement. Replacing a target stops animation
and removes gestures on the previous element. Creating an effect scope gives the
same ownership as component setup.

`useMotion(element, options)` composes a resting `animate` target with viewport,
hover and press layers in that priority order. Every layer defines only the
properties it needs. `animate`, `transition` and `variants` accept refs or getters.
A transition change retargets the current state. Changes in a getter's computed
dependencies trigger an animation; unrelated refs do not.

```ts
const state = computed(() => expanded.value ? 'expanded' : 'compact')
const motion = useMotion(card, {
  variants: {
    compact: { opacity: 0.7, scale: 1 },
    expanded: { opacity: 1, scale: 1.05 },
  },
  initial: false,
  animate: state,
  hover: { y: -4 },
  transition: () => ({ type: 'spring', stiffness: stiffness.value, damping: 26 }),
})
```

`initial: false` skips the first animation. Omitted initial values animate from the
current styles. Named variants and arrays of names merge left to right. Unknown
names throw; known names are inferred in `motion.start('expanded')`. A variant's
`transition` overrides the default. Inactive transform and opacity layers return
to their initial/resting/default values. For other properties (colors, shadows,
filters), explicitly include the resting value in `animate`; the adapter does not
invent a CSS reset value.

Identical targets and transitions do not restart. Rapid updates are batched by
Vibe.js. The default interruption policy `continue` lets Motion transfer current
values and spring velocity to the new target. `replace` explicitly stops the
previous animation first. `cancel` reverts it before starting the replacement.
`motion.start(target, transition?)` temporarily overrides declared state; the next
reactive/gesture change restores the declaration. Completion callbacks are guarded
by generations so stale animations never report a newer target as completed.

`motion.stop()` stops animation; `motion.dispose()` also stops tracking and removes
its gestures. Component/scope disposal does both automatically. A stopped or
superseded Motion `finished` promise can stay pending; do not use it as a cleanup
barrier or assume a superseded `start()` promise resolves.

## Keyframes, springs and inertia

`useAnimate(root?)` returns Motion's overloaded hybrid `animate`, with scoped
ownership and motion preferences. It accepts DOM elements, element collections,
selectors, objects, numbers, Motion values and sequences. A supplied root scopes
selector strings (including sequence selectors) to its descendants.

```ts
const animate = useAnimate(root)
animate('button', { opacity: [0, 1], y: [16, 0] }, { duration: 0.3, ease: 'easeOut' })
animate(card.value!, { x: 120, rotate: 4 }, { type: 'spring', stiffness: 300, damping: 24 })
animate(x, 200, { type: 'inertia', velocity: 500, min: 0, max: 300 })
```

Motion supports easing functions, durations/delays in seconds, per-property options,
repeat/repeatDelay/repeatType and reverse playback through negative speed. Spring
physics use stiffness, damping, mass and velocity; duration/bounce are available
for duration-based springs. Multi-stop keyframes use tweening where the upstream
spring implementation cannot represent them. Advanced options retain Motion's
public types. `animate.stop()` stops all tracked animations without disposing the
composable; scope disposal prevents further work.

## Timelines and animation controls

There is no second timeline engine:

```ts
const animate = useAnimate(root)
const playback = useMotionControls()
playback.set(animate([
  ['.title', { opacity: [0, 1] }, { duration: 0.25 }],
  ['li', { y: [12, 0], opacity: [0, 1] }, { delay: stagger(0.04), at: '<' }],
]))
playback.pause()
playback.time = 0.1
playback.speed.value = 0.5
playback.play() // resume
```

`state` and `speed` are reactive refs. `time` and `duration` are on-demand seconds,
not frame subscriptions. `animation` exposes the latest engine control; `finished`
reads that animation's completion promise. `stop()` holds current values and is
terminal for the engine animation. `cancel()` reverts. `complete()` applies the end
state. Setting another animation does not stop the former automatically: callers
may intentionally control one track while another continues. Dispose the owning
scope to stop all resources created there. Use the wrapper methods when you need
its reactive state to follow playback; direct raw-control calls cannot notify it.

## Motion values and DOM ownership

`useMotionValue(initial)` returns an official `MotionValue<T>`; `.set`, `.get`,
`.jump`, `.on('change', callback)`, `.getVelocity`, `.stop` and `.destroy` retain their
Motion semantics. Values created by the adapter are destroyed with their scope.
Caller-provided inputs are never destroyed. Dispose subscriptions returned by raw
`.on` yourself, or register them with `onScopeDispose`.

```ts
const progress = useMotionValue(0)
const x = useTransform(progress, [0, 1], [0, 240])
const color = useTransform(progress, [0, 1], ['#2456dd', '#b64ecc'])
const double = useTransform(() => progress.get() * 2)
const smooth = useSpring(progress, { stiffness: 250, damping: 28 })
useMotionStyle(card, { x: smooth, backgroundColor: color })
useMotionAttrs(svg, { 'data-progress': progress })
const readout = useMotionValueState(progress) // explicit frame observation for text
```

`useSpring` accepts numbers, Motion values, refs and getters; options may be
reactive. Under reduced motion it follows immediately. `useTransform` range mapping
supports Motion interpolation options; callback mode discovers Motion value reads.
Vibe refs inside a callback are not Motion dependencies: bridge refs through
`useSpring` or set a Motion value from a watcher.

Style/attribute effects batch writes in Motion's frame loop without Vibe render
updates. `useMotionValueState` deliberately opts into every change, including
multiple explicit sets in one frame. It creates a readonly-typed ref, not a two-way
binding. Separate ownership: never bind the same transform/style/attribute through
both a Vibe template binding and Motion. Use wrapper elements for independent CSS,
layout projection and drag transforms. Layout transforms authored entirely in CSS
may be reset by the upstream projection engine; nest them instead.

## Presence

`usePresence(show, element, options)` returns `isPresent` and `isExiting` refs.
Render **`v-if="presence.isPresent.value"`**, not `v-if="show"`. The controller must
outlive the branch. Initial/animate/exit accept targets or named variants; transition,
appear, restoreFocus and enter/exit completion callbacks are optional.

The controller retains real DOM, state, subscriptions and child components until
exit completion. It makes exiting content inert and hidden from assistive tech,
restoring original attributes on interruption. If focus is inside on exit, it can
return to the element focused at entry. Fast reopening reuses the same DOM and
continues from the current value. Stale completions cannot remove it. External
ancestor removal or scope disposal ends it immediately; an unmounted scope cannot
be brought back by a delayed callback.

For nested exits, retain the outer boundary for at least the duration of required
child exits, or sequence explicit application state. Independent child `v-if`
branches are not automatically registered with their parent. A general automatic
retention boundary requires a new Vibe.js public framework API; see the decision
record. No private removal interception is used.

For a list or wait-style content swap:

```ts
const notifications = usePresenceList(source, {
  key: item => item.id,
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
  mode: 'sync', // 'wait' delays new keys until all exits complete
})
// <li v-for="entry in notifications.items.value" :key="entry.key"
//     :ref="el => notifications.bind(entry.key, el)">...</li>
```

Keys must be stable and unique; duplicates throw. Removed entries retain their
previous neighbours until their exit finishes. Re-adding an exiting key reverses
it without duplication. `appear` defaults to false for initial list items. `layout`
may receive a `useLayoutMotion` handle to animate reflow. Focus moves to an adjacent
surviving focusable item where possible. Applications choose any higher-level
focus destination if no neighbour exists. Use one keyed entry with `mode: 'wait'`
for tab/content replacement; use `sync` for notifications.

## Gestures and dragging

`useHover` provides `isHovered`, `stop`, `onStart` and `onEnd`; Motion filters touch
hover. `usePress` provides `isPressed`, `stop`, `onStart`, `onEnd` and `onCancel`.
Pointer release outside cancels; Enter activation is handled by Motion. Use native
buttons for actions: Motion's fallback tabindex on noninteractive elements does
not supply a button role, click semantics or Space activation. The library does
not replace accessibility behavior. Gesture configuration is otherwise static;
`useDrag` configuration is explicitly reactive.

```ts
const drag = useDrag(card, () => ({
  axis: 'x', constraints: bounds, disabled: locked.value,
  elastic: 0.2, momentum: true, snapToOrigin: false,
  transition: { bounceStiffness: 500, bounceDamping: 30 },
  onEnd: (_event, info) => savePosition(info.offset.x),
}))
```

`constraints` accepts an element/ref/getter or pixel distances `{ left, right, top,
bottom }`. `directionLock`, per-edge elastic values, propagation and constraint
measurement callbacks pass to Motion. `isDragging`, `lockedAxis` and `lastRelease`
expose low-frequency state; live pointer movement is handled by Motion. `onMove`
opts into movement callbacks; `onSettle` runs after release physics. Rebinding
options cancels the current gesture. Reduced motion disables inertia and animated
snapback; direct pointer following remains available. Drag is visual motion, not
data drag-and-drop: sorting, collision detection and transfer belong to VibeDND.
Provide keyboard commands for any meaningful operation demonstrated by dragging.

## Scroll animations and viewport

`useScroll({ container?, target?, axis?, offset? })` exposes `scrollX`, `scrollY`,
`scrollXProgress`, `scrollYProgress` Motion values and `stop()`. Omitted container
means page scrolling. Provided null refs wait until all required elements exist;
replacement disposes the old binding. Feed progress into `useTransform` and
`useMotionStyle` for parallax or progress bars.

`useScrollAnimation(element, keyframes, options)` links animation progress directly
to scroll, using Motion's native timeline support for page scrolling without element options. `transition`
sets the mapping/easing. Reduced motion leaves resting styles instead of linking
spatial motion. Set a readable CSS baseline before enabling the effect. Replaceable targets/custom containers use Motion's shared callback tracker to avoid a native timeline cache retention issue in 14.6.0; the callback seeks the Motion animation directly, without Vibe renders.

`useInView(element, { root?, margin?, amount?, once?, onEnter?, onLeave? })` returns
`isInView` and `stop()`. `amount` accepts a fraction, `'some'` or `'all'`. `once`
retains success for the composable's lifetime even if its target changes; create a
new scope if a new identity should reveal again. `useMotion` has an `inView` target
and `viewport` options for declarative reveal, with hover/press above it. Do not
hide essential information permanently when JavaScript or observation fails.

## Layout animations and shared elements

```ts
const layout = useLayoutMotion(container, {
  transition: { type: 'spring', stiffness: 300, damping: 30 },
  shared: { 'gallery-image': { duration: 0.45 } },
})
await layout.update(() => { items.value = [...items.value].reverse() })
// <div ref="container"><div v-for="item in items" :key="item.id" data-layout>...</div></div>
```

The adapter asks Motion to snapshot before mutation, waits for the mutation and
`nextTick()`, then lets Motion measure and project. `update()` resolves after
animation creation; `isAnimating` tracks the latest update. `stop()` stops current
projection. Grid, flex, position and size changes use the same operation; repeat
calls can interrupt. Missing provided roots commit without measuring the document.
Use `data-layout="position"` or `"size"` for upstream modes where appropriate.

Replacing an element with another bearing the same `data-layout-id` performs a
shared-element transition. IDs must be document-unique across unrelated groups
(e.g. prefix with an application or gallery ID). Scope limits target discovery;
Motion still uses a document projection tree. The adapter has no global registry.
An upstream public per-group identity namespace would be needed for stronger
isolation of reused IDs. Avoid conflicting transforms on measured elements.

## View transitions and routes

`useViewTransition().start(mutate, configure?, options?)` awaits the entire snapshot
transition and the flushed DOM update. A crossfade is supplied by default;
configure receives Motion's builder for `.add(elementOrSelector, newTarget?)`,
`.enter`, `.exit`, `.new`, `.old`, `.layout`, `.crop` and `.group`. `stop()` stops
current owned work. Unsupported browsers and reduced motion still apply mutation.
This is a snapshot animation, not retained interactive content; browser support
and nested grouping vary. Raw `animateLayout` and `animateView` are also exported;
raw calls have Motion's own ownership/preferences, not the adapter's scope policy.

`useRouteTransition(useRouter(), containerRef, options)` wraps navigation through
public `beforeResolve`/`afterEach` hooks. Old content exits before navigation commits;
new content enters after `nextTick`. It removes guards on `stop` or disposal,
unblocks superseded exits and ignores stale route completions. `mode: 'view'`
uses snapshot crossfades when supported, with ordinary-animation fallback. Guard
failure restores the old target. Apps still own route focus management and document
titles; focus the new page heading or main landmark after successful navigation.

## Reduced motion and accessibility

`useReducedMotion()` combines `prefers-reduced-motion` with the nearest config:

```ts
provideMotionConfig(() => ({
  reducedMotion: preference.value, // 'user' (default), 'always', 'never'
  skipAnimations: disabled.value,
  transition: { duration: 0.25 },
}))
// Or app.provide(motionConfigKey, configuration)
```

One media listener is shared and removed after its final scoped subscriber.
`'always'` skips spatial transitions while opacity can still fade; `'never'` is an
explicit override. `skipAnimations` jumps adapter animations to their final state.
Changing preferences affects subsequent calls and reactive motion/scroll/spring
bindings; imperative animations already running retain their chosen options.
For essential state changes, always supply an instant readable alternative. Avoid
flashes and uncontrolled repeat loops. Do not disable form controls, change focus
order, remove click targets or conceal important information merely for an effect.

Presence's inert state prevents interaction during exit; modal focus traps, Escape,
labels and focus return are the modal component's responsibility. The demo uses
Vibecn's native dialog behavior and a native modal dialog for the physics drawer.
Motion is not an accessibility framework.

## Vibecn integration

No mandatory Vibecn or VibeUse runtime dependency. The demo's `components/ui` and
`lib` carry existing Vibecn components as copy-and-own source, including notices.
Motion animates native wrappers/inner content rather than assuming a component ref
is a DOM element: component refs expose only `defineExpose()` values. Tabs keep
Vibecn's keyboard model; Dialog keeps native focus trapping and Escape. Card and
Button examples add motion through native wrappers. Accordion/Sheet source parts
remain available for copying; no new registry item or upstream modification is
required. For animated accordion content, animate a native inner region in the
existing AccordionContent; do not replace details/summary semantics with a div.

## TypeScript API reference

Declarations are generated from source; [src/index.ts](../src/index.ts) lists all
exports. `ElementTarget<E>` is an element, nullable ref or getter. Nested handle
refs require `.value` in Vibe templates. Root setup refs are auto-unwrapped by the
compiler. Avoid blanket `.vibe` module declarations: use Vibe's language-tools
content mapper for real prop/template checking.

| API | Return / ownership |
| --- | --- |
| `useAnimate(root?)` | overloaded callable; `stop()`, `running`; scope-owned |
| `useMotion(target, options)` | controls, gesture refs, isAnimating, start/stop/dispose |
| `useMotionControls()` | state/animation/speed refs; time/duration/finished; playback methods |
| `useMotionValue(initial)` | owned official MotionValue |
| `useSpring(source, options?)` | owned numeric MotionValue |
| `useTransform(fn)` / `(value, input, output, options?)` | owned derived MotionValue |
| `useMotionValueState(value)` | readonly-typed observation ref; does not own input |
| `useMotionStyle(target, values)` / `useMotionAttrs` | cleanup function; no ownership of passed values |
| `useHover` / `usePress` | gesture state ref and stop |
| `useDrag(target, options?)` | isDragging/lockedAxis/lastRelease and stop |
| `useScroll(options?)` | four owned MotionValues and stop |
| `useScrollAnimation(target, keyframes, options?)` | stop |
| `useInView(target, options?)` | isInView and stop |
| `usePresence(show, target, options?)` | isPresent/isExiting; scope-owned retention |
| `usePresenceList(source, options)` | keyed items and bind; scope-owned retention |
| `useLayoutMotion(scope?, options?)` | update, isAnimating, stop |
| `useViewTransition()` | start, isTransitioning, stop |
| `useRouteTransition(router, target, options?)` | stop |
| `useReducedMotion()` | computed preference ref |
| `provideMotionConfig(config)` / `motionConfigKey` | component/app configuration |

Motion exports include layout/view builders, motionValue, mapValue, transformValue,
springValue, spring, inertia, stagger, easing/mixing utilities, and their public
types. Raw exported helpers require explicit lifetime management. `getVelocity`
reads velocity without a framework subscription.

## Troubleshooting

- Exit vanishes immediately: retain `presence.isPresent`, not the original boolean;
  keep the controller outside its `v-if`.
- No animation: verify the template-ref key/type and connected target, motion
  preference and CSS baseline. A component ref is not necessarily an element.
- A transform jumps: remove duplicate Vibe/CSS/Motion property ownership; put CSS
  transforms on an inner element. Do not overwrite layout projection transforms.
- A promise waits forever: stopped/replaced upstream animations may never finish;
  perform cleanup via scope disposal or explicit stop, not `finished` alone.
- Old listeners remain: check raw Motion subscriptions and composables created
  asynchronously without an owning scope. Every adapter API rejects unowned setup.
- Shared elements collide: use unique document-wide IDs even with separate scopes.
- Animation is expensive: prefer opacity/transforms and read the [performance guide](performance.md).

### Layout disposal and manually owned DOM

Vibe.js disposes block scopes before removing their DOM. On disposal the adapter
stops controls, then performs a public, animation-disabled layout reconciliation
on detached measured roots after `nextTick`. This releases Motion's document
projection entries without private unmount calls. Browser tests use WeakRefs and
forced garbage collection to check that removed grid nodes become collectible.
When using an explicit effect scope with manually owned DOM, remove the measured
subtree in the same turn as `scope.stop()`. Stopping the scope while deliberately
keeping that DOM mounted leaves the engine's cached layout identity available on
those live nodes; later manual removal should itself run in `animateLayout`.

# Compatibility research

Verified 2026-10-26 against the local ecosystem source and installed npm artifacts.

## vibe.js 0.1.0

Read `AGENTS.md`, `CONTRACTS.md`, decisions 0001 and 0004, UI `index.ts`,
`component.ts`, reactivity `ref.ts`, `computed.ts`, `effectScope.ts`, runtime
`watch.ts`, `lifecycle.ts`, `templateRef.ts`, `scheduler.ts`, `block.ts`, `for.ts`,
`renderEffect.ts`, router guards, compiler script analysis/code generation, and
existing `.vibe` applications and public testing helpers.

Refs track reads; shallow refs preserve DOM and Motion object identity. Computed
refs are lazy. Watch callbacks run without collecting their own reads. The default
watch queue runs before render effects; post watchers and `nextTick()` observe the
flushed DOM. An immediate watch runs immediately even with `flush: 'post'`, so a
null template ref is essential during setup; Motion batches its first reads.

Template refs become null when their owning block scope stops. Keyed lists keep
item blocks and update item refs. Conditional branches stop their scope and remove
their DOM immediately. Neither before-unmount nor unmounted hooks accept an
asynchronous removal barrier. Public slots render in compiler-managed scopes;
there is no general directive API, public renderer, JSX or dynamic HTML-tag API.
Props and emits are typed compiler macros; nested refs in returned handles require
`.value` in templates. The router exposes removable `beforeResolve`/`afterEach`
hooks. Scope disposal owns watchers, listeners and active animations.

## Motion 14.6.0

`pnpm view motion version` returned **14.6.0**. Exact dependency pin; official npm
artifact, public declarations, exports and implementation were checked. Sources:

- [animate and mini/hybrid](https://motion.dev/docs/animate)
- [Motion values](https://motion.dev/docs/motion-value), [springValue](https://motion.dev/docs/spring-value)
- [drag](https://motion.dev/docs/drag), [hover](https://motion.dev/docs/hover), [press](https://motion.dev/docs/press)
- [scroll](https://motion.dev/docs/scroll), [inView](https://motion.dev/docs/inview)
- [layout](https://motion.dev/docs/layout-animations), [view transitions](https://motion.dev/docs/animate-view)
- [changelog](https://motion.dev/changelog)

The root JavaScript export re-exports `framer-motion/dom`, **not** the React
entry point. React and React DOM are optional upstream peers and are not needed.
Verified exports: `animate`, `stagger`, `spring`, `motionValue`, `mapValue`,
`transformValue`, `attachSpring`, `springValue`, `styleEffect`, `attrEffect`,
`scroll`, `inView`, `hover`, `press`, `drag`, `animateLayout`, `animateView`.
Playback controls expose play, pause, stop, cancel, complete, time, speed, duration,
and finished. `stop()` holds current values and is terminal; `cancel()` reverts.
Stopped/replaced animations can leave `finished` pending. Never await those to
perform essential cleanup. The exported playback `state` is used only to prune
settled tracking entries, not as application state; Motion labels it internal.
This narrow dependency is covered by a pinned-version regression test.

Hybrid supports sequences, values, independent transforms and JS physics; mini
uses the Web Animations API for DOM styles. Both runtimes remain external in our
build. Only root and mini exports are provided: tree shaking already removes
unused gesture/scroll/layout modules, so extra cosmetic entry points add no value.

`animateLayout` arrived in 14.1.0. Its builder awaits async update callbacks despite
its top-level callback declaration allowing `void`; VibeMotion awaits `nextTick`
inside that callback. Builders batch snapshots before DOM mutations. Explicit
container scopes isolate measurement, but Motion's projection engine has a
shared document tree: use unique `data-layout-id` values across applications.
There is no adapter-owned global registry. Arbitrary pre-existing CSS transforms
are not guaranteed by the upstream projection engine; use an inner motion element.

`animateView` is a builder. Its runtime supplies playback controls when snapshots
are ready, although 14.6.0 declares its `.then` callback without an argument. The
adapter validates the public playback shape and awaits `finished` separately,
racing explicit scope cancellation so adapter promises do not hang. `.new()`/`.old()` configure persistent layers; the default does not promise
a page crossfade. Unsupported browsers still commit. View transitions are snapshots
with browser-wide sequencing, not retained interactive DOM.

Core needs modern DOM/RAF and native Web Animations for mini/acceleration; hybrid
has JS fallback paths. `IntersectionObserver`, `ResizeObserver` and Pointer Events
are needed by the respective features. View Transitions are feature detected.
Browser verification in this repository targets Chromium; broader engine support
is not claimed as tested. Vibecn overlays have their own browser requirements.

## Vibecn and VibeUse

Inspected Vibecn's contracts, registry source, CLI installer, site and UI components.
The demo carries copy-and-own Button, Card, Dialog, Sheet, Tabs and Accordion parts
with the original notices and `vibecn.LICENSE`. It does not change the source repo
or add motion dependencies to existing installations. Modal behavior stays with
native dialogs and Vibecn; Motion animates inner content.

VibeUse is functional. Inspected its public exports, scoped-resource helper,
media-query/event/measurement utilities. Adopt the scope-ownership pattern without
a runtime dependency. Motion already owns scroll, gesture and viewport observers;
adding another observer abstraction would duplicate ownership.


## Verified lifecycle findings

Heap tests found that 14.6.0's native scroll timeline cache retains element targets
and custom containers after unlinking. VibeMotion uses the public `scroll(callback)`
tracker for replaceable elements and maps progress to the engine control's time.
Page scrolling without element options keeps native linking. No private cache is
read or modified. This trades native timeline acceleration for deterministic
cleanup on the affected path. Static style/attribute values are wrapped in owned
MotionValues because the underlying effect API expects `.get()`-capable values.

Layout teardown performs an animation-disabled public reconciliation after the DOM
is detached; no private projection unmount helpers are imported. The packed
consumer releases its app reference after unmount (vibe.js's App object deliberately
retains its instance). Its projected DOM is then checked with WeakRefs and browser
GC. Application-owned handles must also be released before testing collectibility.

vibe.js 0.1.0's lazy template-ref cleanup can temporarily retain the most recently
disposed route branch through its reactive dependency queue until another render.
The route heap regression completes a second render and verifies zero retained
nodes from the older branch; it is an accumulation test. Separately, the isolated
packed-consumer test verifies zero projected nodes after app unmount and release
of the caller's App handle. This distinction is important: the adapter does not
reach into Vibe's dependency graph to force collection of framework-owned refs.

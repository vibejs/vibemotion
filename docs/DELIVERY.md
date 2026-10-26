# Engineering delivery

## Engine and architecture

Motion **14.6.0**, pinned as an external runtime dependency, with Vibe.js **0.1.x**
as a peer. Four layers: official vanilla engine, public Vibe lifecycle/reactivity
adapter, declarative composables/explicit retention, optional Vibecn compositions.
ESM + tsdown + declarations/maps, strict TypeScript, pnpm, MIT and upstream notices.
No React/Vue runtime, compiler-private imports, custom directives or removal interception.

## Public APIs

Animation: `useMotion`, `useAnimate`, `useMotionControls`, `useSpring`,
`useMotionValue`, `useTransform`, `useMotionValueState`, `useMotionStyle`,
`useMotionAttrs`, `getVelocity`. Gestures: `useHover`, `usePress`, `useDrag`.
Scroll: `useInView`, `useScroll`, `useScrollAnimation`. Layout/lifecycle:
`useLayoutMotion`, `useViewTransition`, `usePresence`, `usePresenceList`,
`useRouteTransition`, `useReducedMotion`, `provideMotionConfig`, `motionConfigKey`.
Motion layout/view builders, physics/stagger/easing helpers and public types are
also exported. Root and mini entry points are verified. See [the handbook](guide.md).

## Capabilities

Reactive/computed targets and transitions, typed variants, initial/viewport/hover/
press states, keyframes, springs, inertia, timelines, stagger, playback controls,
replacement policies, reduced motion and explicit effect-scope ownership. Visual
drag includes touch, constraints, locking, elasticity, momentum and snap-back.

## Presence, layout and Vibecn

Presence retains real framework blocks until exit completion; generations prevent
stale removal. Keyed lists support sync/wait and interrupted exits. Layout snapshots
wrap reactive mutations and `nextTick`; shared IDs and View Transition fallback
are tested. Disconnected projection nodes are reconciled through public APIs.
Thirteen working `.vibe` demos use existing Vibecn Button/Card/Dialog/Tabs parts,
plus a native modal physics drawer. Core has no Vibecn or VibeUse dependency.

## Verification

`pnpm check` passed: **63 unit/integration tests in 8 files; 39 Chromium checks**,
strict source/type-negative/template checking, lint, format, library/demo builds,
independent packed install/typecheck/build/browser consumption and tree-shaking
assertions. Coverage: **99% lines**, **92.96% branches**,
**96.96% functions**, **98.25% statements**.
No thresholds were lowered or tests skipped. Browser checks include actual touch
input/cancellation, modal keyboard behavior, rapid exits, shared elements, fallback,
stable listener/observer counts and heap collection. The packed consumer's DOM is
collectible after unmount and release of the caller's App handle.

## Bundle measurement

Independent fully minified consumer bundles, bytes including Motion and excluding
Vibe.js. These are consumer entry costs, not the adapter tarball size.

| Import | Raw | gzip | Brotli |
| --- | ---: | ---: | ---: |
| reduced | 890 | 539 | 457 |
| mini | 10,759 | 4,288 | 3,883 |
| hybrid | 68,910 | 24,757 | 22,465 |
| gestures | 120,479 | 39,169 | 35,057 |
| full | 170,964 | 56,986 | 50,505 |

## Performance measurement

Recorded **2026-10-26T05:31:10.506Z**, Chromium **156.0.8078.4**, **Apple M4**,
darwin/arm64, 1280×900. One warm-up plus
three recorded runs per workload. Setup column is the median scenario-specific
setup/write/preparation metric; p95 is the median of three per-run p95 intervals.
Layout samples include reordering; gestures dispatch simultaneous pointer events.
No FPS or input-latency guarantee is inferred.

| Workload | Median setup ms | Median p95 interval ms | Worst interval ms | Intervals >20 ms |
| --- | ---: | ---: | ---: | ---: |
| animate:100 | 3.7 | 16.7 | 16.8 | 0 |
| animate:500 | 11.6 | 16.7 | 16.8 | 0 |
| stagger:500 | 12.9 | 16.7 | 16.8 | 0 |
| retarget:100 | 2.0 | 16.7 | 16.8 | 0 |
| interrupt:100 | 47.5 | 16.7 | 16.8 | 0 |
| layout:100 | 667.1 | 16.8 | 16.8 | 0 |
| gestures:50 | 111.8 | 16.8 | 16.8 | 0 |

Raw evidence: [verification](../reports/verification.json),
[browser cases](../reports/browser.json), [package](../reports/package.json),
[bundle sizes](../reports/bundle-size.json), [benchmark samples](../reports/benchmarks.json).

## Known limits

- No automatic Motion/MotionPresence/Group components: Vibe.js has no public child
  retention/removal barrier or generic native-tag renderer. Use explicit composables.
- Nested exits require explicit outer retention; ancestor scope disposal takes precedence.
- Shared layout IDs must be document-unique. CSS transforms should be nested away
  from projected elements. Manually owned layout DOM should be removed with its scope.
- Motion 14.6 retains native element scroll timelines; replaceable targets use its
  shared callback tracker. Page scrolling can use native timelines.
- Vibe.js can transiently retain its last disposed route branch until another render;
  accumulation checks distinguish this from adapter-owned leaked nodes.
- Motion 14.6's view builder declaration omits the actual ready-controls argument;
  the adapter validates the public playback shape and separately awaits completion.
- Only Chromium is verified here. View Transition support/grouping varies by browser.
  Vibe template checking currently uses the pinned TypeScript 7.1 content-mapper nightly.
- Raw Motion exports keep upstream ownership semantics. Resource-owning composables
  require an active component/effect scope; stopped upstream promises can stay pending.

## Delivery

Core revision when verified: `16cb85f`. Focused commits are merged into local `main`;
`git log --oneline main` lists delivery history. Commit identities use GitHub's
`noreply` address; verified source trees are unchanged and original history is
retained locally. The authorized GitHub destination is
[vibejs/vibemotion](https://github.com/vibejs/vibemotion). No npm publication or
deployment was performed. Start the demo with `pnpm dev`.

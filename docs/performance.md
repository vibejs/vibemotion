# Performance and verification

Motion owns the frame loop, interpolation and browser animation selection. The
adapter uses Vibe.js watchers for target/configuration changes and low-frequency
control state. Motion values do not become Vibe refs unless observation is requested.
Use opacity/transforms and native page scroll timelines where available; width/height,
filters and many simultaneous layers can still cost layout or paint.

`pnpm size` builds independent production consumer entry points and measures raw,
gzip and Brotli bytes, including Motion but excluding the Vibe.js peer runtime.
It checks that mini excludes the hybrid sequence/JS animation engine, a preference
import excludes Motion, and no React/Vue runtime enters any output. The generated
[report](../reports/bundle-size.json) describes its units. Published adapter chunks
remain external to both runtimes; do not confuse their size with full consumer size.

`pnpm bench` builds the real `.vibe` app and runs Chromium at 1280×900. One warm-up
and three measured runs cover 100/500 elements, stagger (500), per-frame reactive
retargeting (100), repeated spring interruption (100), five layout reorders (100),
and simultaneous hover/press event workloads (50). Layout frame sampling includes
each reorder; gesture workloads dispatch pointer events and do not measure human
input latency. Reports record OS/CPU/browser/time, frame intervals, p95/max and
intervals over 20 ms. `setupMs` is synchronous call time for animations, accumulated
write time for reactive workloads, and total preparation/reorder time for the
respective workloads. These metrics must not be compared as identical operations.

The [benchmark report](../reports/benchmarks.json) is an observation from headless
Chromium on the recorded machine, not a promised FPS, cross-browser benchmark or
production performance guarantee. Running tests or other processes simultaneously
can affect it. No numbers are estimated or invented.

`pnpm check` also performs strict type/template checking, lint/format, unit and real
SFC integration coverage, real-browser interaction tests and an isolated install of
the packed package. The consumer has its own dependency graph and compiles/runs
hybrid/mini animations and gestures without a React or Vue installation. Browser
resource instrumentation measures listeners/observers across route mount cycles;
it is test-only and is never shipped in the adapter.

Known limits: Chromium is the verified browser engine, projection requires explicit
mutations wrapped by `layout.update`, automatic nested presence is unavailable,
View Transition snapshots have browser-wide sequencing, CSS transforms should be
nested away from projected elements, and shared IDs must be unique across the
document. Long lists should avoid animating expensive layout/paint properties.

For Motion 14.6.0, element-relative/custom-container scroll animations use its shared
callback tracker, because its native timeline cache retains those elements after
unlinking. This is a deliberate correctness tradeoff. See the research record.

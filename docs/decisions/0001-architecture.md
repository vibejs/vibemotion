# 0001: Public composables and explicit presence

Status: accepted.

A. Motion 14.6.0 owns interpolation, springs, inertia, animation timelines,
DOM writes, gesture detection, scroll tracking and layout projection.
B. The Vibe adapter owns reactive configuration, ref replacement, scope cleanup,
completion generations and optional reactive observation.
C. `useMotion` layers typed targets/variants with viewport, hover and press.
`usePresence` and `usePresenceList` retain actual framework blocks through public
reactive state. No clone serves as an interactive exiting component.
D. Optional copy-and-own Vibecn examples live only in the demo application.

Do not export speculative Motion/MotionPresence/MotionGroup/MotionLayoutGroup
components. Static `.vibe` wrappers are possible, but would impose an extra DOM
container and duplicate composable configuration. Generic child interception,
dynamic native tags and automatic removal barriers are unavailable. An automatic
presence component would need a public framework retention boundary that awaits
registered child exits before disposing the block scope and removing its nodes.

Presence must be created in a scope outside the branch it retains. List identities
are unique and stable. Independent nested exits require retaining the outer
boundary until all required child exits finish; ancestor scope disposal always
wins. No automatic nested registration is promised.

All resource-owning APIs require component setup or an active public effect scope.
Outside setup, use `effectScope().run(...)` and call `scope.stop()` when finished.
Fail early rather than silently allocating unowned listeners. Explicit `stop()`
methods stop their resource; scope disposal remains the ultimate ownership boundary.

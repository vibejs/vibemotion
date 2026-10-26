# Contributing

Use pnpm 12.14.0 and Node ^24.15.0 or >=26. Install dependencies, then install the
Playwright Chromium browser with `pnpm exec playwright install chromium` if needed.

`pnpm check` runs formatting, strict TypeScript (including real .vibe templates and
type-negative fixtures), lint, coverage, build, Chromium interactions, an isolated
packed consumer and bundle assertions. `pnpm bench` runs one warm-up and three
samples per scenario and writes the actual hardware/browser context. Do not compare
results from different machines as though they were equivalent.

Keep runtime dependencies external. Use only public vibe.js APIs; generated
compiler output may import its own ABI, but adapter source must never do so.
Resource-owning APIs must have a deterministic scope owner and test replacement,
disposal and late completion. Browser tests must exercise the real Motion engine;
unit mocks are appropriate for lifecycle races and browser-protocol boundaries.
Never lower thresholds or ignore failing tests to ship a change.

Commit focused Conventional Commits on a feature branch. Add a changeset for
user-visible changes. Do not add AI attribution, Co-Authored-By, Signed-off-by or
Generated-by trailers. No publishing, pushing, deployment or remote repository
creation is part of ordinary development.

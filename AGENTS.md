# VibeMotion

Use public vibe.js APIs and Motion's vanilla JavaScript entry points. Keep framework
and engine dependencies external. Resource allocation requires an active effect
scope. Preserve upstream source notices in the demo.

Run `pnpm check` before merging local branches. Run `pnpm bench` when changing
benchmark workloads or reporting new measurements. Do not lower test thresholds.

English only in code, documentation, messages and commits. Releases go through
changesets and .github/workflows/release.yml; add a changeset for every user-visible
change. Never publish, push, deploy or create remote resources without an explicit
release request.

Commit messages use Conventional Commits. Never add Co-Authored-By, Signed-off-by,
Generated-by or any AI attribution trailer. Commit subjects and bodies contain only
the human-authored message.

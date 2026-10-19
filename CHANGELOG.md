# Changelog

## Unreleased

- Smoother dragging with batched starfield drawing, preserving pixel counts, independent twinkle phases, flow, glow and character motion. Hidden, offscreen and reduced-motion controls stop the shared animation loop.

## 0.1.4 — 2026-10-17

### Visuals and interaction

- Flowing pixel-nebula rail with seamless repeated strips and independent star twinkles.
- Continuous star animation at rest, including the highest effort level, without keeping the thumb's animation loop running.
- Stable full-rail pixel geometry across effort levels; sparse lower levels and progressively richer higher levels. Actual `off`/`none` values keep the rail clear.
- One twinkle in four instead of all of them. Measured at 4x CPU throttle over a 90-step drag: style recalc per drag fell from ~3.2 s to ~0.9 s and p95 frame time from 66.7 ms to 16.7 ms, with idle recalc down 4x. Opacity is not composited on 2-3 px elements, so the cost scales with the number of animated pixels; promoting them or swapping in a transform both measured worse.
- Five or more tiers stagger across two rows on the rail instead of wrapping into a 3-column grid that detached each label from the position it describes. Long labels ellipsise within a per-label width budget derived from the tier count, so the panel keeps a fixed width.
- Original three-expression chibi whale-girl thumb with immediate pointer tracking, smoothed lean, and damped settling.
- Animation pause/resume for hidden or offscreen controls, reduced-motion support, and light/dark theme inheritance.

### Native integration

- DeepSeek Harness `^0.2.0-rc.2` engine and optional peer compatibility declaration, audited against official commit `639ed015397290b3745d163aafe02ffee4aa3f84` and bounded to the 0.2 line.
- Shared native model directory, advertised effort IDs and names, and full `ModelDirectory.select` submission; no synthetic levels.
- Host-authoritative state, interrupted-gesture cancellation, submission-time state checks, safe retries, and keyboard interaction.
- Native lazy CommonJS client factory, Cordis-managed styles, embedded character artwork, and installable bundle patch.

### Verification and documentation

- 67 passing regression tests covering capability/selection behavior, rc.2 compatibility, UI interaction, and motion.
- TypeScript validation, production build, and simulated native-loader checks.
- Read-only manifest of 20 audited upstream file hashes.
- English and Simplified Chinese READMEs, profile-specific GUI/CLI installation instructions, and release notes.

### Known limits

- Real DSH profile and Desktop installation were verified against Desktop `0.2.1-rc.2` on 2026-10-19: the bundle installed, enabled, and registered its `conversation.input.left` occupant. Host versions outside `^0.2.0-rc.2` are not covered by this declaration.
- Native selection also attempts to persist a new-session default asynchronously. Session-level success does not guarantee that persistence succeeded.
- npm publication is tracked separately from this changelog; use registry installation only once the exact package version is available.

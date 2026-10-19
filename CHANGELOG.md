# Changelog

## 0.1.4 — 2026-10-17

### Visuals and interaction

- Flowing pixel-nebula rail with seamless repeated strips and independent star twinkles.
- Continuous star animation at rest, including the highest effort level, without keeping the thumb's animation loop running.
- Stable full-rail pixel geometry across effort levels; sparse lower levels and progressively richer higher levels. Actual `off`/`none` values keep the rail clear.
- Original three-expression chibi whale-girl thumb with immediate pointer tracking, smoothed lean, and damped settling.
- Animation pause/resume for hidden or offscreen controls, reduced-motion support, and light/dark theme inheritance.

### Native integration

- DeepSeek Harness `^0.2.0-rc.2` engine and optional peer compatibility declaration, audited against official commit `639ed015397290b3745d163aafe02ffee4aa3f84` and bounded to the 0.2 line.
- Shared native model directory, advertised effort IDs and names, and full `ModelDirectory.select` submission; no synthetic levels.
- Host-authoritative state, interrupted-gesture cancellation, submission-time state checks, safe retries, and keyboard interaction.
- Native lazy CommonJS client factory, Cordis-managed styles, embedded character artwork, and installable bundle patch.

### Verification and documentation

- 65 passing regression tests covering capability/selection behavior, rc.2 compatibility, UI interaction, and motion.
- TypeScript validation, production build, and simulated native-loader checks.
- Read-only manifest of 20 audited upstream file hashes.
- English and Simplified Chinese READMEs, profile-specific GUI/CLI installation instructions, and release notes.

### Known limits

- Real DSH profile and Desktop installation were verified against Desktop `0.2.1-rc.2` on 2026-10-19: the bundle installed, enabled, and registered its `conversation.input.left` occupant. Host versions outside `^0.2.0-rc.2` are not covered by this declaration.
- Native selection also attempts to persist a new-session default asynchronously. Session-level success does not guarantee that persistence succeeded.
- npm publication is tracked separately from this changelog; use registry installation only once the exact package version is available.

# AGENTS.md — Invasion Wind Tunnel

This file provides guidance for AI coding agents working in this repository.

## Project overview

**Invasion Wind Tunnel** is a deployable, front-end-only, multi-scenario laboratory for qualitative cancer-cell collective invasion experiments. v2.0 upgrades the v1 single narrow-gap demo into a modular, multi-scenario system.

- Zero runtime dependencies, static-deploy ready (Cloudflare Pages / GitHub Pages / Netlify / Vercel).
- Node.js >= 20 (`.node-version` pins 22.16.0), ESM modules throughout.

### Scientific boundaries (must not be violated)

- This project is a **mechanism-exploration, teaching, and qualitative hypothesis-comparison tool**. It is NOT for clinical prediction, patient stratification, or treatment decisions. No output, metric, or copy may imply clinical use.
- The model is a 2D soft-particle approximation, **not a Cellular Potts Model**. If Artistoo is integrated later, differences and licensing must be documented separately.

## Repository layout

- Repository root = project root (`package.json`, `src/`, `scripts/`, `public/`, `presets/`, `tests/`, `docs/`, `.github/`).
- `delivery/`: delivery archive (`baseline/`, `release/`, `reports/`, `diffs/`, `checksums.txt`). **Not part of the build.** When release artifacts change, regenerate the zips and refresh `delivery/checksums.txt` and `delivery/reports/`.
- `docs/`: architecture, model, scenarios, validation, deployment, migration, and scientific-scope documentation.

## Architecture boundaries

- `src/simulation/scenarios/catalog.js`: defines scenario names, defaults, initial geometry, perturbations, and metric copy only. No integrator, no DOM.
- `src/simulation/config.js`: all inputs must pass through `makeConfig()` (sanitization, clamping, v1 migration, version fields, config/scenario hashes).
- `src/simulation/engine.js`: the only position/velocity update engine. Direction layers only produce driving forces; they never rewrite positions directly.
- `src/simulation/outcomes.js`: scenario-aware outcome classification; the same generic metrics can map to different teaching modes per scenario.
- `src/simulation/batch.js` / `batch-worker.js`: dedicated batch Worker runs real multi-seed simulations, isolated from the live simulation Worker, with point-level progress.
- `src/simulation/worker-runtime.js`: fixed `1/30` simulation-second timestep; caps steps per tick to avoid catch-up frame storms.
- `src/app.js`: UI, replay, export, and batch-map interaction.
- `src/service-worker.js`: PWA offline caching.

## Versioning and reproducibility (keep in sync on changes)

- `src/simulation/versions.js`: `APP_VERSION`, `MODEL_VERSION`, `CONFIG_SCHEMA_VERSION`, `RESULT_SCHEMA_VERSION`, `SCENARIO_CATALOG_VERSION`.
- Frame stride (currently 11) and result JSON `schemaVersion` (currently 2) changes are breaking format changes: bump versions and record them in `docs/MIGRATION_V1_TO_V2.md` and `README.md`.
- Every result must record: app/model/scenario/schema versions, random seed, config hash, scenario hash, event timeline, and scientific-boundary statement.
- Randomness must stay deterministic: seed clamped to `1..2^32-1`; same model version + config + seed yields identical frames and events. Do not introduce global non-deterministic sources.

## Standard commands (must verify after changes)

```bash
npm ci
npm run validate     # static structure, assets, syntax, offline inventory
npm run scan         # sensitive files and credential patterns
npm test             # 22 automated tests
npm run build        # build into dist/
npm run smoke        # local HTTP smoke (8 routes)
npm run check        # all of the above
```

- When adding scenarios, personas, config fields, Worker behavior, or export formats, **must** add corresponding tests in `tests/` covering determinism and edge cases.
- Do not claim completion until `npm run check` is green.

## Scenarios and personas

- Scenarios (`scenarios/catalog.js`): `narrow-gap`, `budding`, `leader-follower`, `unjamming`; each has a version, defaults, perturbation set, and metric copy.
- Personas (`profiles.js`): `jam`, `collective`, `budding`, `escape`; combinable across scenarios; keep `LEGACY_PRESET_ALIASES` for v1 migration.
- A new scenario must define geometry, targets, perturbations, metrics, outcome rules, and tests — without duplicating the whole simulator.

## Deployment contract

- Cloudflare Pages (zero config): Framework preset None, Build command `npm run build`, Build output directory `dist`, root directory = repo root, Node version from `.node-version`.
- Security headers come from `public/_headers` (copied to `dist/_headers`); `netlify.toml` and `vercel.json` are for their respective platforms.
- Do not add long-lived Cache Rules: HTML, Service Worker, and manifest are already `no-cache`; other assets use platform defaults and ETags.

## Working conventions

- Make small, incremental changes; preserve module boundaries; avoid gratuitous large refactors.
- Read the relevant module and its tests before editing; follow existing style (ESM, `node:` imports, `Object.freeze` constants).
- On Windows/encoding issues, prefer Python or Node scripts for file operations; do not recommend changing user system configuration.
- Docs and deliverables are primarily in Chinese; code identifiers stay in English.
- Each completed change should pass `npm run check`, and commit messages should note version/format impact.

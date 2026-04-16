# Project Audit

Date: 2026-04-15

## Scope

This audit covered the full local repository, current source layout, exported
model/runtime path, walkthrough/product state, visualization bridge, checked-in
artifacts, automated verification, and both headless and headed Playwright
browser runs.

## Executive Summary

`200loc` is a focused, well-tested single-page teaching app. Its strengths are
clarity of product scope, a reducer-driven walkthrough, a CPU reference runtime
that is easy to reason about, and a more serious browser test surface than most
projects of similar size.

The main risks are not broad code quality problems; they are concentrated in a
small set of sharp edges:

1. The optional WebGPU path still does not expose the same trace contract as the
   CPU reference path.
2. The most lifecycle-sensitive rendering code is intentionally excluded from
   counted coverage, so the 100% coverage number needs to be interpreted
   carefully.
3. Browser verification is strong but Chromium-only and still tied to the Vite
   dev server rather than a preview/release-style server.
4. The production bundle is larger than Vite's default warning threshold.

One user-visible issue was fixed during this audit:

1. Glossary compact-mode behavior used a narrower breakpoint than the actual
   mobile layout, creating a small responsive mismatch in the 961-1023px range.

## Repository Reality Check

The current source tree is broader than the old README implied.

- The app shell lives in `src/App.tsx`.
- Walkthrough state and product copy live in `src/walkthrough/`.
- Runtime and bundle handling live in `src/model/`.
- The abstract scene frame/layout lives in `src/viz/llmViz/`.
- The WebGL bridge and renderer program glue live in `src/viz/microViz/`.
- A substantial vendored renderer snapshot lives in `src/vendor/llmVizOriginal/`.
- Unit and integration tests live in `src/test/`.
- Browser tests live in `tests/e2e/`.

Tracked generated/runtime-support artifacts include:

- `public/assets/microgpt-model.json`
- `public/assets/microgpt.py`
- `public/fonts/*`
- `public/native.wasm`
- `public/gpt-nano-sort-*`
- `src/vendor/llmVizOriginal/llm/wasm/main-native`

Tracked `dist/`, `coverage/`, and `test-results/` outputs were not present in
git at audit time.

## Architecture Inventory

### App Shell

- `src/App.tsx` bootstraps the bundle and canonical source fetches, creates the
  tokenizer/runtime, normalizes prefix input, advances traces/phases, and
  composes story, code, and scene surfaces.
- `src/walkthrough/reducer.ts` is the central UI state machine.
- `src/walkthrough/phases.ts` is effectively the product spec: 34 steps across
  14 groups, with copy, glossary links, code ranges, and visualization focus.

### Model + Runtime

- `src/model/loadBundle.ts` validates a strict bundle contract: one layer, four
  heads, 16-dim embeddings, 16-token block size, and required weight shapes.
- `src/model/cpuEngine.ts` is the authoritative inference implementation and the
  canonical source of `TokenStepTrace`.
- `src/model/runtime.ts` chooses CPU vs WebGPU, runs startup parity checks, and
  falls back to CPU on initialization or parity failures.
- `src/model/webgpuEngine.ts` mirrors the math path, but its returned trace is
  intentionally thinner than the CPU trace.

### Visualization

- `src/components/ArchitectureScene.tsx` chooses between the WebGL micro-viz
  path and the SVG fallback projection.
- `src/viz/llmViz/frame.ts` translates runtime traces into scene-facing tensor
  overlays and context windows.
- `src/viz/microViz/LayerView.tsx`, `program.ts`, and `bridge.ts` carry the
  hardest lifecycle work: canvas setup, resize, hover publication, camera
  retargeting, texture uploads, and vendor renderer coordination.
- `src/vendor/llmVizOriginal/` is the highest-complexity area by volume and
  remains a maintenance hotspot.

## Verification Performed

All of the following commands passed during this audit after the breakpoint fix:

- `npm test`
- `npx vitest run --coverage`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run test:e2e:headed`

Results:

- Vitest: 22 test files, 149 tests passed.
- Counted coverage: 100% statements, 100% branches, 100% functions, 100% lines.
- Playwright: 17 tests passed headless.
- Playwright headed Chromium: 17 tests passed.

Build note:

- `npm run build` succeeded, but Vite warned that the main minified bundle is
  above 500 kB (`dist/assets/index-*.js` was ~531.75 kB before gzip).

Interpretation note:

- The 100% coverage result applies to the counted source set only.
- `vitest.config.ts` excludes `src/vendor/**`, `src/viz/microViz/**`, and
  `src/viz/llmViz/renderer.ts`, which are some of the most lifecycle-sensitive
  rendering paths.

## Findings

### Fixed During Audit

1. Responsive glossary behavior was narrower than the mobile layout contract.
   - Root cause: `src/components/Controls.tsx` switched to compact inline
     glossary behavior at `max-width: 960px`, while `src/App.css` switched the
     layout to its mobile/tabbed form at `max-width: 1023px`.
   - Fix: align the glossary compact query to `max-width: 1023px`.
   - Regression coverage: added a component test asserting the shared compact
     breakpoint contract.

2. Repository documentation lagged behind the current codebase.
   - The README still described directories and verification scope in terms that
     were incomplete for the current tree.
   - Fix: rewrote `README.md` to reflect the actual structure, exporter
     behavior, and current verification commands.

### Active Risks

1. The WebGPU trace contract is still partial relative to the CPU path.
   - `WebGpuEngine.step()` does not return the same intermediate tensors or the
     same semantic richness as the CPU engine.
   - This is currently masked because the UI renders the CPU trace, but it is
     still the main correctness risk in backend parity.

2. Inference-time GPU drift protection is weaker than startup protection.
   - Startup parity checks are always performed when WebGPU initializes.
   - Per-step drift fallback in `runtime.ts` is gated behind `import.meta.env.DEV`.

3. Verification breadth is good, but selective.
   - Playwright is Chromium-only.
   - Playwright targets the Vite dev server, not `vite preview`.
   - Counted coverage excludes the renderer-heavy code paths.

4. The production bundle is large for a single-page app.
   - This is not a correctness bug, but it is a real performance and shipping
     signal worth tracking.

5. The exporter is mostly offline, not purely offline.
   - `scripts/export_microgpt_bundle.py` fetches the names corpus from GitHub if
     `input.txt` is missing.
   - The script also rewrites the reference trace fixture, not just the model
     bundle.

6. Legacy artifacts remain in the repo.
   - The live path uses the microgpt assets, and tests assert that.
   - The vendored snapshot still includes legacy nano-gpt-related files and
     wasm support assets that are not central to the current product path.

## Recommended Next Steps

1. Harden the WebGPU contract.
   - Decide whether GPU traces should stay intentionally partial or converge
     toward CPU trace semantics.
   - Add parity assertions for token/position/session semantics, not just
     logits/probabilities.

2. Add release-style browser verification.
   - Run at least one Playwright pass against `vite preview`.
   - Add a non-Chromium smoke path if cross-browser support matters.

3. Keep renderer complexity contained.
   - Continue isolating camera and render-bridge policies behind smaller helpers
     with direct tests.
   - Treat `src/viz/microViz/*` and the vendored renderer as the highest-risk
     maintenance area.

4. Address the bundle-size warning deliberately.
   - Confirm whether the current single-page delivery budget is acceptable.
   - If not, investigate chunking or lazy-loading opportunities that do not
     undermine the educational experience.

## Bottom Line

The project is materially strong: coherent architecture, explicit product
constraints, a reliable CPU reference path, and meaningful browser coverage. The
important remaining work is targeted hardening around WebGPU and renderer
maintenance, not broad cleanup. The current tree is in a good state after the
responsive glossary fix and documentation refresh.

# Project Audit

Date: 2026-04-15

## Scope

This audit covered the full local repository, the TypeScript/React app surface, the model/runtime stack, the visualization bridge, automated verification, and interactive browser checks with Playwright.

## Executive Summary

`200loc` is a focused single-page educational app that explains one-token-at-a-time inference for a tiny exported `microgpt.py` checkpoint. The codebase is disciplined: the walkthrough is declarative, the runtime has a clear CPU reference path, and the browser verification surface is stronger than most projects of this size.

The main quality risks are concentrated in two places:

1. The optional WebGPU path still has contract gaps relative to the CPU reference path.
2. The visualization/camera bridge is correct in broad strokes but sensitive to timing, phase retargeting, and renderer lifecycle details.

One user-visible issue was found and fixed during this audit: headed Chromium could reset a manual scene zoom when the walkthrough advanced across phases inside the same camera pose family.

## Architecture Inventory

### App Shell

- `src/App.tsx` owns bootstrapping, prefix normalization, runtime hydration, generation advancement, playback, and composition of the code/story/scene surfaces.
- `src/walkthrough/reducer.ts` keeps the walkthrough deterministic and reducer-driven.
- `src/walkthrough/phases.ts` is the main product spec: it defines the 34-step narrative, active code ranges, visual focus targets, and explanatory copy.

### Model + Runtime

- `src/model/loadBundle.ts` validates the exported model bundle and hydrates weight arrays into `Float32Array`s.
- `src/model/cpuEngine.ts` is the authoritative reference implementation for inference and trace production.
- `src/model/runtime.ts` hides backend selection, performs startup parity checks, and falls back to CPU when WebGPU is unavailable or drifts.
- `src/model/webgpuEngine.ts` mirrors inference on GPU, but its trace contract is intentionally thinner than the CPU trace and remains a long-term correctness hotspot.

### Visualization

- `src/viz/llmViz/frame.ts` maps runtime traces plus phase metadata into a scene-specific `VizFrame`.
- `src/components/ArchitectureScene.tsx` selects between the WebGL micro-viz path and the SVG fallback projection.
- `src/viz/microViz/LayerView.tsx` and `src/viz/microViz/program.ts` bridge React state into the reused vendor renderer, handle camera updates, hover focus, resize, and event-surface coordination.
- `src/vendor/llmVizOriginal/` is the largest complexity center by volume and lifecycle sensitivity.

### Verification Surface

- Unit/integration tests cover the runtime, walkthrough reducer, app flow, component behavior, scene fallback, frame/layout helpers, and the micro-viz bridge.
- Playwright coverage is broad for the app size: desktop flow, mobile tabs, hover/pin interactions, autoplay, drag/zoom, remount stability, and long mixed sessions are all exercised.

## Verification Performed

Commands run successfully in this audit:

- `npm test`
- `npx vitest run --coverage`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run test:e2e:headed -- --grep "desktop walkthrough"`

Coverage result from the counted source set:

- Statements: 96.4%
- Branches: 91.09%
- Functions: 99.08%
- Lines: 96.26%

Interactive findings from Playwright:

- The standard browser suite passed.
- A headed Chromium run exposed a real camera regression around manual zoom persistence.
- That regression was fixed and then revalidated in both headless and headed Playwright runs.

## Findings

### Fixed During Audit

1. Same-pose phase advances could override a user-applied manual zoom in headed Chromium.
   - Root cause: the camera retarget path reapplied the guided phase target, including its default zoom, even when the user had already manually zoomed within the same pose family.
   - Fix: preserve the current zoom level when retargeting inside the same pose family while still allowing center/orientation updates.
   - Files changed:
     - `src/viz/microViz/program.ts`
     - `src/test/microViz.test.ts`

### Active Risks

1. The WebGPU path still does not expose the same richness of trace data as the CPU path.
   - Current parity checks focus on logits/probabilities, which is useful but narrower than a full step-contract check.

2. Verification is strong but still selective.
   - Coverage excludes `src/vendor/**`, `src/viz/microViz/**`, and `src/viz/llmViz/renderer.ts` from counted coverage totals.
   - Playwright runs Chromium only and targets the dev server, not a built preview server.

3. The renderer bridge remains a maintenance hotspot.
   - `LayerView` and `program.ts` carry a lot of lifecycle responsibility at once: bootstrapping, resize, hover publishing, camera transitions, movement, and vendor integration.

## Recommended Plan

1. Harden the WebGPU contract.
   - Decide whether GPU traces are intentionally partial or should converge with CPU traces.
   - Add parity tests for token/position/session semantics, not just logits/probs.
   - Fail fast on shape/length mismatches in parity helpers.

2. Strengthen release-style verification.
   - Add a Playwright pass against `vite preview`.
   - Add at least one non-Chromium smoke path if cross-browser support matters.
   - Keep the headed manual-zoom regression in the browser suite.

3. Reduce camera/renderer coupling.
   - Keep camera retarget policy explicit and separately unit-tested.
   - Continue moving fragile renderer coordination behind small testable helpers.

4. Tighten auditability of runtime assumptions.
   - Document bundle constraints and supported model topology more explicitly.
   - Extend validation to cover numeric sanity and unexpected weight payloads where useful.

## Bottom Line

The project is materially stronger than its size suggests: the architecture is coherent, the walkthrough product spec is encoded directly in source, and the automated/browser verification surface is already serious. The most important remaining work is not broad refactoring; it is targeted hardening of the WebGPU contract and continued containment of renderer/camera complexity.

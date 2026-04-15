# 200loc

`200loc` is a single-page walkthrough of Karpathy's `microgpt.py`.

It keeps one promise: show how a tiny GPT performs next-token inference, step by step, in the browser, without hiding the model behind a framework-heavy stack or a backend service.

## What It Does

- Shows the canonical `microgpt.py` source beside a synchronized walkthrough.
- Explains inference across 34 guided steps grouped into 14 stages.
- Runs a tiny char-level names model client-side.
- Uses native WebGPU when available, with a CPU reference path for fallback and correctness.
- Highlights the exact Python lines that correspond to the active visualization state.

## Product Constraints

- Single page only.
- No router.
- No backend.
- No training simulation in the browser.
- No model picker or arbitrary checkpoint loader.
- One guided scene, not a dashboard of separate panels.

## Stack

- Vite
- React 19
- TypeScript
- Plain CSS
- Native WebGPU API
- Vitest + Testing Library
- Playwright

## Project Layout

- `src/App.tsx`: app shell, bootstrap, walkthrough orchestration
- `src/model/`: tokenizer, CPU engine, WebGPU engine, runtime coordination
- `src/walkthrough/`: phase definitions and reducer-driven UI state
- `src/components/`: code viewer, controls, tabs, and the architecture scene shell
- `src/viz/microViz/`: microgpt scene layout, bridge, and program logic
- `src/vendor/llmVizOriginal/`: Brendan Bycroft render, camera, and interaction code reused by the scene
- `public/assets/microgpt.py`: canonical reference source shown in the UI
- `public/assets/microgpt-model.json`: exported tiny checkpoint used in the browser
- `scripts/export_microgpt_bundle.py`: offline export path for rebuilding the model bundle

## Local Development

Requirements:

- Node 20+
- Python 3 for the export script

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

React Grab is enabled in development. Once the app is running, hover any element and press:

- `Cmd+C` on macOS
- `Ctrl+C` on Windows/Linux

to copy the grabbed UI context from the page.

Rebuild the exported model bundle:

```bash
npm run generate:model
```

Run checks:

```bash
npm test
npx vitest run --coverage
npm run lint
npm run build
```

## Model Notes

- The runtime uses the tiny char-level names setup from `microgpt.py`.
- `input.txt` is the local names corpus snapshot used by the export script and by the canonical Python source.
- Training is offline only. The shipped site performs inference and walkthrough rendering in the browser.

## Verification

Use the standard checks to verify the current tree:

```bash
npm test
npx vitest run --coverage
npm run lint
npm run build
```

That suite covers tokenizer behavior, math helpers, CPU inference, WebGPU runtime behavior, reducer transitions, component rendering, the single-page app flow, and the Playwright browser checks.

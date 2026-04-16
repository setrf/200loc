# 200loc

`200loc` is a single-page walkthrough of Karpathy's `microgpt.py`.

The app shows one tiny GPT inference step at a time in the browser, with the
canonical Python source, explanatory copy, and a synchronized architecture
scene all moving together.

## What It Does

- Shows the shipped `microgpt.py` source beside the active walkthrough step.
- Explains inference across 34 guided steps grouped into 14 stages.
- Runs a tiny char-level names model entirely client-side.
- Prefers WebGPU when it initializes cleanly and falls back to the CPU reference
  path otherwise.
- Maps code, story, and scene focus back to the same inference moment.

## Product Constraints

- Single page only.
- No router.
- No backend.
- No in-browser training controls.
- No model picker or arbitrary checkpoint loader.
- One guided scene, not a dashboard of disconnected panels.

## Stack

- Vite 8
- React 19
- TypeScript
- Plain CSS
- Native WebGPU API
- Vitest + Testing Library
- Playwright

## Repository Layout

- `src/App.tsx`: bootstrap, runtime hydration, phase/trace orchestration, top-level layout
- `src/components/`: code viewer, glossary controls, tabs, and scene host
- `src/hooks/useAutoplay.ts`: walkthrough autoplay timer
- `src/model/`: bundle loading, tokenizer, CPU engine, WebGPU engine, runtime coordination
- `src/walkthrough/`: glossary, reducer, and the 34-step walkthrough spec
- `src/viz/llmViz/`: frame building, abstract layout, and fallback projection helpers
- `src/viz/microViz/`: WebGL bridge, scene layout, textures, and renderer program glue
- `src/vendor/llmVizOriginal/`: vendored renderer/camera/interaction code reused by the scene
- `src/test/`: unit and integration tests
- `tests/e2e/`: Playwright browser coverage
- `public/assets/microgpt.py`: canonical source shown in the UI
- `public/assets/microgpt-model.json`: exported browser bundle
- `scripts/export_microgpt_bundle.py`: training/export script for the browser bundle and trace fixture

## Local Development

Requirements:

- Node 20+
- Python 3

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

React Grab is enabled in development. Once the app is running, hover an element
and press:

- `Cmd+C` on macOS
- `Ctrl+C` on Windows/Linux

to copy the grabbed UI context from the page.

## Regenerating the Model Bundle

Rebuild the exported model bundle and the reference trace fixture:

```bash
npm run generate:model
```

Notes:

- The script writes `public/assets/microgpt-model.json`.
- The script also rewrites `src/test/fixtures/expected-step-em.json`.
- If `input.txt` is missing, the script fetches the names corpus snapshot from
  Karpathy's `makemore` repository.

## Verification

Run the standard checks:

```bash
npm test
npx vitest run --coverage
npm run lint
npm run build
npm run test:e2e
```

For a headed browser pass:

```bash
npm run test:e2e:headed
```

The automated suite covers tokenizer behavior, bundle validation, CPU and
WebGPU runtime behavior, walkthrough reducer transitions, component rendering,
scene bridging, and full browser flows across desktop and mobile layouts.

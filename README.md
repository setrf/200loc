# 200loc

`200loc` is a single-page walkthrough of the tiny `microgpt.py` program shipped
with this repo.

The app shows one GPT inference step at a time in the browser, with the Python
source, explanation, and model view kept in sync.

## Run

Requirements:

- Node 20+
- Python 3

```bash
npm install
npm run dev
```

For a production preview:

```bash
npm run build
npm run preview
```

## Model Bundle

Rebuild the exported model bundle and reference trace fixture with:

```bash
npm run generate:model
```

This updates `public/assets/microgpt-model.json` and
`src/test/fixtures/expected-step-em.json`. If `input.txt` is missing, the
script fetches the names corpus snapshot from Andrej Karpathy's `makemore`
repository.

## Verify

```bash
npm test
npm run test:coverage
npm run lint
npm run build
npm run test:e2e
```

Use `npm run test:e2e:headed` for a headed browser pass.

## Credits

`200loc` pays respect to [Andrej Karpathy](https://github.com/karpathy) for
`microgpt` and to Brendan Bycroft for
[LLM Visualization](https://bbycroft.net/llm), which inspired the model viewer.

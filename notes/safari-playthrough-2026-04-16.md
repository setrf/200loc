# Safari Playthrough Notes

Date: 2026-04-16
Browser: Safari on macOS
App URL: `http://127.0.0.1:5173/`

## What I exercised

- First-visit intro landing screen
- Intro glossary popup (`token`)
- Skip-to-lab path and guided lab tour
- Desktop walkthrough controls (`Next`, `Play`, `Reset`)
- Code/story synchronization during step changes
- Safari reload behavior for the architecture scene

## What looked good

- The intro screen feels clean and centered on Safari.
- Glossary popups opened and closed as expected in the intro.
- Skip-to-lab worked and the lab tour copy remained readable.
- The desktop walkthrough layout held together well in Safari once loaded.
- Chromium Playwright coverage is already strong, and `npm run test:e2e` passed locally with 23/23 tests green.

## Main finding

- Safari can take long enough to produce the first WebGL scene frame that the architecture panel looks blank after reload.
- The walkthrough itself still loads: code, story, and controls are present, and step changes continue to work.
- The render eventually appears, but the blank panel is confusing because it looks broken rather than busy.

## Change made

- The scene now stays in the explicit `loading scene…` state until the first WebGL frame actually renders.
- This avoids showing a misleading empty scene panel during Safari's slow first paint path.
- The font atlas loader now fetches `fonts/font-def.json` as a normal same-origin JSON request instead of using `mode: 'no-cors'`, which was a fragile fit for Safari.

## Follow-up worth doing

- Add true WebKit coverage to Playwright once WebKit browsers are installed locally.
- Re-run the Safari reload path after the font-loader change once Computer Use access is available again, to confirm whether the same-origin fetch fix resolves the delayed first frame outright.

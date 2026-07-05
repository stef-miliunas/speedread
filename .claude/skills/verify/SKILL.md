---
name: verify
description: How to build, launch, and drive SpeedRead to verify changes at the UI surface.
---

# Verifying SpeedRead

Static PWA, no backend. The surface is the browser UI at the dev server.

## Launch

```bash
npm run dev        # http://localhost:5173/  (StrictMode double-mount active)
npm run build && npm run preview   # http://localhost:4173/  production semantics
```

## Drive (headless Chrome via puppeteer-core)

No Playwright in this env; install `puppeteer-core` in the scratchpad and point it
at the installed Chrome:

```js
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
});
```

Each launch gets a fresh temp profile — IndexedDB/localStorage do NOT persist
across browser launches. Test persistence with `page.reload()` inside one session.

## Flows worth driving

- Seed a book: on the empty library, click the button containing "Try a sample"
  (Alice ch. I, ~765 words). Reader route is `#/read/<uuid>`.
- Playback: click `.stage` to play/pause; `.is-playing` class on `.reader-screen`.
- Current word: `.word` textContent; progress: `.reader-pct`.
- Zoom overlay: `button[aria-label="Zoom out to text"]` → `.zoom-overlay`;
  words are `.zoom-word[data-i]`, current chunk `.is-current`; click a span to jump.
- Settings without UI: write `localStorage['speedread:settings']`
  (`{wpm, fontScale, theme: 'dark'|'light', chunk: 1|2}`) then reload.
- Saved position: IndexedDB db `speedread`, store `books`, field `position`
  (word index). Verify persistence on the **preview** server or same-session
  reload; dev StrictMode used to clobber it (guarded in Reader's `persist`).

## Gotchas

- Claude-in-Chrome extension may not be connected; puppeteer-core fallback above.
- Verify both dev and preview when persistence is involved: StrictMode
  double-mount makes dev behave differently from prod.

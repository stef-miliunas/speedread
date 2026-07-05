# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # tsc --noEmit (type check) + vite build → dist/
npm run preview    # serve the production build locally
npm run icons      # regenerate PWA icons via scripts/gen-icons.mjs
```

There is no test suite or linter; `npm run build` is the correctness check (it type-checks before building).

## What this is

A speed-reading PWA (RSVP: one word at a time at a fixed point). Vite + React + TypeScript, fully static and offline — no server, no external requests. Deployed to GitHub Pages: every push to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to the `gh-pages` branch. `vite.config.ts` sets `base: './'` so the build works at any Pages sub-path — keep it relative.

## Architecture

The app is ~10 source files. `src/main.tsx` mounts `App`, which switches between four screens (`src/screens/`) based on a route from the minimal hash router in `src/lib/router.ts`. Hash routing is deliberate: no 404 rewrites needed on GitHub Pages, and every screen is a real history entry so the iOS back-swipe works. Don't add a router library.

**State and storage** live in two places:
- Settings (wpm, theme, font scale, chunk size) — `localStorage`, exposed app-wide via React context in `src/lib/settings.tsx`. The provider also stamps `data-theme` on `<html>` and syncs the `theme-color` meta tag.
- Books — IndexedDB via hand-rolled promise wrappers in `src/lib/db.ts`. Metadata (`books` store) and full text (`texts` store) are deliberately separate so listing the library never loads book bodies. Reading position is saved per book as a **word index** (not chunk index), so it survives changing the words-per-flash setting.

**RSVP core** (`src/lib/rsvp.ts`) is pure functions: `tokenize`, `chunkify`, `orpIndex` (Spritz-style optimal recognition point, offset past leading punctuation), `chunkDelay` (punctuation holds ~2.1×/~1.5×, long-word bonus), and `rampSpeed` (resume 20% slower, ramp back over ~10 words). `Reader.tsx` drives playback with a self-rescheduling `setTimeout` loop that reads the current index from a ref (not state), so wpm/chunk changes mid-read just re-time the current word.

**EPUB import** (`src/lib/epub.ts`) is entirely client-side: `fflate` unzips, then container.xml → OPF spine → per-chapter `DOMParser` text extraction. Only text is kept; no rendering, images, or styles.

**PWA layer**: `public/sw.js` is a hand-written service worker — network-first for navigations (so deploys show up promptly), cache-first for hashed build assets. `scripts/gen-icons.mjs` renders the icon artwork per-pixel and encodes PNGs by hand specifically to keep image tooling out of the dependency tree — don't replace it with sharp/canvas.

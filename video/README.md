# Product videos

Captioned product videos for the Etsy listing and the website. They are made with [Remotion](https://www.remotion.dev) (React → video) from footage of the real app. Nothing is mocked up.

This folder has its own `package.json`. Remotion is **not** a dependency of the app.

| Output | Size | Length |
|---|---|---|
| `listing/video-1-one-number.mp4` (Etsy video A) | 1920×1080 | 15.0 s |
| `listing/video-2-import.mp4` (Etsy video B) | 1920×1080 | 15.0 s |
| `video/out/product-60s.mp4` (website) | 1920×1080 | 67.0 s |
| `video/out/product-60s-vertical.mp4` (social) | 1080×1350 | 67.0 s |

All four are H.264, 30 fps, CRF 18, yuv420p (bt709), with `+faststart` and no audio track.

## Run it

```sh
cd video
npm install
npm run capture   # Playwright: real app → public/capture/ (fails if any number on screen is not the expected one)
npm run render    # Remotion → the four videos (or: npm run render -- OneNumber Import)
npm run check     # lengths, codec, captions ≥ 1.8 s, cursor never jumps, blank frames, 2 fps sheets in out/check/
npm run studio    # optional: preview and scrub in the browser
```

- **Requirements:** `capture` and `render` use the main repo's `node_modules` (the dev server, `ffmpeg-static`, the listing helpers in `scripts/listing/`). Run `npm install` at the repo root first.
- **Fixed date:** The capture runs the app on the fixed listing scene day (Tue 13 Oct 2026) with example data, so the numbers are always the same.
- **Video B's statement:** Video B imports its own small statement (3 already imported, 5 matching, 2 new). After the import the bank balance is $1,143.17 and Today goes from $380 to $346.

## Files

- `capture.ts`: stills (3× scale) and clips (2× scale, 30 fps) of the real app, plus `scenes.json` (where things are on screen and the numbers shown).
- `src/timeline.ts`: every scene and caption, in seconds. Both the compositions and `check.ts` read it.
- `src/motion.ts`: the phone layout and cursor paths, shared with `check.ts`.
- `src/components.tsx`: the building blocks (captions, phone frame, cursor, cards, end card).
- `src/scenes.tsx`: the scenes, with videos A, B and the product video assembled from them.
- `voiceover.md`: a script for a later voice-over of the product video. The videos themselves are captions only.

## Style rules

- **Brand:** navy `#1F2A44`, mint `#7CC8B5`, cream `#F7F3EA`. Captions use Fraunces, small text uses Inter.
- **Motion:** spring easing, 250–400 ms transitions, 1.07–1.3× zooms, a slow background gradient.
- **Captions:** 1–6 words, each fully on screen at least 1.8 s. End cards appear at 13.2 s (not 13.5 s), so the end-card text also gets its full 1.8 s.
- **Content:** No real brand names, no reviews, no medical claims. "ADHD-friendly" is the only ADHD wording.

## Licence

Remotion is not MIT. It has its own licence: free for individuals, for companies with up to 3 employees, and for non-profits. Larger companies need a paid company licence. See <https://www.remotion.dev/license>. This project qualifies for the free licence.

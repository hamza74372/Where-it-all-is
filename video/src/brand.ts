// Brand for the videos: the app's colours and fonts (copied into public/ by capture.ts).
import { continueRender, delayRender, staticFile } from 'remotion';

export const NAVY = '#1F2A44';
export const NAVY_2 = '#32466B';
export const MINT = '#7CC8B5';
export const CREAM = '#F7F3EA';
export const MUTED_ON_NAVY = '#D7DBE5';
export const INK_MUTED = '#596175';
export const SURFACE = '#FFFDF8';

export const DISPLAY = "'Fraunces', Georgia, serif";
export const BODY = "'Inter', system-ui, sans-serif";

/** Load the fonts once before the first frame renders. */
let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('fonts');
  const faces = [
    new FontFace('Fraunces', `url(${staticFile('fonts/fraunces.woff2')})`, { weight: '100 900' }),
    new FontFace('Inter', `url(${staticFile('fonts/inter-400.woff2')})`, { weight: '400' }),
    new FontFace('Inter', `url(${staticFile('fonts/inter-600.woff2')})`, { weight: '600' }),
    new FontFace('Inter', `url(${staticFile('fonts/inter-700.woff2')})`, { weight: '700' }),
  ];
  Promise.all(faces.map((f) => f.load()))
    .then((all) => all.forEach((f) => (document.fonts as unknown as { add(face: FontFace): void }).add(f)))
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}

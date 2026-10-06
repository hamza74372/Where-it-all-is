// Save a file the way that works on each device.
// iPhone Safari (especially from the home screen) doesn't do ordinary downloads reliably, so on
// touch devices we use the share sheet (Save to Files, AirDrop, WhatsApp…) when it can share
// files, and fall back to a normal download everywhere else.

export interface SaveableFile {
  name: string;
  text: string;
  type: string;
}

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

function prefersShareSheet(): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return coarse || ios;
}

export async function saveFile(f: SaveableFile): Promise<SaveOutcome> {
  const blob = new Blob([f.text], { type: f.type });
  if (prefersShareSheet() && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    const file = new File([blob], f.name, { type: f.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: f.name });
        return 'shared';
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
        // Any other failure: fall through to a plain download.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}

/** Read a picked file as text. */
export function readFileText(file: File): Promise<string> {
  return file.text();
}

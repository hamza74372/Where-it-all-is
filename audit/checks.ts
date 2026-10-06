// In-page layout/accessibility checks shared by the audit walkthrough and its self-test.

export interface Finding {
  smallText: Array<{ text: string; px: number; where: string }>;
  smallTargets: Array<{ label: string; w: number; h: number }>;
  clipped: Array<{ text: string; why: string }>;
  overlaps: Array<{ a: string; b: string }>;
  lowContrast: Array<{ text: string; ratio: number; need: number }>;
  horizontalScroll: boolean;
  theme: string;
  bg: string;
}

/** Runs inside the page. Audits the open dialog if there is one, otherwise the page. */
export function auditPage(): Finding {
  const vw = window.innerWidth;
  const dialog = document.querySelector('dialog[open]');
  const root: Element = dialog ?? document.body;
  const isVisible = (el: Element) => {
    // Content of a closed <details> isn't shown (WebKit still reports boxes for it).
    const closed = el.closest('details:not([open])');
    if (closed && !el.closest('summary')) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const name = (el: Element) =>
    (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || el.tagName)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 48);
  const where = (el: Element) => {
    const c = el.closest('[class]');
    return `${el.tagName.toLowerCase()}${c ? '.' + String(c.className).split(' ')[0] : ''}`;
  };
  const inFixed = (el: Element) => !!el.closest('.bottom-nav, .toast-region');

  const out: Finding = {
    smallText: [], smallTargets: [], clipped: [], overlaps: [], lowContrast: [],
    horizontalScroll: document.documentElement.scrollWidth > vw + 1,
    theme: document.documentElement.dataset.theme ?? '',
    bg: getComputedStyle(document.body).backgroundColor,
  };

  // Text under 14px (elements that directly contain visible text).
  const seenText = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!own || !isVisible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 14) {
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const key = `${where(el)}|${px}`;
      if (!seenText.has(key)) {
        seenText.add(key);
        out.smallText.push({ text, px, where: where(el) });
      }
    }
  }
  if (!dialog) {
    for (const el of Array.from(document.querySelectorAll('.bottom-nav span'))) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 14 && !seenText.has(`nav|${px}`)) {
        seenText.add(`nav|${px}`);
        out.smallText.push({ text: (el.textContent ?? '').trim(), px, where: 'bottom-nav label' });
      }
    }
  }

  // Tap targets under 44×44.
  const targets = Array.from(
    (dialog ?? document).querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=switch], [role=radio]'),
  ).filter(isVisible);
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue; // visually hidden (e.g. a file input inside its label)
    if (r.width < 44 - 0.5 || r.height < 44 - 0.5) {
      out.smallTargets.push({ label: name(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // Clipped text / content off the side of the screen.
  for (const el of Array.from(root.querySelectorAll('*')).filter(isVisible)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
    // Screen-reader-only text is deliberately 1px and clipped.
    if (r.width <= 1 || r.height <= 1 || (cs.clip && cs.clip !== 'auto')) continue;
    if (hasText && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && el.clientWidth > 0) {
      out.clipped.push({ text: name(el), why: `content ${el.scrollWidth}px in a ${el.clientWidth}px box` });
    }
    if (hasText && (r.right > vw + 1 || r.left < -1)) {
      out.clipped.push({ text: name(el), why: `runs off screen (${Math.round(r.left)}–${Math.round(r.right)} of ${vw}px)` });
    }
  }

  // WCAG AA contrast for visible text (4.5:1, or 3:1 for large text). Disabled controls are exempt.
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]: number[]) => {
    const ch = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  const bgOf = (el: Element | null): number[] => {
    for (let e = el; e; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor);
      if (c.length >= 3 && (c.length < 4 || c[3] > 0.5)) return c.slice(0, 3);
    }
    return rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3);
  };
  const seenContrast = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('*')).filter(isVisible)) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!own || el.closest('[disabled], [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const fg = rgb(cs.color).slice(0, 3);
    const L1 = lum(fg), L2 = lum(bgOf(el));
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize);
    const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (ratio < need && !seenContrast.has(text)) {
      seenContrast.add(text);
      out.lowContrast.push({ text, ratio: Math.round(ratio * 100) / 100, need });
    }
  }

  // Overlaps between separate pieces of content (not nested, not the fixed nav/toast).
  const boxes = Array.from(
    root.querySelectorAll('button, input, select, h1, h2, h3, p, label, .mono, .row-sub, .badge, .chip, .big-number'),
  )
    .filter((el) => isVisible(el) && !inFixed(el))
    .map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 2 && h > 2) out.overlaps.push({ a: name(a.el), b: name(b.el) });
    }
  }
  return out;
}

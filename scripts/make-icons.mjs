// Placeholder app icons (the ◎ mark on the accent colour), written to the paths in
// site.config.json — only if those files don't exist yet, so a real logo is never overwritten.
// Run: node scripts/make-icons.mjs   (also runs as part of `npm run build:site`)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Square RGBA PNG: accent background, white ring + dot. `scale` shrinks the mark (maskable safe zone). */
function icon(size, scale = 1) {
  const [br, bg, bb] = hex(cfg.themeColor);
  const c = size / 2;
  const ringR = size * 0.27 * scale;
  const ringW = size * 0.075 * scale;
  const dotR = size * 0.085 * scale;
  const SS = 4; // 4×4 supersampling for smooth edges
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const d = Math.hypot(x + (sx + 0.5) / SS - c, y + (sy + 0.5) / SS - c);
          if (Math.abs(d - ringR) <= ringW / 2 || d <= dotR) cover++;
        }
      const a = cover / (SS * SS);
      const o = 1 + x * 4;
      row[o] = Math.round(br + (255 - br) * a);
      row[o + 1] = Math.round(bg + (255 - bg) * a);
      row[o + 2] = Math.round(bb + (255 - bb) * a);
      row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const wanted = [
  [cfg.icons.icon192, 192, 1],
  [cfg.icons.icon512, 512, 1],
  [cfg.icons.maskable512, 512, 0.8], // Android crops maskable icons to a circle: keep the mark inside 80%
];
for (const [file, size, scale] of wanted) {
  if (fs.existsSync(file)) {
    console.log(`kept   ${file} (already exists)`);
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, icon(size, scale));
  console.log(`made   ${file} (placeholder ${size}×${size})`);
}

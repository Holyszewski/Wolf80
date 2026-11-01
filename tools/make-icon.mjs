// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Draws the application icon from coloured rectangles (no image files, no packages).
//   node tools/make-icon.mjs   -> assets/icon/wolf80.ico, assets/icon/wolf80-256.png
//                                 + docs/img/icon.png (preview sheet)
// A close-up of the display and the keyboard on the yellow case (chosen by the maintainer on
// 2026-10-19 over a variant with the whole case, whose details were lost at small sizes).
// Every size is laid out separately and snapped to whole pixels, so 16 px stays crisp.
// The colours are the tokens of src/ui/style.css.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const C = {
  caseFill: '#f2c230',
  bezel: '#140908', segOn: '#ff4a36', segOff: '#2a100e',
  frame: '#c8c9c4', frameEdge: '#a9aaa4', keyHex: '#2f3236', keyFn: '#3f8fd2',
};
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];

// ---------- raster ----------
function canvas(w, h) { return { w, h, px: new Uint8ClampedArray(w * h * 4) }; }
function blend(cv, x, y, [r, g, b, a], cover) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h || cover <= 0) return;
  const i = (y * cv.w + x) * 4, sa = (a / 255) * cover, da = cv.px[i + 3] / 255, oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  cv.px[i] = (r * sa + cv.px[i] * da * (1 - sa)) / oa;
  cv.px[i + 1] = (g * sa + cv.px[i + 1] * da * (1 - sa)) / oa;
  cv.px[i + 2] = (b * sa + cv.px[i + 2] * da * (1 - sa)) / oa;
  cv.px[i + 3] = oa * 255;
}
// Rounded rectangle with integer edges; only the corners are antialiased (4 x 4 samples).
function rect(cv, x0, y0, x1, y1, color, radius = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const c = typeof color === 'string' ? hex(color) : color;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let cover = 1;
    if (radius > 0) {
      const cx = x < x0 + radius ? x0 + radius : x >= x1 - radius ? x1 - radius : null;
      const cy = y < y0 + radius ? y0 + radius : y >= y1 - radius ? y1 - radius : null;
      if (cx !== null && cy !== null) {
        let n = 0;
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
          const dx = x + (sx + 0.5) / 4 - cx, dy = y + (sy + 0.5) / 4 - cy;
          if (dx * dx + dy * dy <= radius * radius) n++;
        }
        cover = n / 16;
      }
    }
    blend(cv, x, y, c, cover);
  }
}

// ---------- parts ----------
// Seven-segment glyphs as the PMI-80 monitor shows them (segments a..g).
const GLYPH = { '-': 'g', 8: 'abcdefg', 0: 'abcdef' };
function digit(cv, x0, y0, x1, y1, t, lit) {
  const ym = Math.round((y0 + y1 - t) / 2);
  const seg = {
    a: [x0, y0, x1, y0 + t], g: [x0, ym, x1, ym + t], d: [x0, y1 - t, x1, y1],
    f: [x0, y0, x0 + t, ym + t], b: [x1 - t, y0, x1, ym + t],
    e: [x0, ym, x0 + t, y1], c: [x1 - t, ym, x1, y1],
  };
  for (const [k, r] of Object.entries(seg)) if (!lit.includes(k)) rect(cv, ...r, C.segOff);
  for (const [k, r] of Object.entries(seg)) if (lit.includes(k)) rect(cv, ...r, C.segOn);
}

// The display: a dark window with red digits; below 32 px only a red stroke.
function display(cv, x0, y0, x1, y1, s, text) {
  rect(cv, x0, y0, x1, y1, C.bezel, s >= 64 ? Math.round(s / 64) : 0);
  const w = x1 - x0, h = y1 - y0;
  if (s < 32) {
    const t = Math.max(1, Math.round(h / 3));
    rect(cv, x0 + 1, y0 + Math.round((h - t) / 2), x1 - 1, y0 + Math.round((h - t) / 2) + t, C.segOn);
    return;
  }
  const n = text.length, pad = Math.max(1, Math.round(h * 0.18));
  const t = Math.max(1, Math.round(h * 0.11));
  const gap = Math.max(1, Math.round(t * 1.4));
  const dh = h - 2 * pad;
  const dw = Math.min(Math.floor((w - 2 * pad - (n - 1) * gap) / n), Math.max(3, Math.round(dh * 0.62)));
  const used = n * dw + (n - 1) * gap;
  let x = x0 + Math.round((w - used) / 2);
  for (const ch of text) { digit(cv, x, y0 + pad, x + dw, y0 + pad + dh, t, GLYPH[ch]); x += dw + gap; }
}

// The keyboard: grey frame, 5 x 5 keys; the top row and the right column are blue.
function keyboard(cv, x0, y0, x1, y1, s) {
  rect(cv, x0, y0, x1, y1, C.frame, s >= 48 ? Math.round(s / 48) : 0);
  if (s >= 128) rect(cv, x0, y1 - Math.round(s / 128), x1, y1, C.frameEdge);
  const rows = s < 24 ? 2 : s < 32 ? 3 : 5, cols = s < 24 ? 3 : 5;
  const m = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) * 0.08));
  const cw = (x1 - x0 - m) / cols, rh = (y1 - y0 - m) / rows;
  const gap = Math.max(1, Math.round(Math.min(cw, rh) * 0.28));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const kx0 = Math.round(x0 + m + i * cw), ky0 = Math.round(y0 + m + j * rh);
    const kx1 = Math.round(x0 + m + (i + 1) * cw) - gap, ky1 = Math.round(y0 + m + (j + 1) * rh) - gap;
    const fn = j === 0 || i === cols - 1;
    rect(cv, kx0, ky0, kx1, ky1, fn ? C.keyFn : C.keyHex, s >= 128 ? Math.round(s / 128) : 0);
  }
}

// ---------- icon ----------
function drawIcon(s) {
  const cv = canvas(s, s);
  const u = s / 32;
  const r = s >= 32 ? Math.round(4 * u) : s >= 20 ? 2 : 1;
  rect(cv, 0, 0, s, s, C.caseFill, r);
  const m = Math.max(1, Math.round(2.5 * u));
  const ix0 = m, ix1 = s - m;
  let y = m;
  const dh = Math.max(4, Math.round(10 * u));
  display(cv, ix0, y, ix1, y + dh, s, s >= 48 ? '-80' : '80');
  y += dh + Math.max(1, Math.round(1.5 * u));
  keyboard(cv, ix0, y, ix1, s - m, s);
  return cv;
}

// ---------- PNG / ICO ----------
function png(cv) {
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(cv.h * (cv.w * 4 + 1));
  for (let y = 0; y < cv.h; y++) Buffer.from(cv.px.buffer, y * cv.w * 4, cv.w * 4).copy(raw, y * (cv.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(images) {   // PNG-compressed entries (Windows Vista and later)
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let off = head.length;
  images.forEach(({ s, data }, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += data.length;
  });
  return Buffer.concat([head, ...images.map(i => i.data)]);
}

// ---------- preview sheet: the icon at 256, 64, 48, 32, 24, 16 (small ones also 4x enlarged) on dark and light ----------
function sheet(icons, backgrounds = ['#14161b', '#f2f2f2']) {
  const show = [256, 64, 48, 32, 24, 16], zoom = [1, 1, 1, 4, 4, 4];
  const rowH = 300, pad = 22;
  const W = pad + show.reduce((a, s, i) => a + s * zoom[i] + pad, 0), H = icons.length * backgrounds.length * rowH;
  const cv = canvas(W, H);
  icons.forEach((bySize, vi) => backgrounds.forEach((bg, bi) => {
    const y0 = (vi * backgrounds.length + bi) * rowH;
    rect(cv, 0, y0, W, y0 + rowH, bg);
    let x = pad;
    show.forEach((s, i) => {
      const src = bySize[s], z = zoom[i], top = y0 + Math.round((rowH - s * z) / 2);
      for (let yy = 0; yy < s * z; yy++) for (let xx = 0; xx < s * z; xx++) {
        const j = (Math.floor(yy / z) * s + Math.floor(xx / z)) * 4;
        blend(cv, x + xx, top + yy, [src.px[j], src.px[j + 1], src.px[j + 2], 255], src.px[j + 3] / 255);
      }
      x += s * z + pad;
    });
  }));
  return cv;
}

fs.mkdirSync(path.join(root, 'assets', 'icon'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs', 'img'), { recursive: true });
const bySize = {};
const images = SIZES.map(s => { const cv = drawIcon(s); bySize[s] = cv; return { s, data: png(cv) }; });
fs.writeFileSync(path.join(root, 'assets', 'icon', 'wolf80.ico'), ico(images));
fs.writeFileSync(path.join(root, 'assets', 'icon', 'wolf80-256.png'), images.at(-1).data);
console.log(`assets/icon/wolf80.ico (${SIZES.join(', ')} px)`);
fs.writeFileSync(path.join(root, 'docs', 'img', 'icon.png'), png(sheet([bySize])));
console.log('docs/img/icon.png');

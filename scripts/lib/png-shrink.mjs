/**
 * png-shrink.mjs — re-encode a truecolour PNG as an indexed one, smaller.
 *
 * The social cards come out of `sips` as 8-bit RGBA at around 200 KB each.
 * That's absurd for eight flat panels of dark grey and one amber line, and
 * this project has no image tooling to fix it with — so this does the job
 * with node:zlib and nothing else:
 *
 *   1. inflate the IDAT stream and undo the per-row filters
 *   2. median-cut the colours down to a 256-entry palette (a flat design
 *      only spends colours on antialiasing, so the loss is invisible)
 *   3. write it back as colour type 3 at maximum deflate, dropping the EXIF
 *      and XMP chunks macOS attaches on the way out
 *
 * Typically ~8x smaller. Only handles what sips produces: 8-bit RGB/RGBA,
 * non-interlaced. Anything else throws rather than quietly mangling a file.
 */
import { inflateSync, deflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ------------------------------------------------------------------ CRC32 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

/* ----------------------------------------------------------------- decode */
function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");

  let ihdr = null;
  const idat = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (!ihdr) throw new Error("no IHDR");

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, ctype, , , interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  if (depth !== 8 || (ctype !== 2 && ctype !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${depth}, type ${ctype}, interlace ${interlace})`);
  }

  const bpp = ctype === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);

  // Undo the five PNG row filters, each relative to the row above (`up`)
  // and the pixel to the left (`left`).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad row filter ${filter}`);
      row[i] = v & 0xff;
    }
  }
  return { width, height, bpp, pixels: out };
}

/* --------------------------------------------------------------- quantise */
/**
 * Median cut. Split the colour box with the widest channel spread, at the
 * median by weight, until there are `max` boxes; every colour in a box
 * collapses to that box's weighted average.
 *
 * Weight is sqrt(pixel count), not the count itself. On these cards a raw
 * count hands almost every palette entry to the panel gradient — which
 * covers most of the image — and averages the amber trace, a few thousand
 * pixels, into the grey around it. Compressing the weights keeps the rare
 * saturated colours visible to the split without letting single stray
 * pixels drag a box off centre.
 */
function quantise(counts, max) {
  const colours = [...counts.keys()];
  const chan = (c, i) => (c >>> (24 - i * 8)) & 0xff;
  const weights = new Map([...counts].map(([c, n]) => [c, Math.sqrt(n)]));

  let boxes = [colours];
  while (boxes.length < max) {
    let best = -1, bestSpread = 0, bestChan = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (let i = 0; i < 4; i++) {
        let lo = 255, hi = 0;
        for (const c of box) { const v = chan(c, i); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bestSpread) { bestSpread = hi - lo; best = bi; bestChan = i; }
      }
    });
    if (best < 0) break; // every box is a single colour already

    const box = boxes[best];
    box.sort((a, b) => chan(a, bestChan) - chan(b, bestChan));
    const total = box.reduce((n, c) => n + weights.get(c), 0);
    let acc = 0, split = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += weights.get(box[i]);
      if (acc >= total / 2) { split = i + 1; break; }
    }
    boxes.splice(best, 1, box.slice(0, split), box.slice(split));
  }

  // One palette entry per box, and an exact colour -> index map (every
  // colour in the image is in exactly one box, so no nearest-neighbour
  // search is ever needed at encode time).
  const palette = [];
  const index = new Map();
  for (const box of boxes) {
    let n = 0, r = 0, g = 0, b = 0, a = 0;
    for (const c of box) {
      const w = weights.get(c);
      n += w;
      r += chan(c, 0) * w; g += chan(c, 1) * w;
      b += chan(c, 2) * w; a += chan(c, 3) * w;
    }
    const i = palette.length;
    palette.push([Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)]);
    for (const c of box) index.set(c, i);
  }
  return { palette, index };
}

/* ----------------------------------------------------------------- encode */
export function shrink(buf) {
  const { width, height, bpp, pixels } = decode(buf);

  // Pack each pixel into one integer so colours can be counted in a Map.
  const packed = new Uint32Array(width * height);
  const counts = new Map();
  for (let i = 0, p = 0; i < packed.length; i++, p += bpp) {
    const a = bpp === 4 ? pixels[p + 3] : 255;
    const c = ((pixels[p] << 24) | (pixels[p + 1] << 16) | (pixels[p + 2] << 8) | a) >>> 0;
    packed[i] = c;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const { palette, index } = quantise(counts, 256);

  // Indexed rows compress best unfiltered — neighbouring indices carry no
  // arithmetic relationship, so the filters only add noise.
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) {
      raw[y * (width + 1) + 1 + x] = index.get(packed[y * width + x]);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 3;  // colour type: indexed
  const chunks = [
    SIG,
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from(palette.flatMap(([r, g, b]) => [r, g, b]))),
  ];
  // tRNS is only needed if something is actually transparent.
  if (palette.some(([, , , a]) => a < 255)) {
    chunks.push(chunk("tRNS", Buffer.from(palette.map(([, , , a]) => a))));
  }
  chunks.push(
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  );
  return Buffer.concat(chunks);
}

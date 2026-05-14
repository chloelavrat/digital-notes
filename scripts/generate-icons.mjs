/**
 * Generates public/apple-touch-icon.png (180×180)
 * No external dependencies — only Node.js built-ins.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// ── PNG encoder ──────────────────────────────────────────────────

const crc32 = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return (buf) => {
    let c = -1
    for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(type, data) {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const cc = Buffer.alloc(4)
  cc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, cc])
}

function encodePNG(W, H, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type: RGB

  const stride = 1 + W * 3
  const rows = Buffer.alloc(H * stride)
  for (let y = 0; y < H; y++) {
    rows[y * stride] = 0 // filter: None
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 3
      const d = y * stride + 1 + x * 3
      rows[d] = rgb[s]; rows[d + 1] = rgb[s + 1]; rows[d + 2] = rgb[s + 2]
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Icon drawing ─────────────────────────────────────────────────

const W = 180, H = 180
const rgb = Buffer.alloc(W * H * 3) // black by default

const px = (x, y, r = 255, g = 255, b = 255) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const i = (y * W + x) * 3
  rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b
}

const fillRect = (x0, y0, x1, y1, r = 255, g = 255, b = 255) => {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
      px(x, y, r, g, b)
}

// Bresenham circle quadrant for rounded corners
const roundCorner = (cx, cy, radius, quadrant, r = 255, g = 255, b = 255) => {
  let x = 0, y = radius, d = 1 - radius
  while (x <= y) {
    const pts = [
      [cx + x, cy - y], [cx + y, cy - x], // Q1
      [cx - x, cy - y], [cx - y, cy - x], // Q2
      [cx - x, cy + y], [cx - y, cy + x], // Q3
      [cx + x, cy + y], [cx + y, cy + x], // Q4
    ]
    const q = { 1: [0, 1], 2: [2, 3], 3: [4, 5], 4: [6, 7] }[quadrant]
    q.forEach(i => px(pts[i][0], pts[i][1], r, g, b))
    if (d < 0) d += 2 * x + 3
    else { d += 2 * (x - y) + 5; y-- }
    x++
  }
}

// Draw filled rounded corner (fill from arc to corner boundary)
const roundCornerFill = (cx, cy, radius, quadrant, r = 255, g = 255, b = 255) => {
  for (let angle = 0; angle <= 90; angle++) {
    const rad = (angle * Math.PI) / 180
    const ox = Math.round(Math.cos(rad) * radius)
    const oy = Math.round(Math.sin(rad) * radius)
    const dirs = {
      1: [cx + ox, cy - oy, cx, cy - oy],
      2: [cx - ox, cy - oy, cx - ox, cy],
      3: [cx - ox, cy + oy, cx - ox, cy],
      4: [cx + ox, cy + oy, cx, cy + oy],
    }
  }
  // simpler: just use bresenham and fill horizontal spans
  let x = 0, y = radius, d = 1 - radius
  while (x <= y) {
    const fill = { 1: () => fillRect(cx, cy - y, cx + x, cy - y, r, g, b),
                   2: () => fillRect(cx - x, cy - y, cx, cy - y, r, g, b),
                   3: () => fillRect(cx - x, cy + y, cx, cy + y, r, g, b),
                   4: () => fillRect(cx, cy + y, cx + x, cy + y, r, g, b) }
    fill[quadrant]?.()
    if (d < 0) d += 2 * x + 3
    else { d += 2 * (x - y) + 5; y-- }
    x++
  }
}

// ── Document icon ─────────────────────────────────────────────────
// Canvas is 180×180. We'll draw the doc centered with nice padding.

const PAD = 26              // padding around icon
const SW = 6                // stroke width for rect outline
const RADIUS = 12           // corner radius

// Document rect bounds
const DX0 = PAD             // left
const DY0 = PAD             // top
const DX1 = W - PAD         // right
const DY1 = H - PAD         // bottom

// -- Outer stroke rect (top edge)
fillRect(DX0 + RADIUS, DY0, DX1 - RADIUS, DY0 + SW - 1)
// bottom edge
fillRect(DX0 + RADIUS, DY1 - SW + 1, DX1 - RADIUS, DY1)
// left edge
fillRect(DX0, DY0 + RADIUS, DX0 + SW - 1, DY1 - RADIUS)
// right edge
fillRect(DX1 - SW + 1, DY0 + RADIUS, DX1, DY1 - RADIUS)

// Rounded corners (outline only — draw SW-thick arc)
for (let t = 0; t < SW; t++) {
  const rr = RADIUS - t
  if (rr < 0) break
  roundCorner(DX0 + RADIUS, DY0 + RADIUS, rr, 2) // top-left
  roundCorner(DX1 - RADIUS, DY0 + RADIUS, rr, 1) // top-right
  roundCorner(DX0 + RADIUS, DY1 - RADIUS, rr, 3) // bottom-left
  roundCorner(DX1 - RADIUS, DY1 - RADIUS, rr, 4) // bottom-right
}

// -- Content lines (three text lines inside the document)
const LINE_X0 = DX0 + 24
const LINE_X1 = DX1 - 24
const LINE_X2 = DX0 + (DX1 - DX0) * 0.55  // shorter third line
const LINE_H = 4                             // line thickness

const totalInner = DY1 - DY0 - 2 * RADIUS
const lineY1 = Math.round(DY0 + RADIUS + totalInner * 0.35)
const lineY2 = Math.round(DY0 + RADIUS + totalInner * 0.55)
const lineY3 = Math.round(DY0 + RADIUS + totalInner * 0.75)

fillRect(LINE_X0, lineY1 - LINE_H, LINE_X1, lineY1 + LINE_H)
fillRect(LINE_X0, lineY2 - LINE_H, LINE_X1, lineY2 + LINE_H)
fillRect(LINE_X0, lineY3 - LINE_H, LINE_X2, lineY3 + LINE_H)

// ── Write ────────────────────────────────────────────────────────

mkdirSync('public', { recursive: true })
writeFileSync('public/apple-touch-icon.png', encodePNG(W, H, rgb))
console.log('✓  public/apple-touch-icon.png  (180×180)')

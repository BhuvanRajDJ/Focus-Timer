// Generates app + tray icons with no external deps (pure Node: zlib + hand-built PNG/ICO).
// Design: charcoal rounded field with a teal progress ring — the app's signature mark.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
mkdirSync(outDir, { recursive: true })

// ---- CRC32 (PNG chunk checksums) -------------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

// ---- draw one RGBA icon of the given size ----------------------------------
function drawRGBA(size) {
  const px = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  const rOuter = size * 0.42
  const rInner = size * 0.30
  const bgR = size * 0.46 // rounded field radius (superellipse-ish via circle)
  // teal -> green ring gradient; charcoal field
  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c
      const dy = y - c
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d <= bgR) {
        // charcoal field
        set(x, y, 20, 22, 28, 255)
      }
      if (d >= rInner && d <= rOuter) {
        // ring: leave a ~90deg gap at top so it reads as "progress"
        const ang = Math.atan2(dy, dx) // -pi..pi ; top is -pi/2
        const gap = ang > -Math.PI * 0.85 && ang < -Math.PI * 0.15
        if (!gap) {
          const t = (d - rInner) / (rOuter - rInner)
          const r = Math.round(34 + t * 20)
          const g = Math.round(200 - t * 40)
          const b = Math.round(160 + t * 20)
          set(x, y, r, g, b, 255)
        }
      }
    }
  }
  return px
}

function encodePNG(size) {
  const rgba = drawRGBA(size)
  // add filter byte (0) per scanline
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- ICO wrapping PNG entries (Windows supports PNG-compressed icons) -------
function encodeICO(sizes) {
  const pngs = sizes.map((s) => ({ s, buf: encodePNG(s) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + pngs.length * 16
  for (const { s, buf } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s // width (0 = 256)
    e[1] = s >= 256 ? 0 : s // height
    e[2] = 0 // palette
    e[3] = 0
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(buf.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += buf.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)])
}

writeFileSync(join(outDir, 'icon.png'), encodePNG(256))
writeFileSync(join(outDir, 'tray.png'), encodePNG(32))
writeFileSync(join(outDir, 'icon.ico'), encodeICO([16, 32, 48, 256]))
console.log('icons written to', outDir)

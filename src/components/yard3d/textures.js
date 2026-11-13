// Textures for the 3D yard, painted on canvases at run time (nothing to download): asphalt with its
// painted markings, grass, concrete, the warehouse wall and roof, roll-up doors, chain-link fence and
// each trailer's sides (carrier name, stripe, trailer #). World units are feet; see world.js.
import * as THREE from 'three'
import { DOCKS, STAGING_BAYS } from '../../yard'
import { BAY_WY, LOT_D, LOT_W, RIG_L, colWX } from '../YardScene'

const SLOT = 22
const MARGIN = (LOT_W - SLOT * Math.max(DOCKS.length, STAGING_BAYS)) / 2

// A seeded random source, so every texture looks the same on every load.
function rng(seed = 7) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function toTexture(c, { repeat, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

// Speckle noise over a base color: `n` dots of up to `r` px, lighter and darker by up to `amp`.
function speckle(g, w, h, { n, r = 1.4, amp = 18, seed = 3, alpha = 0.5 }) {
  const rand = rng(seed)
  for (let i = 0; i < n; i++) {
    const v = (rand() - 0.5) * 2 * amp
    g.fillStyle = v > 0 ? `rgba(255,255,255,${(alpha * v) / amp})` : `rgba(0,0,0,${(alpha * -v) / amp})`
    const s = rand() * r + 0.4
    g.fillRect(rand() * w, rand() * h, s, s)
  }
}

// Soft blotches (oil stains, wear, patches of darker grass).
function blotches(g, w, h, { n, min, max, color, seed = 5 }) {
  const rand = rng(seed)
  for (let i = 0; i < n; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = min + rand() * (max - min)
    const grd = g.createRadialGradient(x, y, 0, x, y, r)
    grd.addColorStop(0, color)
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

export function grassTexture() {
  const [c, g] = canvas(1024, 1024)
  g.fillStyle = '#7a9163'
  g.fillRect(0, 0, 1024, 1024)
  blotches(g, 1024, 1024, { n: 60, min: 60, max: 180, color: 'rgba(66,88,50,0.14)', seed: 11 })
  blotches(g, 1024, 1024, { n: 40, min: 50, max: 150, color: 'rgba(150,162,104,0.12)', seed: 12 })
  speckle(g, 1024, 1024, { n: 160000, r: 1.8, amp: 26, seed: 13, alpha: 0.5 })
  return toTexture(c, { repeat: [60, 60] })
}

// Plain asphalt for the street, with a little wear.
export function asphaltTexture(seed = 21) {
  const [c, g] = canvas(1024, 1024)
  g.fillStyle = '#4d5154'
  g.fillRect(0, 0, 1024, 1024)
  // Tire tracks: long faint darker streaks, and a couple of sealed patches.
  const r = rng(seed + 9)
  for (let i = 0; i < 26; i++) {
    g.save()
    g.translate(r() * 1024, r() * 1024)
    g.rotate(r() * Math.PI)
    g.fillStyle = 'rgba(22,24,26,0.05)'
    g.fillRect(-500, -9, 1000, 7)
    g.fillRect(-500, 9, 1000, 7)
    g.restore()
  }

  blotches(g, 1024, 1024, { n: 26, min: 80, max: 260, color: 'rgba(28,30,34,0.07)', seed })
  blotches(g, 1024, 1024, { n: 18, min: 80, max: 220, color: 'rgba(130,134,138,0.05)', seed: seed + 2 })
  speckle(g, 1024, 1024, { n: 140000, r: 1.4, amp: 26, seed: seed + 1, alpha: 0.42 })
  return toTexture(c, { repeat: [1, 1] })
}

export function concreteTexture() {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#b9bcbd'
  g.fillRect(0, 0, 512, 512)
  blotches(g, 512, 512, { n: 20, min: 30, max: 100, color: 'rgba(90,92,94,0.16)', seed: 31 })
  speckle(g, 512, 512, { n: 14000, r: 1.2, amp: 14, seed: 32, alpha: 0.35 })
  g.strokeStyle = 'rgba(70,72,74,0.35)'
  g.lineWidth = 2
  g.strokeRect(0, 0, 512, 512)
  return toTexture(c, { repeat: [1, 1] })
}

// The paved lot with everything painted on it, mapped across the whole lot (canvas top = dock face):
// concrete apron at the docks, dock and bay lines, bay names, the drive lane arrows.
export function lotTexture() {
  // Drawn over the yard asphalt (site.js).
  const PX = 12 // px per foot
  const W = LOT_W * PX
  const H = LOT_D * PX
  const [c, g] = canvas(W, H)
  const X = (x) => x * PX
  // Transparent: the plant's yard asphalt shows through; only the apron and the paint are drawn.
  g.clearRect(0, 0, W, H)
  // Concrete apron in front of the dock doors, with control joints and tire marks.
  const apron = X(RIG_L + 4)
  g.fillStyle = '#a7aaab'
  g.fillRect(0, 0, W, apron)
  speckle(g, W, apron, { n: 60000, r: 1.3, amp: 16, seed: 45, alpha: 0.35 })
  blotches(g, W, apron, { n: 26, min: 30, max: 90, color: 'rgba(60,62,64,0.22)', seed: 46 })
  g.strokeStyle = 'rgba(70,72,74,0.45)'
  g.lineWidth = 2
  for (let x = 0; x <= LOT_W; x += 15) {
    g.beginPath()
    g.moveTo(X(x), 0)
    g.lineTo(X(x), apron)
    g.stroke()
  }
  for (let y = 15; y < RIG_L + 4; y += 15) {
    g.beginPath()
    g.moveTo(0, X(y))
    g.lineTo(W, X(y))
    g.stroke()
  }
  // Oil stains where trailers sit at the docks and bays.
  for (let i = 0; i < DOCKS.length; i++) {
    const cx = X(colWX(i))
    const grd = g.createRadialGradient(cx, X(RIG_L - 6), 0, cx, X(RIG_L - 6), X(5))
    grd.addColorStop(0, 'rgba(30,30,34,0.28)')
    grd.addColorStop(1, 'rgba(30,30,34,0)')
    g.fillStyle = grd
    g.fillRect(cx - X(6), X(RIG_L - 12), X(12), X(12))
  }
  // Paint: white dock and bay lines, then a scatter of asphalt-colored flecks so they look worn.
  g.fillStyle = 'rgba(244,244,240,0.92)'
  for (let i = 0; i <= DOCKS.length; i++) g.fillRect(X(MARGIN + SLOT * i) - 4, 0, 8, X(RIG_L + 2))
  for (let i = 0; i <= STAGING_BAYS; i++) g.fillRect(X(MARGIN + SLOT * i) - 4, X(BAY_WY - 2), 8, X(RIG_L + 5))
  g.fillRect(X(MARGIN), X(BAY_WY + RIG_L + 3) - 4, X(SLOT * STAGING_BAYS), 8)
  const wear = rng(47)
  g.fillStyle = 'rgba(84,90,96,0.6)'
  for (let i = 0; i < 9000; i++) g.fillRect(wear() * W, wear() * H, 2, 2)
  // Bay names at the open end of each bay, readable from the street.
  g.fillStyle = 'rgba(244,244,240,0.9)'
  g.font = `700 ${X(4.2)}px "Barlow Condensed", "Arial Narrow", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // The yard is drawn mirrored along the dock wall (see Yard3D), so column i shows bay / dock n-1-i.
  for (let i = 0; i < STAGING_BAYS; i++) g.fillText(`BAY ${i + 1}`, X(colWX(STAGING_BAYS - 1 - i)), X(BAY_WY + RIG_L - 1))
  for (let i = 0; i < DOCKS.length; i++) g.fillText(`${DOCKS[i]}`, X(colWX(DOCKS.length - 1 - i)), X(RIG_L - 2.5))
  // Drive lane arrows (east) and the in / out arrows at the gates.
  const arrow = (x, y, dx, dy, s = 1) => {
    g.save()
    g.translate(X(x), X(y))
    g.rotate(Math.atan2(dy, dx))
    g.scale(s, s)
    g.beginPath()
    g.moveTo(0, -X(1))
    g.lineTo(X(12), -X(1))
    g.lineTo(X(12), -X(2.6))
    g.lineTo(X(17), 0)
    g.lineTo(X(12), X(2.6))
    g.lineTo(X(12), X(1))
    g.lineTo(0, X(1))
    g.closePath()
    g.fill()
    g.restore()
  }
  g.fillStyle = 'rgba(244,244,240,0.85)'
  for (const x of [50, 100, 150]) arrow(x, 68, -1, 0)
  arrow(LOT_W - 10, LOT_D - 8, 0, -1, 0.8)
  arrow(10, LOT_D - 30, 0, 1, 0.8)
  g.font = `700 ${X(3.4)}px "Barlow Condensed", "Arial Narrow", sans-serif`
  g.fillText('D R I V E   L A N E', X(65), X(76))
  // Yellow fire lane hatch at the right front corner, by the office.
  g.strokeStyle = 'rgba(235,190,40,0.75)'
  g.lineWidth = X(0.5)
  g.strokeRect(X(12), X(LOT_D - 20), X(18), X(12))
  return toTexture(c, { aniso: 16 })
}

// Street: two lanes, double yellow center line, white edge lines. Repeats along x every 120 ft.
export function streetTexture() {
  const PX = 8
  const [c, g] = canvas(120 * PX, 20 * PX)
  g.fillStyle = '#464b51'
  g.fillRect(0, 0, c.width, c.height)
  blotches(g, c.width, c.height, { n: 16, min: 20, max: 70, color: 'rgba(20,22,26,0.3)', seed: 61 })
  speckle(g, c.width, c.height, { n: 30000, r: 1.4, amp: 24, seed: 62, alpha: 0.45 })
  g.fillStyle = 'rgba(240,240,236,0.85)'
  g.fillRect(0, PX * 1.2, c.width, PX * 0.45)
  g.fillRect(0, PX * 18.35, c.width, PX * 0.45)
  g.fillStyle = 'rgba(230,180,40,0.9)'
  g.fillRect(0, PX * 9.55, c.width, PX * 0.32)
  g.fillRect(0, PX * 10.13, c.width, PX * 0.32)
  return toTexture(c, { repeat: [1, 1], aniso: 16 })
}

// Tilt-up concrete wall panels, 12 ft wide, with a little grime at the base. `w`×`h` in feet.
export function wallTexture(w, h) {
  const PX = 6
  const [c, g] = canvas(Math.round(w * PX), Math.round(h * PX))
  g.fillStyle = '#e4e2dc'
  g.fillRect(0, 0, c.width, c.height)
  speckle(g, c.width, c.height, { n: Math.round(w * h * 6), r: 1.2, amp: 10, seed: 71, alpha: 0.3 })
  const grime = g.createLinearGradient(0, c.height, 0, c.height - 6 * PX)
  grime.addColorStop(0, 'rgba(90,86,78,0.35)')
  grime.addColorStop(1, 'rgba(90,86,78,0)')
  g.fillStyle = grime
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = 'rgba(80,80,80,0.28)'
  for (let x = 12; x < w; x += 12) g.fillRect(x * PX - 1, 0, 2, c.height)
  return toTexture(c)
}

// Single-ply roof membrane with seams.
export function roofTexture(w, d) {
  const PX = 4
  const [c, g] = canvas(Math.round(w * PX), Math.round(d * PX))
  g.fillStyle = '#d6d9db'
  g.fillRect(0, 0, c.width, c.height)
  blotches(g, c.width, c.height, { n: 30, min: 20, max: 60, color: 'rgba(120,124,128,0.18)', seed: 81 })
  speckle(g, c.width, c.height, { n: 20000, r: 1.1, amp: 10, seed: 82, alpha: 0.25 })
  g.fillStyle = 'rgba(140,144,148,0.35)'
  for (let x = 0; x < w; x += 10) g.fillRect(x * PX, 0, 1, c.height)
  return toTexture(c)
}

// Dark band under the roof line with the building's name.
export function bandTexture(w, text) {
  const PX = 12
  const [c, g] = canvas(Math.round(w * PX), 4 * PX)
  g.fillStyle = '#2f3740'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#f5f6f7'
  g.font = `700 ${PX * 2}px "Barlow Condensed", "Arial Narrow", sans-serif`
  g.textBaseline = 'middle'
  g.fillText(text, PX * 6, c.height / 2 + 1)
  return toTexture(c)
}

// Roll-up dock door: horizontal slats with a vision window row.
export function doorTexture() {
  const [c, g] = canvas(128, 128)
  g.fillStyle = '#cfd5da'
  g.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 128; y += 11) {
    g.fillStyle = 'rgba(80,90,100,0.35)'
    g.fillRect(0, y, 128, 1.5)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillRect(0, y + 2, 128, 1)
  }
  g.fillStyle = '#3a4652'
  for (let x = 14; x < 120; x += 26) g.fillRect(x, 46, 16, 6)
  return toTexture(c)
}

// Dock number plate.
export function plateTexture(label) {
  const [c, g] = canvas(128, 96)
  g.fillStyle = '#2f3740'
  g.fillRect(0, 0, 128, 96)
  g.fillStyle = '#f5c518'
  g.fillRect(0, 86, 128, 10)
  g.fillStyle = '#ffffff'
  g.font = '700 72px "Barlow Condensed", "Arial Narrow", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(label), 64, 46)
  return toTexture(c)
}

// Chain-link mesh: a transparent texture of diamond wires, repeated along the fence.
export function chainLinkTexture() {
  const [c, g] = canvas(64, 64)
  g.clearRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(170,176,182,0.95)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(0, 32)
  g.lineTo(32, 0)
  g.lineTo(64, 32)
  g.lineTo(32, 64)
  g.closePath()
  g.stroke()
  return toTexture(c, { repeat: [1, 1] })
}

// A soft rounded glow used under trucks (detention) and for light pools on the ground.
export function glowTexture() {
  const [c, g] = canvas(256, 256)
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.55, 'rgba(255,255,255,0.45)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  return toTexture(c, { srgb: false })
}

// Trailer side: brushed white aluminum with posts, a carrier stripe, the carrier name and the
// trailer #. 34 ft × 9.4 ft. `paint`: carrier color; `light`: a pale paint (lettering goes dark).
export function trailerSideTexture({ carrier, number, paint, light }) {
  const PX = 30
  const [c, g] = canvas(34 * PX, Math.round(9.4 * PX))
  const W = c.width
  const H = c.height
  const body = g.createLinearGradient(0, 0, 0, H)
  body.addColorStop(0, '#fbfbfc')
  body.addColorStop(1, '#e3e6e8')
  g.fillStyle = body
  g.fillRect(0, 0, W, H)
  // Logistic posts every 2.8 ft and rivet lines top and bottom.
  for (let x = 1.4; x < 34; x += 2.8) {
    g.fillStyle = 'rgba(120,128,136,0.32)'
    g.fillRect(x * PX - 2, 6, 3, H - 12)
    g.fillStyle = 'rgba(255,255,255,0.7)'
    g.fillRect(x * PX + 1, 6, 1, H - 12)
  }
  g.fillStyle = 'rgba(120,128,136,0.45)'
  g.fillRect(0, 4, W, 3)
  g.fillRect(0, H - 7, W, 3)
  // Carrier stripe along the bottom, thin stripe at the top.
  g.fillStyle = paint
  g.fillRect(0, H - 1.9 * PX, W, 1.3 * PX)
  g.globalAlpha = 0.85
  g.fillRect(0, 0.7 * PX, W, 0.5 * PX)
  g.globalAlpha = 1
  // Carrier name, big and condensed, centered.
  const name = String(carrier || '').toUpperCase().slice(0, 18)
  g.fillStyle = light ? '#2f3740' : paint
  let size = 3.6 * PX
  g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`
  while (g.measureText(name).width > W * 0.78 && size > 20) {
    size -= 4
    g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(name, W * 0.5, H * 0.47)
  // Trailer # near the rear, upper corner (the rear is at the canvas's left).
  g.fillStyle = '#2f3740'
  g.font = `700 ${0.9 * PX}px "Instrument Sans", "Segoe UI", sans-serif`
  g.textAlign = 'left'
  g.fillText(String(number || '').slice(0, 12), 0.8 * PX, 1.9 * PX)
  // Conspicuity tape: red / white dashes along the bottom edge.
  for (let x = 0; x < W; x += 1.2 * PX) {
    g.fillStyle = Math.round(x / (1.2 * PX)) % 2 ? '#ffffff' : '#d23b2e'
    g.fillRect(x, H - 0.45 * PX, 0.6 * PX, 0.3 * PX)
  }
  return toTexture(c, { aniso: 8 })
}

// Trailer rear: two swing doors, lock rods, conspicuity tape and the plate.
export function trailerRearTexture() {
  const PX = 30
  const [c, g] = canvas(Math.round(8.6 * PX), Math.round(9.4 * PX))
  const W = c.width
  const H = c.height
  g.fillStyle = '#eceef0'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(110,118,126,0.8)'
  g.lineWidth = 3
  g.strokeRect(6, 6, W / 2 - 9, H - 12)
  g.strokeRect(W / 2 + 3, 6, W / 2 - 9, H - 12)
  g.fillStyle = 'rgba(140,148,156,0.9)'
  for (const x of [0.22, 0.38, 0.62, 0.78]) g.fillRect(W * x - 2, 14, 4, H - 28)
  for (let x = 0; x < W; x += 0.9 * PX) {
    g.fillStyle = Math.round(x / (0.9 * PX)) % 2 ? '#ffffff' : '#d23b2e'
    g.fillRect(x, H - 0.55 * PX, 0.45 * PX, 0.3 * PX)
  }
  g.fillStyle = '#f4f1e4'
  g.fillRect(W / 2 - 0.6 * PX, H - 1.6 * PX, 1.2 * PX, 0.6 * PX)
  return toTexture(c)
}

// Reefer unit front grille.
export function reeferTexture() {
  const [c, g] = canvas(128, 128)
  g.fillStyle = '#e9ecee'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#3c4650'
  for (let y = 20; y < 108; y += 10) g.fillRect(16, y, 96, 5)
  g.fillStyle = '#2b6cb0'
  g.fillRect(16, 8, 40, 6)
  return toTexture(c)
}

// Truck grille: chrome surround with dark horizontal bars.
export function grilleTexture() {
  const [c, g] = canvas(128, 128)
  g.fillStyle = '#d9dde1'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#1f2429'
  for (let y = 12; y < 120; y += 12) g.fillRect(10, y, 108, 7)
  return toTexture(c)
}

// Generic parked trailer (the lots): white with posts, a faint stripe.
export function genericTrailerTexture() {
  const [c, g] = canvas(512, 128)
  const body = g.createLinearGradient(0, 0, 0, 128)
  body.addColorStop(0, '#fafbfb')
  body.addColorStop(1, '#dfe3e5')
  g.fillStyle = body
  g.fillRect(0, 0, 512, 128)
  for (let x = 6; x < 512; x += 14) {
    g.fillStyle = 'rgba(120,128,136,0.25)'
    g.fillRect(x, 4, 2, 120)
  }
  g.fillStyle = 'rgba(120,128,136,0.4)'
  g.fillRect(0, 118, 512, 4)
  return toTexture(c)
}

// Flat roof membrane (white TPO): seams, ponding stains, a little dirt. One tile = 40 ft.
export function flatRoofTexture() {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#d8d5cd'
  g.fillRect(0, 0, 512, 512)
  blotches(g, 512, 512, { n: 14, min: 30, max: 110, color: 'rgba(150,146,136,0.18)', seed: 101 })
  speckle(g, 512, 512, { n: 16000, r: 1.2, amp: 10, seed: 102, alpha: 0.3 })
  g.fillStyle = 'rgba(160,158,150,0.45)'
  for (let y = 0; y < 512; y += 128) g.fillRect(0, y, 512, 2)
  return toTexture(c, { repeat: [1, 1] })
}

// Standing-seam metal roof in `color`: ribs every ~2 ft, light weathering. One tile = 40 ft.
export function metalRoofTexture(color) {
  const [c, g] = canvas(512, 512)
  g.fillStyle = color
  g.fillRect(0, 0, 512, 512)
  blotches(g, 512, 512, { n: 10, min: 40, max: 140, color: 'rgba(0,0,0,0.07)', seed: 111 })
  for (let x = 0; x < 512; x += 26) {
    g.fillStyle = 'rgba(255,255,255,0.22)'
    g.fillRect(x, 0, 3, 512)
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.fillRect(x + 3, 0, 2, 512)
  }
  speckle(g, 512, 512, { n: 8000, r: 1, amp: 8, seed: 112, alpha: 0.2 })
  return toTexture(c, { repeat: [1, 1] })
}

// Precast concrete wall panels, one 24 ft panel per tile across, full height down.
export function panelWallTexture(color) {
  const [c, g] = canvas(256, 256)
  g.fillStyle = color
  g.fillRect(0, 0, 256, 256)
  speckle(g, 256, 256, { n: 6000, r: 1.1, amp: 10, seed: 121, alpha: 0.3 })
  const grime = g.createLinearGradient(0, 256, 0, 200)
  grime.addColorStop(0, 'rgba(90,86,78,0.35)')
  grime.addColorStop(1, 'rgba(90,86,78,0)')
  g.fillStyle = grime
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = 'rgba(70,70,70,0.35)'
  g.fillRect(0, 0, 2, 256)
  g.fillStyle = 'rgba(255,255,255,0.4)'
  g.fillRect(0, 10, 256, 2)
  return toTexture(c, { repeat: [1, 1] })
}

// Ribbed metal siding.
export function ribbedWallTexture(color) {
  const [c, g] = canvas(256, 256)
  g.fillStyle = color
  g.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = 'rgba(255,255,255,0.25)'
    g.fillRect(x, 0, 2, 256)
    g.fillStyle = 'rgba(0,0,0,0.16)'
    g.fillRect(x + 4, 0, 2, 256)
  }
  const grime = g.createLinearGradient(0, 256, 0, 210)
  grime.addColorStop(0, 'rgba(80,76,70,0.3)')
  grime.addColorStop(1, 'rgba(80,76,70,0)')
  g.fillStyle = grime
  g.fillRect(0, 0, 256, 256)
  return toTexture(c, { repeat: [1, 1] })
}

export function gravelTexture() {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#c9bea8'
  g.fillRect(0, 0, 512, 512)
  blotches(g, 512, 512, { n: 30, min: 30, max: 120, color: 'rgba(140,128,104,0.22)', seed: 131 })
  blotches(g, 512, 512, { n: 20, min: 30, max: 100, color: 'rgba(230,226,214,0.25)', seed: 132 })
  speckle(g, 512, 512, { n: 60000, r: 2.2, amp: 34, seed: 133, alpha: 0.55 })
  return toTexture(c, { repeat: [1, 1] })
}

export function dirtTexture() {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#a08a6c'
  g.fillRect(0, 0, 512, 512)
  blotches(g, 512, 512, { n: 40, min: 40, max: 140, color: 'rgba(110,128,80,0.3)', seed: 141 })
  blotches(g, 512, 512, { n: 30, min: 30, max: 100, color: 'rgba(80,64,46,0.25)', seed: 142 })
  speckle(g, 512, 512, { n: 50000, r: 1.8, amp: 28, seed: 143, alpha: 0.5 })
  return toTexture(c, { repeat: [1, 1] })
}

export function parkingTexture() {
  return asphaltTexture(151)
}

// A road surface: across = u (0..1 over the road's width), along = v (one tile per 40 ft).
// `lines`: a two-lane road (double yellow center, white edges); otherwise plain.
export function roadTexture(lines) {
  const [c, g] = canvas(256, 512)
  g.fillStyle = '#4a4f55'
  g.fillRect(0, 0, 256, 512)
  blotches(g, 256, 512, { n: 14, min: 20, max: 70, color: 'rgba(20,22,26,0.28)', seed: 161 })
  speckle(g, 256, 512, { n: 30000, r: 1.4, amp: 24, seed: 162, alpha: 0.45 })
  // Tire tracks: two darker bands per lane.
  g.fillStyle = 'rgba(20,22,26,0.12)'
  for (const x of [40, 90, 166, 216]) g.fillRect(x - 10, 0, 20, 512)
  if (lines) {
    g.fillStyle = 'rgba(238,238,232,0.88)'
    g.fillRect(8, 0, 5, 512)
    g.fillRect(243, 0, 5, 512)
    g.fillStyle = 'rgba(232,180,40,0.92)'
    g.fillRect(122, 0, 4, 512)
    g.fillRect(130, 0, 4, 512)
  }
  const t = toTexture(c, { repeat: [1, 1], aniso: 16 })
  t.wrapS = THREE.ClampToEdgeWrapping
  return t
}

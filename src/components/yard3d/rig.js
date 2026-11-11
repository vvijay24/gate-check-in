// A tractor-trailer in 3D, in its carrier's paint: two bodies joined at the hitch (the fifth wheel),
// each turned by its own heading so the trailer swings behind the cab like a real rig. Dimensions in
// feet along the rig, matching the 2D map: the trailer runs from its rear (a = 0) to 34, the hitch is at
// a = 32 (K_AT), the tractor's bumper at 49. Each body's group sits at the hitch; its local +x points
// forward (toward the cab), +y up, z across.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { K_AT, paintOf } from '../YardScene'
import * as T from './textures'

// Carrier paints (the same six as the 2D map, by the same hash of the carrier's name).
const PAINT_HEX = ['#b8352a', '#d97b29', '#4d555d', '#7b2d32', '#a9b1b8', '#eef0f2']

const geoCache = new Map()
const geo = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make())
  return geoCache.get(key)
}
const boxGeo = (l, h, w) => geo(`b${l}|${h}|${w}`, () => new THREE.BoxGeometry(l, h, w))
const rbox = (l, h, w, r) => geo(`r${l}|${h}|${w}|${r}`, () => new RoundedBoxGeometry(l, h, w, 3, r))
const wheelGeo = (r, w) =>
  geo(`w${r}|${w}`, () => {
    const g = new THREE.CylinderGeometry(r, r, w, 24)
    g.rotateX(Math.PI / 2)
    return g
  })

let shared = null
function mats() {
  if (shared) return shared
  shared = {
    tire: new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.25, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: '#6f777e', roughness: 0.5, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: '#25292e', roughness: 0.7, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.12, metalness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#1a232c', roughness: 0.05, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.6 }),
    body: new THREE.MeshStandardMaterial({ color: '#f1f2f3', roughness: 0.45, metalness: 0.15 }),
    roof: new THREE.MeshStandardMaterial({ color: '#dfe2e4', roughness: 0.6, metalness: 0.2 }),
    rear: new THREE.MeshStandardMaterial({ map: T.trailerRearTexture(), roughness: 0.5, metalness: 0.15 }),
    reefer: new THREE.MeshStandardMaterial({ map: T.reeferTexture(), roughness: 0.4, metalness: 0.3 }),
    grille: new THREE.MeshStandardMaterial({ map: T.grilleTexture(), roughness: 0.2, metalness: 0.9 }),
    skirt: new THREE.MeshStandardMaterial({ color: '#3a3f45', roughness: 0.8 }),
  }
  return shared
}
const paintMats = new Map()
function paintMat(i) {
  if (!paintMats.has(i))
    paintMats.set(i, new THREE.MeshPhysicalMaterial({ color: PAINT_HEX[i], roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 }))
  return paintMats.get(i)
}

function part(group, geometry, material, x, y, z, { cast = true } = {}) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = true
  group.add(m)
  return m
}
const lamp = (color) => new THREE.MeshStandardMaterial({ color: '#2a1414', emissive: color, emissiveIntensity: 0.15, roughness: 0.3 })

// `spec`: { carrier, trailerNumber, reefer, drop }. Returns the root group and the parts the renderer
// poses and lights each frame.
export function makeRig({ carrier, trailerNumber, reefer, drop }) {
  const M = mats()
  const p = paintOf(carrier)
  const paint = paintMat(p.index)
  const root = new THREE.Group()
  const trailer = new THREE.Group()
  const tractor = new THREE.Group()
  root.add(trailer, tractor)
  const u = (a) => a - K_AT // along the body, from the hitch

  // Trailer.
  const sideTex = T.trailerSideTexture({ carrier, number: trailerNumber, paint: PAINT_HEX[p.index], light: p.light })
  const sideA = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.45, metalness: 0.15 })
  const sideB = sideA
  const Z = 4.2
  const H = 9.4
  part(trailer, boxGeo(34, H, 8.6), [M.body, M.rear, M.roof, M.dark, sideA, sideB], u(17), Z + H / 2, 0)
  part(trailer, boxGeo(33, 1.4, 7), M.dark, u(17.5), 3.5, 0)
  for (const a of [4, 7.6]) for (const s of [-1, 1]) {
    part(trailer, wheelGeo(1.7, 1.9), M.tire, u(a), 1.7, s * 3.35)
    part(trailer, wheelGeo(0.95, 1.95), M.rim, u(a), 1.7, s * 3.35, { cast: false })
  }
  const legH = drop ? Z : 2.4
  for (const s of [-1, 1]) {
    part(trailer, boxGeo(0.6, legH, 0.6), M.steel, u(28), Z - legH / 2, s * 2.9)
    if (drop) part(trailer, boxGeo(1.6, 0.35, 1.2), M.dark, u(28), 0.18, s * 2.9)
    part(trailer, boxGeo(16.6, 2.9, 0.1), M.skirt, u(18.3), 2.75, s * 4.25)
    part(trailer, boxGeo(0.15, 2.6, 2), M.dark, u(1.8), 1.5, s * 3.35)
  }
  part(trailer, boxGeo(0.5, 0.6, 8), M.steel, u(0.5), 1.6, 0)
  if (reefer) part(trailer, boxGeo(1.6, 5.8, 6.4), [M.reefer, M.body, M.body, M.body, M.body, M.body], u(34.8), 10.1, 0)

  // Lamps (emissive; the renderer turns them up and down).
  const L = { brake: lamp('#ff2a1a'), reverse: lamp('#ffffff'), left: lamp('#ffa21a'), right: lamp('#ffa21a'), beacon: lamp('#ffb020'), head: lamp('#fff6dd') }
  // `left` is the driver's left: local -z when facing +x.
  for (const s of [-1, 1]) {
    part(trailer, boxGeo(0.12, 0.5, 0.9), L.brake, u(0) - 0.06, 3.5, s * 3.3, { cast: false })
    part(trailer, boxGeo(0.12, 0.5, 0.6), L.reverse, u(0) - 0.06, 3.5, s * 2.2, { cast: false })
    part(trailer, boxGeo(0.12, 0.5, 0.5), s < 0 ? L.left : L.right, u(0) - 0.06, 3.5, s * 4.05, { cast: false })
  }

  if (!drop) {
    // Chassis, fifth wheel, wheels.
    part(tractor, boxGeo(19.4, 1.5, 3.4), M.dark, u(38.7), 2.3, 0)
    part(tractor, boxGeo(3.4, 0.5, 4), M.dark, u(32), 3.35, 0)
    for (const a of [31.2, 34.4]) for (const s of [-1, 1]) {
      part(tractor, wheelGeo(1.7, 1.9), M.tire, u(a), 1.7, s * 3.35)
      part(tractor, wheelGeo(0.95, 1.95), M.rim, u(a), 1.7, s * 3.35, { cast: false })
    }
    for (const s of [-1, 1]) {
      part(tractor, wheelGeo(1.7, 1.1), M.tire, u(45.4), 1.7, s * 3.75)
      part(tractor, wheelGeo(1, 1.15), M.rim, u(45.4), 1.7, s * 3.8, { cast: false })
      // Fuel tank, exhaust stack, mirror.
      const tank = part(tractor, geo('tank', () => new THREE.CylinderGeometry(1.05, 1.05, 3.6, 20).rotateZ(Math.PI / 2)), M.chrome, u(40.4), 3.2, s * 3.9)
      tank.castShadow = true
      part(tractor, geo('stack', () => new THREE.CylinderGeometry(0.32, 0.32, 11.4, 12)), M.chrome, u(37.4), 9.7, s * 4.05)
      part(tractor, boxGeo(0.3, 2, 0.35), M.dark, u(43.2), 9.6, s * 4.85)
      part(tractor, boxGeo(0.2, 0.6, 1.1), L.head, u(48.95), 5.9, s * 2.9, { cast: false })
      part(tractor, boxGeo(0.2, 0.45, 0.6), s < 0 ? L.left : L.right, u(48.95), 6.9, s * 3.6, { cast: false })
    }
    // Sleeper, cab, roof fairing, hood, glass, grille, bumper.
    part(tractor, rbox(4.6, 9.6, 8.2, 0.6), paint, u(38.2), 8.3, 0)
    part(tractor, rbox(5.6, 8.4, 8.4, 0.7), paint, u(42.9), 7.2, 0)
    part(tractor, rbox(4.2, 1.8, 7.8, 0.8), paint, u(41.6), 12.0, 0)
    const hood = part(tractor, rbox(5.6, 5.2, 7.2, 1.0), paint, u(46.4), 5.8, 0)
    hood.rotation.z = -0.07
    const shield = part(tractor, boxGeo(0.12, 3.0, 7.6), M.glass, u(45.75), 9.6, 0, { cast: false })
    shield.rotation.z = -0.25
    for (const s of [-1, 1]) part(tractor, boxGeo(2.2, 2.4, 0.08), M.glass, u(43.9), 9.4, s * 4.21, { cast: false })
    part(tractor, boxGeo(0.15, 3.8, 3.6), M.grille, u(49.1), 5.6, 0, { cast: false })
    part(tractor, rbox(1, 1.3, 8.4, 0.3), M.chrome, u(49.4), 2.9, 0)
    part(tractor, geo('beacon', () => new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12)), L.beacon, u(42.4), 13.1, 0, { cast: false })
  }

  // Ground pad under a parked rig (status color), its outline, the detention glow and the hit box.
  return { root, trailer, tractor, lamps: L, drop, dispose: () => { sideTex.dispose(); sideA.dispose(); Object.values(L).forEach((m) => m.dispose()) } }
}

// Places the rig by its articulated pose: `art` = { K: [x, y] hitch in world feet, tt, tr } with
// headings in radians (0 = +x, π/2 = +y toward the street).
export function poseRig(rig, art) {
  const [kx, ky] = art.K
  rig.trailer.position.set(kx, 0, ky)
  rig.trailer.rotation.y = -art.tr
  rig.tractor.position.set(kx, 0, ky)
  rig.tractor.rotation.y = -art.tt
}

// Lamps: `lights` = { brake, reverse, left, right } from the motion engine (a driving rig), `t` the
// clock in seconds (blinkers and beacon flash), `night` 0..1 (headlights and running lights).
export function lightRig(rig, lights, t, night, driving) {
  const L = rig.lamps
  const blink = Math.floor(t * 2.6) % 2 === 0
  L.brake.emissiveIntensity = lights?.brake ? 4 : 0.35 + night * 1.2
  L.reverse.emissiveIntensity = lights?.reverse ? 3.5 : 0.05
  L.left.emissiveIntensity = lights?.left && blink ? 4 : 0.1
  L.right.emissiveIntensity = lights?.right && blink ? 4 : 0.1
  L.beacon.emissiveIntensity = lights?.reverse ? (Math.floor(t * 4) % 2 ? 6 : 0.4) : 0.1
  L.head.emissiveIntensity = driving ? 1 + night * 4 : 0.1 + night * 0.6
}

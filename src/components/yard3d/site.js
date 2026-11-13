// The plant around the yard: Wayne Farms, Union Springs, AL, traced from an aerial view of the site
// (positions below are pixels on that 1412 × 877 view, about 1.5 ft each, north up). The traced layout
// is turned into 3D here: the plant's buildings with their roofs, the roads (US-82, Greenwood Ave and
// St, Baskin St / AL-223, W Locke Ave), the yard and parking asphalt, the gravel trailer lots with
// their rows of parked trailers, the employee lot with cars, the field, and the woods.
//
// The working yard (docks, bays, the trucks the app tracks) keeps its own coordinates (world.js); it
// sits against the west wall of the white dock building, so this file places everything around it:
// image pixel (px, py) → three (x, z) with x running south along the dock wall and z west from it.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as T from './textures'

const FT = 1.5
export const P = (px, py) => [py * FT - 450, 1200 - px * FT]

// ---------- Traced layout (image pixels) ----------

// Buildings: footprint polygon, wall height (ft), roof kind. Roof kinds: 'white' (flat membrane),
// 'metal' (standing seam), 'dark' (dark metal), 'brown' (low gable).
const BUILDINGS = [
  // The white dock building: its west wall holds the six dock doors of the working yard.
  { pts: [[800, 298], [940, 298], [940, 422], [800, 422]], h: 28, roof: 'white', units: 6 },
  { pts: [[835, 222], [935, 222], [935, 298], [835, 298]], h: 32, roof: 'dark' },
  { pts: [[930, 245], [1110, 245], [1110, 420], [940, 420], [940, 298], [930, 298]], h: 36, roof: 'white', units: 14 },
  { pts: [[1020, 245], [1095, 245], [1095, 340], [1020, 340]], h: 44, roof: 'metal' },
  { pts: [[840, 422], [1150, 422], [1150, 582], [845, 582]], h: 30, roof: 'white', units: 16 },
  { pts: [[920, 470], [1020, 470], [1020, 552], [920, 552]], h: 42, roof: 'brown' },
  { pts: [[1080, 482], [1148, 482], [1148, 586], [1080, 586]], h: 38, roof: 'dark' },
  { pts: [[1110, 300], [1200, 300], [1195, 470], [1110, 470]], h: 18, roof: 'white', units: 6 },
  // Warehouses north of the yard and the shed cluster beside them.
  { pts: [[702, 107], [850, 107], [850, 227], [702, 227]], h: 30, roof: 'metal' },
  { pts: [[612, 110], [700, 110], [700, 215], [612, 215]], h: 22, roof: 'metal' },
  { pts: [[700, 200], [740, 200], [740, 226], [700, 226]], h: 16, roof: 'white' },
  // The metal building west of the yard.
  { pts: [[535, 290], [650, 290], [650, 400], [535, 400]], h: 28, roof: 'metal' },
  { pts: [[590, 245], [640, 245], [640, 290], [590, 290]], h: 18, roof: 'metal' },
  // East: the large light-roofed building by Baskin St, and small buildings by the tank.
  { pts: [[1172, 190], [1240, 172], [1292, 190], [1272, 318], [1165, 302]], h: 32, roof: 'metal' },
  { pts: [[1128, 198], [1158, 198], [1158, 228], [1128, 228]], h: 16, roof: 'metal' },
  { pts: [[1075, 205], [1112, 205], [1112, 238], [1075, 238]], h: 18, roof: 'metal' },
  // The white shop building south of the plant, by the parking lot.
  { pts: [[918, 664], [996, 664], [996, 726], [918, 726]], h: 20, roof: 'metal' },
  // Across Baskin St and the houses on the west side.
  { pts: [[1318, 395], [1412, 395], [1412, 500], [1318, 500]], h: 18, roof: 'brown' },
  { pts: [[1308, 22], [1362, 22], [1362, 70], [1308, 70]], h: 14, roof: 'white' },
  { pts: [[8, 200], [52, 200], [52, 245], [8, 245]], h: 14, roof: 'dark' },
  { pts: [[10, 250], [48, 250], [48, 290], [10, 290]], h: 12, roof: 'white' },
]

// Roads: centerline (pixels), width (ft), lines ('2lane' = yellow center + white edges, 'plain').
const ROADS = [
  { pts: [[-300, 52], [0, 40], [320, 26], [640, 10], [900, -30]], w: 34, lines: '2lane' },
  { pts: [[200, 30], [215, 80], [252, 165], [300, 240], [350, 315], [380, 400], [420, 455], [470, 500], [525, 560], [532, 640], [538, 760], [545, 840]], w: 30, lines: '2lane' },
  { pts: [[525, 562], [600, 565], [700, 566], [770, 560]], w: 44, lines: 'plain' },
  { pts: [[-200, 820], [330, 818], [700, 822], [1060, 850]], w: 26, lines: '2lane' },
  { pts: [[1035, 920], [1060, 877], [1165, 600], [1305, 280], [1360, 160], [1440, 40]], w: 34, lines: '2lane' },
  { pts: [[1168, 590], [1300, 586], [1460, 584]], w: 26, lines: '2lane' },
]

// Paved yard (asphalt) around the working yard, the plant aprons and the entrance.
const YARD = [
  [655, 228], [850, 226], [850, 300], [800, 300], [800, 424], [842, 424], [846, 590], [780, 600], [770, 548], [700, 548], [660, 500], [652, 400], [655, 228],
]
// Plant apron to the east and north of the buildings (lighter, worn asphalt).
const APRONS = [
  [[1100, 420], [1200, 420], [1205, 600], [1150, 600], [1150, 422]],
  [[850, 200], [1000, 160], [1110, 200], [1110, 245], [930, 245], [935, 222], [850, 222]],
]
// Gravel trailer lots.
const GRAVEL = [
  [[255, 95], [500, 70], [612, 52], [655, 110], [612, 230], [560, 300], [530, 420], [470, 440], [410, 400], [300, 240]],
  [[192, 478], [382, 452], [470, 520], [520, 590], [522, 815], [305, 818], [262, 700], [205, 565]],
]
// Employee parking (asphalt), and its rows of stalls: start, end (pixels), cars facing which way.
const PARKING = [[[552, 585], [780, 600], [790, 640], [1000, 650], [1000, 735], [1055, 735], [1050, 832], [552, 832]]]
const STALL_ROWS = [
  ...[572, 598, 628, 655, 685, 712, 742].map((x) => ({ from: [x, 600], to: [x, 805] })),
  ...[770, 800].map((x) => ({ from: [x, 655], to: [x, 805] })),
  ...[742, 770, 798, 822].map((y) => ({ from: [835, y], to: [975, y] })),
  { from: [1015, 595], to: [1030, 820] },
  { from: [1255, 310], to: [1225, 560] },
  { from: [1290, 300], to: [1262, 560] },
]
// Parked trailers in the gravel lots: first trailer's center, step to the next, count, heading (deg).
const TRAILER_ROWS = [
  { at: [262, 132], step: [11, -1.5], n: 12, deg: 90 },
  { at: [412, 92], step: [12, -1], n: 7, deg: 90 },
  { at: [440, 238], step: [9, 17], n: 7, deg: 32 },
  { at: [492, 318], step: [10, 14], n: 3, deg: 32 },
  { at: [258, 548], step: [8, 15], n: 10, deg: -18 },
  { at: [372, 510], step: [9, 14], n: 5, deg: -18 },
  { at: [420, 584], step: [10, 0], n: 2, deg: -18 },
  { at: [715, 160], step: [12, 0], n: 0, deg: 90 },
]
// Woods (dense) and scattered trees.
const WOODS = [
  [[-300, 60], [190, 50], [300, 240], [400, 400], [200, 470], [190, 560], [260, 700], [300, 820], [-300, 830]],
  [[1160, 610], [1460, 600], [1460, 900], [1040, 900], [1110, 700]],
  [[1180, 0], [1310, -40], [1300, 140], [1240, 120], [1200, 60]],
]
const SCATTER = [
  [585, 420], [600, 432], [575, 448], [950, 865], [990, 870], [870, 860], [760, 870], [430, 860], [1410, 260], [1395, 330], [1380, 150], [700, 40], [560, 30], [830, 30],
]
// The field north-east with the live-haul cages stacked on it.
const FIELD = [[860, 40], [1180, 20], [1240, 120], [1150, 200], [1000, 160], [860, 200]]

// The entrance gate on the plant road (pixels): guard shack and the two barrier arms.
export const ENTRANCE = { shack: [740, 540], barriers: [[640, 556], [640, 576]] }

// ---------- Helpers ----------

const std = (o) => new THREE.MeshStandardMaterial(o)
function shapeOf(points) {
  const s = new THREE.Shape()
  points.forEach(([px, py], i) => {
    const [x, z] = P(px, py)
    if (i) s.lineTo(x, -z)
    else s.moveTo(x, -z)
  })
  s.closePath()
  return s
}
// A flat polygon on the ground at height h, with world-scaled UVs (1 unit = 1 ft).
function groundPoly(points, mat, h, uvScale = 1) {
  const g = new THREE.ShapeGeometry(shapeOf(points))
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale)
  const m = new THREE.Mesh(g, mat)
  m.position.y = h
  m.receiveShadow = true
  return m
}
// A road ribbon along a pixel polyline; v runs along it in feet so lines repeat at real spacing.
function ribbon(points, width, mat, h) {
  const pts = points.map(([px, py]) => new THREE.Vector2(...P(px, py)))
  const pos = []
  const uv = []
  const idx = []
  let dist = 0
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dir = next.clone().sub(prev).normalize()
    const n = new THREE.Vector2(-dir.y, dir.x)
    if (i) dist += pts[i].distanceTo(pts[i - 1])
    const l = pts[i].clone().addScaledVector(n, width / 2)
    const r = pts[i].clone().addScaledVector(n, -width / 2)
    pos.push(l.x, h, l.y, r.x, h, r.y)
    uv.push(0, dist / 40, 1, dist / 40)
    if (i) {
      const a = (i - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat)
  m.receiveShadow = true
  return m
}
function inside([x, y], poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

// ---------- Trees ----------

// A tree crown: a cluster of lumpy spheres, merged, with vertex colors darker underneath (a cheap
// stand-in for the shade inside a real canopy). `kind`: 'broad' (oak / gum) or 'pine'.
function crownGeometry(kind, seed) {
  const rand = rng(seed)
  const parts = []
  const blobs =
    kind === 'pine'
      ? [[0, 0.62, 0, 0.42], [0, 0.82, 0, 0.32], [0, 0.98, 0, 0.2]]
      : [[0, 0.62, 0, 0.42], [0.25, 0.7, 0.1, 0.32], [-0.22, 0.72, -0.12, 0.32], [0.05, 0.86, -0.2, 0.28], [-0.08, 0.84, 0.22, 0.27]]
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i)
      const k = 1 + (rand() - 0.5) * 0.22
      v.multiplyScalar(k)
      p.setXYZ(i, v.x + x, (kind === 'pine' ? v.y * 1.25 : v.y) + y, v.z + z)
    }
    parts.push(g)
  }
  // Shared vertices give smooth shading (no facets); per-vertex brightness gives leaf clumps.
  const merged = mergeVertices(mergeAll(parts.map((g) => mergeVertices(g.deleteAttribute('normal').deleteAttribute('uv')))))
  const p = merged.attributes.position
  const colors = []
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const shade = THREE.MathUtils.clamp(0.42 + (y - 0.3) * 0.95, 0.42, 1.05) * (0.86 + rand() * 0.26)
    colors.push(shade, shade * (0.97 + rand() * 0.06), shade)
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  merged.computeVertexNormals()
  return merged
}
function mergeAll(geos) {
  let count = 0
  const pos = []
  const idx = []
  for (const g of geos) {
    const ng = g.index ? g : g
    const p = ng.attributes.position
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i))
    if (ng.index) for (let i = 0; i < ng.index.count; i++) idx.push(ng.index.getX(i) + count)
    else for (let i = 0; i < p.count; i++) idx.push(i + count)
    count += p.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setIndex(idx)
  return out
}

function plantTrees(root, spots) {
  const kinds = [
    { geo: crownGeometry('broad', 3), colors: ['#5a7a3c', '#4e6d33', '#6b8743', '#5d6f35'] },
    { geo: crownGeometry('broad', 9), colors: ['#617f42', '#53723a', '#768a4a'] },
    { geo: crownGeometry('pine', 5), colors: ['#3f5f34', '#456a3a', '#36532f'] },
  ]
  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.6, 6).translate(0, 0.3, 0)
  const trunkMat = std({ color: '#4d3d2c', roughness: 0.95 })
  const groups = kinds.map(() => [])
  for (const s of spots) groups[s.kind].push(s)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const c = new THREE.Color()
  groups.forEach((list, k) => {
    if (!list.length) return
    const mat = std({ vertexColors: true, roughness: 0.9 })
    const crowns = new THREE.InstancedMesh(kinds[k].geo, mat, list.length)
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length)
    list.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot)
      m4.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.size, s.size * s.tall, s.size))
      crowns.setMatrixAt(i, m4)
      trunks.setMatrixAt(i, m4)
      c.set(kinds[k].colors[i % kinds[k].colors.length]).offsetHSL(0, 0, (s.tone - 0.5) * 0.08)
      crowns.setColorAt(i, c)
    })
    crowns.castShadow = true
    crowns.receiveShadow = true
    trunks.castShadow = true
    root.add(crowns, trunks)
  })
}

// ---------- Cars and parked trailers ----------

const CAR_COLORS = ['#f2f2f0', '#1d2024', '#9aa1a8', '#5e646b', '#7d1d20', '#20364f', '#c8ccd0', '#3a3d41', '#e9e6dd', '#6b6f73', '#24282c', '#b02c26']
function parkCars(root, rand) {
  const cars = []
  for (const row of STALL_ROWS) {
    const [ax, az] = P(...row.from)
    const [bx, bz] = P(...row.to)
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.floor(len / 9.5)
    const dir = new THREE.Vector2(bx - ax, bz - az).normalize()
    const n2 = new THREE.Vector2(-dir.y, dir.x)
    for (let i = 0; i < n; i++) {
      for (const side of [-1, 1]) {
        if (rand() > 0.72) continue
        const t = (i + 0.5) * 9.5
        cars.push({ x: ax + dir.x * t + n2.x * side * 9.5, z: az + dir.y * t + n2.y * side * 9.5, rot: Math.atan2(n2.x, n2.y) + (rand() - 0.5) * 0.08, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)], suv: rand() < 0.35 })
      }
    }
  }
  const body = new RoundedBoxGeometry(6.2, 2.4, 15, 3, 0.9).translate(0, 2.0, 0)
  const cabin = new RoundedBoxGeometry(5.6, 2.0, 8, 3, 0.8).translate(0, 3.7, -0.6)
  const bodyMat = new THREE.MeshPhysicalMaterial({ roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.1 })
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#141a20', roughness: 0.05, metalness: 0.4, clearcoat: 1 })
  const bodies = new THREE.InstancedMesh(body, bodyMat, cars.length)
  const cabins = new THREE.InstancedMesh(cabin, glassMat, cars.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const c = new THREE.Color()
  cars.forEach((car, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.rot)
    m4.compose(new THREE.Vector3(car.x, 0.35, car.z), q, new THREE.Vector3(1, car.suv ? 1.15 : 1, car.suv ? 1.05 : 1))
    bodies.setMatrixAt(i, m4)
    cabins.setMatrixAt(i, m4)
    bodies.setColorAt(i, c.set(car.color))
  })
  bodies.castShadow = cabins.castShadow = true
  bodies.receiveShadow = true
  root.add(bodies, cabins)
}

function parkTrailers(root, rand) {
  const list = []
  for (const row of TRAILER_ROWS) {
    for (let i = 0; i < row.n; i++) {
      const [x, z] = P(row.at[0] + row.step[0] * i, row.at[1] + row.step[1] * i)
      // Heading in image degrees (0 = east, 90 = south) → three's rotation about y.
      const a = THREE.MathUtils.degToRad(row.deg)
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      // Image direction (dx, dy) in three: x ← dy, z ← -dx.
      list.push({ x, z, rot: Math.atan2(dy, -dx) + (rand() - 0.5) * 0.05, tone: rand() })
    }
  }
  const box = new THREE.BoxGeometry(8.6, 9.4, 53).translate(0, 8.9, 0)
  const side = T.genericTrailerTexture()
  const mat = std({ map: side, roughness: 0.5, metalness: 0.2 })
  const trailers = new THREE.InstancedMesh(box, mat, list.length)
  const under = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 2.6, 50).translate(0, 2.4, -1.5), std({ color: '#1e2124', roughness: 0.9 }), list.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const c = new THREE.Color()
  list.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot)
    m4.compose(new THREE.Vector3(t.x, 0.3, t.z), q, new THREE.Vector3(1, 1, 1))
    trailers.setMatrixAt(i, m4)
    under.setMatrixAt(i, m4)
    trailers.setColorAt(i, c.setScalar(0.88 + t.tone * 0.12))
  })
  trailers.castShadow = true
  trailers.receiveShadow = true
  under.castShadow = true
  root.add(trailers, under)
}

// Live-haul cages and pallets scattered on the field.
function fieldClutter(root, rand) {
  const spots = []
  for (let i = 0; i < 140; i++) {
    const px = 960 + rand() * 230
    const py = 100 + rand() * 100
    if (!inside([px, py], FIELD)) continue
    spots.push(P(px, py))
  }
  const geo = new THREE.BoxGeometry(8, 3.5, 3.5).translate(0, 1.75, 0)
  const mesh = new THREE.InstancedMesh(geo, std({ color: '#f1f1ec', roughness: 0.7 }), spots.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  spots.forEach(([x, z], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI)
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1 + Math.floor(rand() * 2), 1))
    mesh.setMatrixAt(i, m4)
  })
  mesh.castShadow = true
  root.add(mesh)
}

// ---------- Buildings ----------

function roofMaterial(kind) {
  if (kind === 'white') return std({ map: T.flatRoofTexture(), roughness: 0.85 })
  if (kind === 'metal') return std({ map: T.metalRoofTexture('#a9afb4'), roughness: 0.45, metalness: 0.55 })
  if (kind === 'dark') return std({ map: T.metalRoofTexture('#5c636a'), roughness: 0.5, metalness: 0.5 })
  return std({ map: T.metalRoofTexture('#6d6157'), roughness: 0.55, metalness: 0.35 })
}

function building(root, b, mats, rand) {
  const shape = shapeOf(b.pts)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  // ExtrudeGeometry groups: 0 = caps (top / bottom), 1 = walls. Wall UVs in feet.
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  const nrm = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i)
    if (Math.abs(ny) > 0.5) uv.setXY(i, pos.getX(i) / 40, pos.getZ(i) / 40)
    else {
      const along = Math.abs(nrm.getX(i)) > Math.abs(nrm.getZ(i)) ? pos.getZ(i) : pos.getX(i)
      uv.setXY(i, along / 24, pos.getY(i) / b.h)
    }
  }
  const wall = b.roof === 'metal' || b.roof === 'dark' ? mats.metalWall : mats.concreteWall
  const m = new THREE.Mesh(geo, [roofMaterial(b.roof), wall])
  m.castShadow = true
  m.receiveShadow = true
  root.add(m)
  // A parapet / coping line along the roof edge.
  const edge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shapeOf(b.pts), { depth: 1.2, bevelEnabled: false }).rotateX(-Math.PI / 2),
    [mats.coping, mats.coping],
  )
  edge.position.y = b.h - 0.6
  edge.scale.set(1, 1, 1)
  if (b.roof === 'white') root.add(edge)
  // Rooftop units on flat roofs.
  if (b.units) {
    const xs = b.pts.map((p) => p[0])
    const ys = b.pts.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs) + 8, Math.max(...xs) - 8, Math.min(...ys) + 8, Math.max(...ys) - 8]
    for (let i = 0; i < b.units; i++) {
      const px = x0 + rand() * (x1 - x0)
      const py = y0 + rand() * (y1 - y0)
      if (!inside([px, py], b.pts)) continue
      const [x, z] = P(px, py)
      const w = 6 + rand() * 8
      const d = 5 + rand() * 6
      const unit = new THREE.Mesh(new RoundedBoxGeometry(w, 3 + rand() * 2.5, d, 2, 0.3), mats.unit)
      unit.position.set(x, b.h + 1.6, z)
      unit.rotation.y = rand() < 0.5 ? 0 : Math.PI / 2
      unit.castShadow = true
      unit.receiveShadow = true
      root.add(unit)
      if (rand() < 0.5) {
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 18), mats.fan)
        fan.position.set(x, b.h + 3.6 + rand(), z)
        root.add(fan)
      }
    }
  }
}

// ---------- Everything ----------

export function buildSite(scene) {
  const root = new THREE.Group()
  scene.add(root)
  const rand = rng(2024)
  const mats = {
    concreteWall: std({ map: T.panelWallTexture('#cfcac0'), roughness: 0.85 }),
    metalWall: std({ map: T.ribbedWallTexture('#a9aeb2'), roughness: 0.55, metalness: 0.35 }),
    coping: std({ color: '#cfd2d4', roughness: 0.5, metalness: 0.3 }),
    unit: std({ color: '#c9cdd0', roughness: 0.45, metalness: 0.5 }),
    fan: std({ color: '#2f353b', roughness: 0.6 }),
  }

  // Ground: grass with dirt, the field, the gravel lots, the asphalt.
  const grass = T.grassTexture()
  grass.repeat.set(1, 1)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), std({ map: grass, roughness: 1 }))
  ground.geometry.attributes.uv.array.forEach((_, i, a) => (a[i] *= 160))
  ground.position.set(300, -0.1, 0)
  ground.receiveShadow = true
  root.add(ground)
  const asphalt = T.asphaltTexture(5)
  asphalt.repeat.set(1, 1)
  const asphaltMat = std({ map: asphalt, roughness: 0.92 })
  root.add(groundPoly(FIELD, std({ map: T.dirtTexture(), roughness: 1 }), 0.01, 60))
  for (const g of GRAVEL) root.add(groundPoly(g, std({ map: T.gravelTexture(), roughness: 1 }), 0.02, 50))
  root.add(groundPoly(YARD, asphaltMat, 0.03, 110))
  for (const a of APRONS) root.add(groundPoly(a, asphaltMat, 0.03, 110))
  for (const p of PARKING) root.add(groundPoly(p, std({ map: T.parkingTexture(), roughness: 0.9 }), 0.03, 110))
  const road2 = std({ map: T.roadTexture(true), roughness: 0.9 })
  const roadPlain = std({ map: T.roadTexture(false), roughness: 0.92 })
  ROADS.forEach((r, i) => {
    const m = ribbon(r.pts, r.w, r.lines === '2lane' ? road2 : roadPlain, 0.06 + i * 0.002)
    root.add(m)
  })

  for (const b of BUILDINGS) building(root, b, mats, rand)

  // Water tank on its stand.
  {
    const [x, z] = P(1225, 162)
    const legs = std({ color: '#7b8287', roughness: 0.4, metalness: 0.7 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 40, 8), legs)
      leg.position.set(x + Math.cos(a) * 18, 20, z + Math.sin(a) * 18)
      leg.castShadow = true
      root.add(leg)
    }
    const tank = new THREE.Mesh(new THREE.SphereGeometry(24, 32, 20), std({ color: '#d9dcde', roughness: 0.35, metalness: 0.6 }))
    tank.scale.y = 0.62
    tank.position.set(x, 54, z)
    tank.castShadow = true
    root.add(tank)
  }

  parkTrailers(root, rand)
  parkCars(root, rand)
  fieldClutter(root, rand)

  // Trees: dense in the woods, a few scattered.
  const spots = []
  for (const poly of WOODS) {
    const xs = poly.map((p) => p[0])
    const ys = poly.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    for (let px = x0; px < x1; px += 17) {
      for (let py = y0; py < y1; py += 17) {
        const jx = px + (rand() - 0.5) * 15
        const jy = py + (rand() - 0.5) * 15
        if (!inside([jx, jy], poly) || rand() < 0.12) continue
        const [x, z] = P(jx, jy)
        spots.push({ x, z, kind: rand() < 0.38 ? 2 : rand() < 0.5 ? 0 : 1, size: 36 + rand() * 30, tall: 0.9 + rand() * 0.5, rot: rand() * 6.28, tone: rand() })
      }
    }
  }
  for (const [px, py] of SCATTER) {
    const [x, z] = P(px, py)
    spots.push({ x, z, kind: rand() < 0.5 ? 0 : 1, size: 32 + rand() * 18, tall: 1, rot: rand() * 6.28, tone: rand() })
  }
  plantTrees(root, spots)

  // Light poles around the yard and the parking lot.
  const poleMat = std({ color: '#7e868d', roughness: 0.4, metalness: 0.7 })
  for (const [px, py] of [[660, 300], [660, 420], [700, 520], [600, 650], [700, 650], [600, 760], [700, 760], [860, 700], [960, 780]]) {
    const [x, z] = P(px, py)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 30, 10), poleMat)
    pole.position.set(x, 15, z)
    pole.castShadow = true
    root.add(pole)
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 1.4), std({ color: '#30363c', emissive: '#ffe2a8', emissiveIntensity: 0 }))
    head.position.set(x, 30, z)
    head.userData.lamp = true
    root.add(head)
  }

  return { root }
}

// Where the default view and the camera's pan limits should stay (three coordinates).
export const SITE_BOUNDS = (() => {
  const [x0, z0] = P(150, 900)
  const [x1, z1] = P(1350, 0)
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) }
})()

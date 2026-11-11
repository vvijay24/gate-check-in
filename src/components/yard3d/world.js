// The working yard inside the plant (site.js builds the plant around it): the painted yard markings,
// the six dock doors on the dock building's west wall, the guard shack and barrier arms at the
// entrance, the night lighting, and the sun and sky.
// Coordinates: the yard's world units (feet) with three's Y up, so a yard point (x, y, z) — x along
// the dock wall, y out from it, z up — sits at three (x, z, y).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { DOCKS } from '../../yard'
import { LOT_D, LOT_W, colWX } from '../YardScene'
import { ENTRANCE, P, buildSite } from './site'
import * as T from './textures'

export const BUILDING = { x: 4, y: -40, w: 172, d: 40, h: 28 }

const std = (o) => new THREE.MeshStandardMaterial(o)

function mesh(geo, mat, { x = 0, y = 0, z = 0, cast = false, receive = false, ry = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}
// A box from yard bounds: x0..x1 along the dock wall, y0..y1 out from it, z0..z1 up.
function box(mat, x0, x1, y0, y1, z0, z1, opts) {
  return mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), mat, { x: (x0 + x1) / 2, y: (z0 + z1) / 2, z: (y0 + y1) / 2, ...opts })
}
function flat(mat, x0, x1, y0, y1, h = 0, opts = {}) {
  const m = mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mat, { x: (x0 + x1) / 2, y: h, z: (y0 + y1) / 2, ...opts })
  m.rotation.x = -Math.PI / 2
  return m
}

export function buildWorld(scene) {
  const site = buildSite(scene)
  const root = new THREE.Group()
  scene.add(root)
  const lit = []

  // Yard markings (dock and bay lines, bay names, lane arrows) over the yard asphalt.
  const marks = flat(
    new THREE.MeshStandardMaterial({ map: T.lotTexture(), transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    0,
    LOT_W,
    0,
    LOT_D,
    0.05,
    { receive: true },
  )
  marks.renderOrder = 1
  root.add(marks)

  // Dock doors: seal, door (closed slats or the open dark bay), bumpers, leveler lip, number plate, light.
  const front = 0
  const doorMat = std({ map: T.doorTexture(), roughness: 0.6, metalness: 0.2 })
  const seal = std({ color: '#1c1f23', roughness: 0.95 })
  const bumper = std({ color: '#141619', roughness: 0.8 })
  const steel = std({ color: '#8b939a', roughness: 0.45, metalness: 0.6 })
  const canopy = std({ color: '#3a434c', roughness: 0.5, metalness: 0.5 })
  root.add(box(canopy, 2, LOT_W - 2, front, front + 7, 19.2, 20, { cast: true }))
  // Mirrored along the dock wall (see Yard3D): dock DOCKS[i] is the door at column n-1-i.
  const doors = DOCKS.map((d, i) => {
    const cx = colWX(DOCKS.length - 1 - i)
    const darkBay = std({ color: '#1a1f25', roughness: 1, emissive: '#ffcf8a', emissiveIntensity: 0 })
    root.add(box(seal, cx - 5.6, cx + 5.6, front, front + 1.2, 3.8, 15.6, { cast: true }))
    const closed = box(doorMat, cx - 4.8, cx + 4.8, front + 1.21, front + 1.25, 4.6, 14.8)
    const open = box(darkBay, cx - 4.8, cx + 4.8, front + 1.21, front + 1.25, 4.6, 14.8)
    root.add(closed, open)
    root.add(box(bumper, cx - 5.4, cx - 4.2, front, front + 1.6, 2.6, 4.2))
    root.add(box(bumper, cx + 4.2, cx + 5.4, front, front + 1.6, 2.6, 4.2))
    root.add(box(steel, cx - 3.6, cx + 3.6, front, front + 1.4, 3.7, 4.0))
    root.add(box(std({ map: T.plateTexture(d), roughness: 0.5 }), cx - 2.4, cx + 2.4, front, front + 0.15, 15.8, 18.8))
    const lamp = new THREE.MeshStandardMaterial({ color: '#3b4046', emissive: '#ffd27a', emissiveIntensity: 0 })
    root.add(box(lamp, cx + 5.8, cx + 7.2, front, front + 0.9, 16.4, 17.2))
    lit.push(lamp, darkBay)
    return { d, closed, open }
  })

  // Entrance: guard shack and the barrier arms on the plant road.
  {
    const [sx, sz] = P(...ENTRANCE.shack)
    const walls = std({ color: '#eef0f1', roughness: 0.7 })
    const g = new THREE.Group()
    g.add(mesh(new THREE.BoxGeometry(12, 4, 10), walls, { y: 2, cast: true, receive: true }))
    const glass = new THREE.MeshStandardMaterial({ color: '#2d3a47', roughness: 0.05, metalness: 0.7, emissive: '#ffe0a0', emissiveIntensity: 0 })
    lit.push(glass)
    g.add(mesh(new THREE.BoxGeometry(11.6, 3.6, 9.6), glass, { y: 5.8 }))
    g.add(mesh(new THREE.BoxGeometry(12, 1.4, 10), walls, { y: 8.3 }))
    g.add(mesh(new RoundedBoxGeometry(15, 0.9, 13, 2, 0.3), std({ color: '#2f3740', roughness: 0.6 }), { y: 9.4, cast: true }))
    g.position.set(sx, 0, sz)
    root.add(g)
    const yellow = std({ color: '#f2b705', roughness: 0.5 })
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 32
    const x2 = c.getContext('2d')
    for (let i = 0; i < 256; i += 32) {
      x2.fillStyle = (i / 32) % 2 ? '#ffffff' : '#d1342a'
      x2.fillRect(i, 0, 32, 32)
    }
    const stripes = new THREE.CanvasTexture(c)
    stripes.colorSpace = THREE.SRGBColorSpace
    const armMat = std({ map: stripes, roughness: 0.5 })
    for (const [px, py] of ENTRANCE.barriers) {
      const [x, z] = P(px, py)
      root.add(mesh(new THREE.BoxGeometry(1.6, 4.4, 1.6), yellow, { x, y: 2.2, z: z + 9, cast: true }))
      root.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 18), armMat, { x, y: 4.2, z, cast: true, ry: Math.PI / 2 }))
    }
  }

  // Night light: soft additive pools on the ground under the lamps (cheaper than real lights, which
  // every surface would pay for even by day).
  const poolTex = T.glowTexture()
  const pool = (x, z, r, color) => {
    const m = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    const p = mesh(new THREE.PlaneGeometry(r * 2, r * 2), m, { x, y: 0.4, z })
    p.rotation.x = -Math.PI / 2
    p.renderOrder = 2
    root.add(p)
    return m
  }
  const pools = []
  for (const [px, py] of [[660, 300], [660, 420], [700, 520], [600, 650], [700, 650], [600, 760], [700, 760], [860, 700], [960, 780]]) pools.push(pool(...P(px, py), 70, '#ffcf8f'))
  pools.push(pool(...P(...ENTRANCE.shack), 40, '#ffd9a0'))
  const dockPools = DOCKS.map((_, i) => pool(colWX(i), front + 14, 30, '#ffc677'))
  site.root.traverse((o) => o.userData.lamp && lit.push(o.material))

  // Sun (its shadow box follows the view, see aimSun) and sky fill.
  const hemi = new THREE.HemisphereLight('#dfe9f3', '#5f6652', 1.05)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff3df', 2.7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0003
  sun.shadow.normalBias = 0.8
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 1800
  scene.add(sun, sun.target)

  return { root, doors, lit, pools, dockPools, hemi, sun }
}

// Keeps the sun's shadow box around what the camera looks at, sized to the view.
const SUN_DIR = new THREE.Vector3(0.66, 0.46, -0.5).normalize()
export function aimSun(world, target, span) {
  const s = THREE.MathUtils.clamp(span, 160, 1400)
  world.sun.position.copy(target).addScaledVector(SUN_DIR, 800)
  world.sun.target.position.copy(target)
  const c = world.sun.shadow.camera
  c.left = -s
  c.right = s
  c.top = s
  c.bottom = -s
  c.updateProjectionMatrix()
}

// Day / night: `night` 0 (day) … 1 (night), `warm` near sunrise / sunset.
export function setDaylight(world, scene, renderer, { night, warm }) {
  const day = 1 - night
  const bg = new THREE.Color('#cdd9e4').lerp(new THREE.Color('#efc39c'), warm * 0.55).lerp(new THREE.Color('#0d1730'), night)
  scene.background = bg
  if (scene.fog) scene.fog.color.copy(bg)
  world.hemi.intensity = 0.28 + 0.42 * day
  world.hemi.color.set(night > 0.5 ? '#7d8fb8' : '#dfe9f3')
  world.sun.intensity = 0.2 + 3.1 * day
  world.sun.color.set(night > 0.5 ? '#9fb3ff' : warm > 0.3 ? '#ffc58f' : '#ffeed6')
  for (const m of world.lit) m.emissiveIntensity = night * 1.6
  for (const m of world.pools) m.opacity = night * 0.5
  for (const m of world.dockPools) m.opacity = night * 0.6
  renderer.toneMappingExposure = 0.82 + night * 0.25
}

export function setDoors(world, occupied) {
  for (const d of world.doors) {
    const open = occupied.has(d.d)
    d.closed.visible = !open
    d.open.visible = open
  }
}

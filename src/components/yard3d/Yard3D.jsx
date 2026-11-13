// The live yard in 3D: the fixed world (world.js), one rig per truck (rig.js) posed by the same motion
// engine as the 2D map, status pads on the ground, and HTML labels that follow the trucks on screen
// (crisp at any zoom, tappable, readable by screen readers). Drag to orbit, pinch or scroll to zoom,
// right-drag or two fingers to pan; the buttons zoom and reset the view. If WebGL isn't available,
// `fallback` (the 2D map) is shown instead.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Minus, Moon, Plus, RotateCcw, Sun, Sunrise } from 'lucide-react'
import { DOCKS } from '../../yard'
import { LOT_D, LOT_W, RIG_L, colWX } from '../YardScene'
import { clockTime } from '../../time'
import { aimSun, buildWorld, setDaylight, setDoors, BUILDING } from './world'
import { ENTRANCE, P, SITE_BOUNDS } from './site'
import { lightRig, makeRig, poseRig } from './rig'
import { glowTexture } from './textures'

// The yard is drawn mirrored along the dock wall: at the real plant trucks come in from the south
// gate, which is the motion engine's far end. A mirrored maneuver is just as valid (it turns the other
// way), so poses are reflected here and the docks, bays and markings are numbered to match.
const mx = (x) => LOT_W - x
const mirrorPose = (pose) => ({
  ...pose,
  cx: mx(pose.cx),
  art: { K: [mx(pose.art.K[0]), pose.art.K[1]], tt: Math.PI - pose.art.tt, tr: Math.PI - pose.art.tr },
  lights: pose.lights && { ...pose.lights, left: pose.lights.right, right: pose.lights.left },
})
const dockX = (d) => colWX(DOCKS.length - 1 - DOCKS.indexOf(d))

const css = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// The default camera: looking at the lot from the street side, a little from the right.
const TARGET = new THREE.Vector3(LOT_W / 2, 0, (LOT_D + BUILDING.y + 28) / 2)
const POLAR = 0.78
const AZIMUTH = 0.86
// What the default view must show: the yard and its dock wall, with some of the plant around it.
const BOUNDS = [-24, LOT_W + 40, BUILDING.y + 10, LOT_D + 30, 0, 6]

function frameGeometry(w, l, t) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, -l / 2)
  s.lineTo(w / 2, -l / 2)
  s.lineTo(w / 2, l / 2)
  s.lineTo(-w / 2, l / 2)
  s.closePath()
  const h = new THREE.Path()
  h.moveTo(-w / 2 + t, -l / 2 + t)
  h.lineTo(-w / 2 + t, l / 2 - t)
  h.lineTo(w / 2 - t, l / 2 - t)
  h.lineTo(w / 2 - t, -l / 2 + t)
  h.closePath()
  s.holes.push(h)
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  return g
}

const flatMat = (color, opacity) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })

// The renderer behind the component: owns the three.js scene and draws it each frame.
class YardView {
  constructor(host) {
    this.host = host
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'absolute inset-0 h-full w-full touch-none select-none'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.prepend(renderer.domElement)
    this.renderer = renderer

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog('#cfdbe6', 1600, 5200)
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.35
    pmrem.dispose()
    this.scene = scene
    this.world = buildWorld(scene)

    this.camera = new THREE.PerspectiveCamera(30, 1, 5, 9000)
    // Ambient occlusion (soft contact shadows where things meet) through a post-processing pass,
    // multisampled for clean edges. Weak devices drop it first (see tick).
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType })
    this.composer = new EffectComposer(renderer, target)
    this.composer.addPass(new RenderPass(scene, this.camera))
    this.ao = new GTAOPass(scene, this.camera, 1, 1)
    this.ao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.4, thickness: 4, scale: 1.1, samples: 12 })
    this.ao.blendIntensity = 0.85
    this.composer.addPass(this.ao)
    this.composer.addPass(new OutputPass())
    this.useComposer = true
    const controls = new OrbitControls(this.camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.09
    controls.screenSpacePanning = false
    controls.minPolarAngle = 0.12
    controls.maxPolarAngle = 1.22
    controls.minAzimuthAngle = -Infinity
    controls.maxAzimuthAngle = Infinity
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    controls.addEventListener('change', () => {
      const t = controls.target
      t.x = THREE.MathUtils.clamp(t.x, SITE_BOUNDS.x0, SITE_BOUNDS.x1)
      t.z = THREE.MathUtils.clamp(t.z, SITE_BOUNDS.z0, SITE_BOUNDS.z1)
      t.y = 0
      this.dirty = true
    })
    this.controls = controls

    // Status colors from the app's tokens.
    this.colors = {
      dock: css('--color-delivery', '#1f6fb2'),
      ready: css('--color-ok', '#2b7d52'),
      waiting: css('--color-warn', '#f59e0b'),
      drop: css('--color-drop', '#7a4fa0'),
      departed: '#9aa3ab',
      signal: css('--color-signal', '#2563eb'),
      danger: css('--color-danger', '#b3261e'),
      warnLine: css('--color-warn-line', '#b45309'),
    }
    this.glowTex = glowTexture()
    this.rigs = new Map()
    this.frames = new Map()

    // Free-dock targets (Shipping assigns by tapping one).
    this.dockTargets = DOCKS.map((d, i) => {
      const g = new THREE.Group()
      const cx = dockX(d)
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(13, 50).rotateX(-Math.PI / 2), flatMat(this.colors.signal, 0.22))
      const edge = new THREE.Mesh(frameGeometry(13, 50, 0.9), flatMat(this.colors.signal, 0.9))
      g.add(fill, edge)
      g.position.set(cx, 0.1, RIG_L / 2 + 0.6)
      g.visible = false
      fill.userData.dock = d
      scene.add(g)
      return { d, g, fill, edge }
    })

    this.anchors = new Map()
    this.labelEls = new Map()
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.state = {}
    this.dirty = true
    this.fitted = false
    this.lastRender = 0
    this.bindPointer()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.tick = this.tick.bind(this)
    this.raf = requestAnimationFrame(this.tick)
    if (window.__yardStill) window.__yardView = this
  }

  // Camera distance that fits the site in view at the default angle, then centered on screen.
  fit() {
    const dir = new THREE.Vector3(Math.sin(POLAR) * Math.sin(AZIMUTH), Math.cos(POLAR), Math.sin(POLAR) * Math.cos(AZIMUTH))
    const [x0, x1, y0, y1, z0, z1] = BOUNDS
    const corners = []
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) corners.push(new THREE.Vector3(x, z, y))
    const cam = this.camera
    const target = TARGET.clone()
    const place = (dist) => {
      cam.position.copy(target).addScaledVector(dir, dist)
      cam.lookAt(target)
      cam.updateMatrixWorld()
    }
    const extent = () => {
      let [ax, bx, ay, by] = [Infinity, -Infinity, Infinity, -Infinity]
      for (const c of corners) {
        const p = c.clone().project(cam)
        ax = Math.min(ax, p.x)
        bx = Math.max(bx, p.x)
        ay = Math.min(ay, p.y)
        by = Math.max(by, p.y)
      }
      return [ax, bx, ay, by]
    }
    let dist = 400
    for (let pass = 0; pass < 3; pass++) {
      let lo = 40
      let hi = 2400
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2
        place(mid)
        const [ax, bx, ay, by] = extent()
        if (bx - ax < 1.94 && by - ay < 1.9) hi = mid
        else lo = mid
      }
      dist = hi
      place(dist)
      // Shift the target so the site's on-screen box is centered.
      const [ax, bx, ay, by] = extent()
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
      const shift = right.multiplyScalar(((ax + bx) / 2) * halfH * cam.aspect).add(up.multiplyScalar(((ay + by) / 2) * halfH))
      // Keep the target on the ground: move along the ground plane only.
      shift.y = 0
      target.add(shift)
    }
    place(dist)
    this.fitDistance = dist
    this.controls.target.copy(target)
    this.controls.minDistance = 60
    this.controls.maxDistance = Math.max(dist * 4.5, 2600)
    this.controls.update()
    this.dirty = true
  }

  resize() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.size = [w, h]
    if (!this.fitted) {
      this.fit()
      this.fitted = true
    }
    this.dirty = true
  }

  zoom(f) {
    const c = this.controls
    const off = this.camera.position.clone().sub(c.target).multiplyScalar(f)
    const len = THREE.MathUtils.clamp(off.length(), c.minDistance, c.maxDistance)
    this.camera.position.copy(c.target).add(off.setLength(len))
    c.update()
  }

  bindPointer() {
    const el = this.renderer.domElement
    let down = null
    const pick = (ev) => {
      const r = el.getBoundingClientRect()
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      this.raycaster.setFromCamera(this.pointer, this.camera)
      const targets = [...this.rigs.values()].filter((r) => r.hit.visible).map((r) => r.hit)
      for (const t of this.dockTargets) if (t.g.visible) targets.push(t.fill)
      const hit = this.raycaster.intersectObjects(targets, false)[0]
      return hit?.object.userData ?? null
    }
    this.onDown = (ev) => {
      down = { x: ev.clientX, y: ev.clientY, t: performance.now() }
    }
    this.onUp = (ev) => {
      if (!down) return
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y)
      const quick = performance.now() - down.t < 600
      down = null
      if (moved > 6 || !quick) return
      const hit = pick(ev)
      if (hit?.dock != null) this.state.onDockTap?.(hit.dock)
      else if (hit?.id) this.state.onSelect?.(hit.id)
    }
    this.onMove = (ev) => {
      if (ev.pointerType !== 'mouse' || down) return
      const hit = pick(ev)
      const id = hit?.id ?? null
      el.style.cursor = hit ? 'pointer' : 'grab'
      if (id !== this.hoverFromCanvas) {
        this.hoverFromCanvas = id
        this.state.onHover?.(id)
      }
    }
    this.onLeave = () => {
      if (this.hoverFromCanvas) {
        this.hoverFromCanvas = null
        this.state.onHover?.(null)
      }
    }
    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerleave', this.onLeave)
  }

  // Ground pad, outline, detention glow and an invisible hit box for one rig.
  makeDecor(drop) {
    const len = drop ? 37.6 : 50.6
    const g = new THREE.Group()
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(13, len).rotateX(-Math.PI / 2), flatMat('#ffffff', 0.32))
    const edge = new THREE.Mesh(frameGeometry(13, len, 0.8), flatMat('#ffffff', 0))
    const glowMat = new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#ff0000', transparent: true, opacity: 0, depthWrite: false })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(26, len + 18).rotateX(-Math.PI / 2), glowMat)
    glow.position.y = -0.02
    const hit = new THREE.Mesh(new THREE.BoxGeometry(13, 16, len), new THREE.MeshBasicMaterial({ visible: false }))
    hit.position.y = 8
    g.add(glow, pad, edge, hit)
    g.position.y = 0.09
    this.scene.add(g)
    return { g, pad, edge, glow, hit, len }
  }

  // Sync with React: trucks, their pads, doors, daylight, targets.
  update(state) {
    this.state = state
    const { units, occupied, sky, dockTargets } = state
    const seen = new Set()
    for (const raw of units) {
      const u = { ...raw, pose: mirrorPose(raw.pose) }
      const key = u.key
      seen.add(key)
      const parked = !u.driving
      const drop = u.drop && parked
      const spec = `${u.e.truckName}|${u.e.trailerNumber}|${u.e.reefer}|${drop}`
      let r = this.rigs.get(key)
      if (r && r.spec !== spec) {
        this.removeRig(key)
        r = null
      }
      if (!r) {
        const rig = makeRig({ carrier: u.e.truckName, trailerNumber: u.e.trailerNumber, reefer: u.e.reefer === 'Yes', drop })
        this.scene.add(rig.root)
        const decor = this.makeDecor(drop)
        r = { rig, spec, ...decor }
        this.rigs.set(key, r)
      }
      poseRig(r.rig, u.pose.art)
      r.rig.root.visible = (u.pose.opacity ?? 1) > 0.05
      r.unit = u
      // Pads only under parked rigs; centered on the spot (rigs park facing the street).
      const showPad = parked
      r.g.visible = showPad
      r.hit.visible = showPad
      r.hit.userData.id = u.e.id
      if (showPad) r.g.position.set(u.pose.cx, 0.09, u.pose.cy + (drop ? -6.1 : 0.4))
      r.pad.material.color.set(u.on ? this.colors.signal : this.colors[u.status] ?? '#ffffff')
      r.baseOpacity = u.off ? 0.12 : u.on ? 0.42 : 0.3
      r.glow.material.color.set(u.warn === 'over' ? this.colors.danger : this.colors.warnLine)
      // Label anchor: above the middle of the trailer.
      if (parked) this.anchors.set(u.e.id, new THREE.Vector3(u.pose.cx, 17.5, u.pose.cy - (drop ? 10 : 6)))
      else this.anchors.delete(u.e.id)
    }
    for (const key of [...this.rigs.keys()]) if (!seen.has(key)) this.removeRig(key)
    setDoors(this.world, occupied)
    setDaylight(this.world, this.scene, this.renderer, sky)
    this.night = sky.night
    for (const t of this.dockTargets) {
      t.g.visible = Boolean(dockTargets?.has(t.d)) && !occupied.has(t.d)
      this.anchors.set(`dock-${t.d}`, new THREE.Vector3(dockX(t.d), 2, 30))
    }
    ENTRANCE.barriers.forEach((b, i) => {
      const [x, z] = P(b[0] - 20, b[1] + (i ? 12 : -12))
      this.anchors.set(`gate-${i}`, new THREE.Vector3(x, 0.5, z))
    })
    const [sx, sz] = P(...ENTRANCE.shack)
    this.anchors.set('shack', new THREE.Vector3(sx, 13, sz))
    this.dirty = true
  }

  removeRig(key) {
    const r = this.rigs.get(key)
    if (!r) return
    this.scene.remove(r.rig.root, r.g)
    r.rig.dispose()
    r.g.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
    this.rigs.delete(key)
  }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick)
    if (document.hidden || !this.size) return
    const moved = this.controls.update()
    if (moved || !this.sunAimed) {
      aimSun(this.world, this.controls.target, this.camera.position.distanceTo(this.controls.target) * 0.55)
      this.sunAimed = true
    }
    const t = now / 1000
    const { selectedId, hoverId, motion } = this.state
    let pulsing = false
    let driving = false
    for (const r of this.rigs.values()) {
      const u = r.unit
      if (!u) continue
      if (u.driving) driving = true
      lightRig(r.rig, u.pose.lights, t, this.night ?? 0, u.driving)
      const sel = u.e.id === selectedId
      const hov = u.e.id === hoverId
      const wave = motion ? 0.5 + 0.5 * Math.sin(t * (u.warn === 'over' ? 3.9 : 2.4)) : 0.6
      r.glow.material.opacity = u.warn && !u.driving ? 0.25 + 0.5 * wave : 0
      r.pad.material.opacity = sel ? 0.5 : hov ? 0.42 : r.baseOpacity
      const ringOn = sel || hov || u.on
      r.edge.material.color.set(sel || u.on ? this.colors.signal : '#ffffff')
      r.edge.material.opacity = ringOn ? (sel ? 0.65 + 0.35 * (motion ? 0.5 + 0.5 * Math.sin(t * 4) : 1) : 0.85) : 0
      if (u.warn || sel || u.on || u.pose.lights) pulsing = true
    }
    for (const d of this.dockTargets) {
      if (!d.g.visible) continue
      pulsing = true
      d.fill.material.opacity = 0.14 + 0.16 * (0.5 + 0.5 * Math.sin(t * 3.2))
    }
    // Full frame rate while something moves; pulses alone at about 30 fps; otherwise only when needed.
    const busy = moved || driving || this.dirty
    // Tests (and screenshots) set window.__yardStill: draw only when something changed.
    if (window.__yardStill && !moved && !this.dirty) return
    if (!busy && !(pulsing && now - this.lastRender > 33)) return
    // Weak devices: when frames keep coming slowly, draw at a lower resolution, then without shadows.
    if (!window.__yardStill && this.lastRender && now - this.lastRender < 250) {
      this.slow = (this.slow ?? 0) * 0.9 + (now - this.lastRender > 45 ? 0.1 : 0)
      if (this.slow > 0.6 && (this.quality ?? 0) < 3) {
        this.quality = (this.quality ?? 0) + 1
        this.slow = 0
        const ratio = [Math.min(window.devicePixelRatio || 1, 2), 1.25, 1, 0.75][this.quality]
        // Step 1 drops ambient occlusion; then resolution; last, shadows.
        if (this.quality === 1) this.useComposer = false
        this.renderer.setPixelRatio(ratio)
        this.renderer.setSize(this.size[0], this.size[1], false)
        this.composer.setPixelRatio(ratio)
        this.composer.setSize(this.size[0], this.size[1])
        if (this.quality === 3) {
          this.renderer.shadowMap.enabled = false
          this.scene.traverse((o) => o.material && (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)))
        }
      }
    }
    this.dirty = false
    this.lastRender = now
    if (this.useComposer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
    this.placeLabels()
  }

  placeLabels() {
    const [w, h] = this.size
    const v = new THREE.Vector3()
    for (const [id, el] of this.labelEls) {
      const a = this.anchors.get(id)
      if (!a || !el) continue
      v.copy(a).project(this.camera)
      const off = v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15
      el.style.visibility = off ? 'hidden' : 'visible'
      if (off) continue
      const x = ((v.x + 1) / 2) * w
      const y = ((1 - v.y) / 2) * h
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      if (!el.dataset.lift) el.style.zIndex = String(Math.round(y))
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onDown)
    el.removeEventListener('pointerup', this.onUp)
    el.removeEventListener('pointermove', this.onMove)
    el.removeEventListener('pointerleave', this.onLeave)
    this.controls.dispose()
    for (const key of [...this.rigs.keys()]) this.removeRig(key)
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of ms) {
        if (m.map) m.map.dispose()
        m.dispose()
      }
    })
    this.composer.dispose()
    this.renderer.dispose()
    el.remove()
  }
}

// Fonts the canvas textures use, loaded before the world is painted (or after a short wait).
const fontsReady = () =>
  Promise.race([
    Promise.all(['700 40px "Barlow Condensed"', '600 20px "Instrument Sans"'].map((f) => document.fonts?.load(f) ?? Promise.resolve())),
    new Promise((r) => setTimeout(r, 1500)),
  ])

const STATUS_DOT = {
  waiting: 'bg-warn',
  dock: 'bg-delivery',
  ready: 'bg-ok',
  drop: 'bg-drop',
  departed: 'bg-line',
}

// `units`: [{ key, e, pose, driving, drop, status, statusLabel, alert, warn, on, off, focusText,
// atDockFor, ariaLabel }]. `onSelect(id)` / `onHover(id)` for parked trucks; `dockTargets` (Set) with
// `onDockTap(d)` lights up free docks to tap.
export default function Yard3D({ units, occupied, sky, clock, selectedId, hoverId, onSelect, onHover, dockTargets, onDockTap, gateCounts, gates, motion, fallback }) {
  const host = useRef(null)
  const view = useRef(null)
  const labelEls = useRef(new Map())
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (window.__yard2d) return
    let alive = true
    let v = null
    fontsReady().then(() => {
      if (!alive || !host.current) return
      try {
        v = new YardView(host.current)
        v.labelEls = labelEls.current
        view.current = v
        setReady(true)
      } catch (err) {
        console.warn('3D yard unavailable, showing the 2D map', err)
        setFailed(true)
      }
    })
    return () => {
      alive = false
      v?.dispose()
      view.current = null
    }
  }, [])

  useEffect(() => {
    view.current?.update({ units, occupied, sky, selectedId, hoverId, onSelect, onHover, dockTargets, onDockTap, motion })
  })

  // Tests that exercise the app's logic set window.__yard2d to use the flat map (faster to draw).
  if (failed || window.__yard2d) return fallback ?? null

  const ref = (id) => (el) => {
    if (el) labelEls.current.set(id, el)
    else labelEls.current.delete(id)
  }
  const parked = units.filter((u) => !u.driving)
  const liftedId = hoverId ?? selectedId
  const anyLift = parked.some((u) => u.e.id === hoverId || u.e.id === selectedId)
  const SkyIcon = sky.phase === 'Night' ? Moon : sky.phase === 'Day' ? Sun : Sunrise

  return (
    <div ref={host} className="yard3d absolute inset-0 overflow-hidden" data-ready={ready || undefined}>
      {!ready && <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-[#dfe7ee] to-[#c9d3cf]" aria-hidden="true" />}
      <div className="pointer-events-none absolute inset-0">
        {parked.map((u) => {
          const lift = u.e.id === hoverId || u.e.id === selectedId
          return (
            <button
              key={u.e.id}
              ref={ref(u.e.id)}
              type="button"
              data-lift={lift || undefined}
              aria-label={u.ariaLabel}
              aria-pressed={u.e.id === selectedId}
              onClick={() => onSelect?.(u.e.id)}
              onPointerEnter={() => onHover?.(u.e.id)}
              onPointerLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(u.e.id)}
              onBlur={() => onHover?.(null)}
              style={{ zIndex: lift ? 2000 + (u.e.id === liftedId ? 1 : 0) : undefined, visibility: 'hidden' }}
              className={
                'yard-label pointer-events-auto absolute top-0 left-0 flex cursor-pointer flex-col items-center gap-1 transition-opacity duration-150 ' +
                (anyLift && !lift ? 'opacity-55 ' : '') +
                (u.off ? 'opacity-40 ' : '')
              }
            >
              <span className={'flex flex-col items-center gap-1 transition-transform duration-150 [translate:-50%_-100%] ' + (lift ? 'scale-[1.12]' : '')} style={{ transformOrigin: '50% 100%' }}>
                {u.focusText && (
                  <span className="rounded-full bg-warn px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap text-warn-ink shadow-[0_2px_8px_rgb(15_23_42/0.18)]">
                    {u.focusText}
                  </span>
                )}
                <span
                  className={
                    'flex items-center gap-1.5 rounded-full border bg-panel/95 py-1 pr-2.5 pl-1.5 whitespace-nowrap shadow-[0_4px_14px_-4px_rgb(15_23_42/0.35)] backdrop-blur ' +
                    (lift ? 'border-signal ring-2 ring-signal/30' : 'border-line')
                  }
                >
                  <i aria-hidden="true" className={'h-2.5 w-2.5 shrink-0 rounded-full ' + (STATUS_DOT[u.status] ?? 'bg-line')} />
                  <b className="text-[12.5px] leading-none font-semibold text-ink">{u.e.trailerNumber || '—'}</b>
                  {lift && u.e.truckName && <span className="text-[11.5px] leading-none text-muted">{u.e.truckName}</span>}
                  {(lift || u.on) && u.atDockFor && <span className="text-[11.5px] leading-none font-medium text-muted">· {u.atDockFor}</span>}
                  {u.alert && (
                    <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                      !
                    </span>
                  )}
                </span>
                <i aria-hidden="true" className="h-2 w-px bg-ink/40" />
              </span>
            </button>
          )
        })}
        {DOCKS.map((d) => {
          if (occupied.has(d)) return null
          const target = dockTargets?.has(d)
          if (!target) return null
          return (
            <div key={d} ref={ref(`dock-${d}`)} className="absolute top-0 left-0" style={{ visibility: 'hidden', zIndex: target ? 1500 : 1 }}>
              {target && (
                <button
                  type="button"
                  onClick={() => onDockTap?.(d)}
                  className="dock-target pointer-events-auto block min-h-10 cursor-pointer rounded-full bg-signal px-3.5 text-[13px] font-semibold whitespace-nowrap text-signal-ink shadow-[0_6px_18px_-6px_rgb(33_86_232/0.7)] [translate:-50%_-50%] hover:bg-signal-line"
                >
                  Assign to Dock {d}
                </button>
              )}
            </div>
          )
        })}
        {gates.map((g, i) => {
          const c = gateCounts?.[g] ?? { in: 0, out: 0 }
          return (
            <div key={g} ref={ref(`gate-${i}`)} className="absolute top-0 left-0" style={{ visibility: 'hidden', zIndex: 1 }}>
              <span className="flex flex-col items-center rounded-xl border border-line bg-panel/95 px-3 py-1 text-center whitespace-nowrap shadow-[0_4px_14px_-6px_rgb(15_23_42/0.3)] [translate:-50%_-50%]">
                <b className="text-[12px] leading-tight font-semibold">
                  {g} · {i === 0 ? 'In' : 'Out'}
                </b>
                <span className="text-[11px] leading-tight text-muted">
                  {c.in} in · {c.out} out
                </span>
              </span>
            </div>
          )
        })}
        <div ref={ref('shack')} className="absolute top-0 left-0" style={{ visibility: 'hidden', zIndex: 1 }}>
          <span className="block rounded-md bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white [translate:-50%_-100%]">Guard</span>
        </div>
      </div>
      <div className="pointer-events-none absolute top-2.5 left-2.5 z-[2100] flex items-center gap-2 rounded-full border border-line bg-panel/90 py-1 pr-3 pl-2 text-[12.5px] font-semibold shadow-[0_2px_10px_-4px_rgb(15_23_42/0.25)] backdrop-blur">
        <SkyIcon size={15} strokeWidth={2} className={sky.phase === 'Night' ? 'text-ink' : 'text-warn-line'} aria-hidden="true" />
        {sky.phase} · {clockTime(clock)}
      </div>
      <div className="absolute right-2.5 bottom-2.5 z-[2100] flex flex-col overflow-hidden rounded-xl border border-line bg-panel/90 shadow-[0_4px_14px_-6px_rgb(15_23_42/0.3)] backdrop-blur">
        {[
          ['Zoom in', Plus, () => view.current?.zoom(0.78)],
          ['Zoom out', Minus, () => view.current?.zoom(1.28)],
          ['Reset view', RotateCcw, () => view.current?.fit()],
        ].map(([label, Icon, run]) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={run} className="flex h-10 w-10 cursor-pointer items-center justify-center text-ink hover:bg-field">
            <Icon size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}

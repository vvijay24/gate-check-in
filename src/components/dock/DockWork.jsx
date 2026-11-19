import { useEffect, useMemo, useState } from 'react'
import * as ui from '../../ui'
import { Icon } from '../../icons'
import { clockTime, duration } from '../../time'
import { DOCKS } from '../../yard'
import { isDrop } from '../../metrics'
import { atDockNow, awaitingRelease, inYard, isReleased } from '../../handoff'
import { STAGES, currentStage, toneOf } from '../../stages'
import { dockKey } from '../AssignDock'
import { LiveYard, phaseOf } from '../Dashboard'
import LiveYardCard from '../LiveYardCard'
import ReleaseDialog from '../ReleaseDialog'
import { LoadCheckSheet, TrailerCheckSheet, hasDraft, recentTechnicians } from '../LoadingInspection'

// The Loading & Inspection tab, for the loading crew and the QA inspector, each on their own tablet.
// First "Who is using this tablet?" (role and name, kept on the device); then the docks as a wall, and
// the two sections of jobs (the signed-in person's first), each truck with its one next job. A checklist
// fills the page while it's open. The yard chart and map are folded at the bottom.

const MIN = 60000
const ROLE_KEY = 'dock-role'
// The existing key: every checklist and release is signed with this name.
const NAME_KEY = 'inspector-on-duty'
const ROLES = {
  crew: { label: 'Loading crew', note: 'Check empty trailers, start and finish loading', icon: 'load', words: 'loading crew' },
  inspector: { label: 'Inspector', note: 'Inspect loads, pass or fail, release trucks', icon: 'inspect', words: 'inspector' },
}
const LOAD_PHASES = ['trailer', 'trailerFail', 'ready', 'loading']
const COLOR = { load: 'var(--color-yard-load)', insp: 'var(--color-yard-insp)' }
const TONE_TEXT = { ok: 'text-muted', window: 'text-warn-ink', late: 'text-danger' }
// "1:44" without AM/PM, for "Started 1:44".
const shortClock = (ms) => clockTime(ms).replace(/\s?[AP]M$/i, '')
const carrierOf = (e) => (e.truckName === 'Pickup' && e.customerPickupFor ? `${e.customerPickupFor} (own truck)` : e.truckName || '—')
const store = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Kept for this session only.
  }
}
const read = (key) => {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

// A truck at a dock and its next job, or null when it has none (released, waiting for the gate).
// `run`: 'trailer' | 'load' (open a checklist), 'start' | 'finish' (loading times), 'release'.
function jobOf(e, now) {
  const phase = phaseOf(e)
  if (phase === 'passed' && !awaitingRelease(e)) return null
  const section = LOAD_PHASES.includes(phase) ? 'load' : 'insp'
  const order = e.pickupNumber ? `, ${e.pickupNumber}` : ''
  const job = {
    trailer: { label: hasDraft(e.id, 'trailer') ? 'Continue trailer check' : 'Check empty trailer', run: 'trailer', icon: 'search', need: 'Empty trailer to check' },
    trailerFail: { label: 'Re-check trailer', run: 'trailer', icon: 'search', problem: e.trailerCheck?.issues?.join(', ') || 'Trailer not OK' },
    ready: { label: 'Loading started', run: 'start', icon: 'load', need: 'Trailer OK, ready to load' },
    loading: { label: 'Loading finished', run: 'finish', icon: 'done', need: `Started ${shortClock(e.loadStartedAt)}` },
    inspect: { label: hasDraft(e.id, 'load') ? 'Continue inspection' : 'Inspect load', run: 'load', icon: 'inspect', need: 'Loaded, ready to inspect' },
    failed: { label: 'Re-check load', run: 'load', icon: 'inspect', problem: e.loadingInspection?.issues?.join(', ') || 'Load failed' },
    passed: { label: isDrop(e) ? 'Release to yard' : 'Release to gate', run: 'release', icon: isDrop(e) ? 'yard' : 'checkOut', need: 'Passed, ready to release' },
  }[phase]
  const st = currentStage(e)
  const stage = st && STAGES[st.key]
  // The board's clock ticks every 15 s, so a job that just started can be a moment ahead of it.
  const elapsed = stage ? Math.max(0, now - st.since) : 0
  const left = stage ? stage.max * MIN - elapsed : null
  return {
    ...job,
    e,
    section,
    order,
    left,
    max: stage?.max,
    tone: stage ? toneOf(elapsed / MIN, stage) : 'ok',
    // Rounded up to the minute, so a job just past its target reads 1m over, not 0m.
    time: stage ? `${duration(Math.ceil(Math.abs(left) / MIN) * MIN)} ${left >= 0 ? 'left' : 'over'}` : '',
  }
}

// ---------------------------------------------------------------- Who is using this tablet?
function WhoScreen({ entries, role: savedRole, name: savedName, onStart, onCancel }) {
  const [role, setRole] = useState(savedRole)
  const [name, setName] = useState(savedName)
  const recent = useMemo(() => recentTechnicians(entries), [entries])
  const ok = role && name.trim()
  return (
    <section aria-labelledby="who-title" className={ui.card + ' mx-auto grid max-w-[760px] gap-6 p-6 sm:p-8'}>
      <div>
        <h1 id="who-title" className="font-display text-[26px] leading-tight font-bold">
          Who is using this tablet?
        </h1>
        <p className="mt-1 text-[15px] text-muted">Every checklist and release is signed with your name. Pick your job, then your name.</p>
      </div>
      <div role="group" aria-label="Your job" className="grid gap-3 sm:grid-cols-2">
        {Object.entries(ROLES).map(([id, r]) => (
          <button
            key={id}
            type="button"
            aria-pressed={role === id}
            onClick={() => setRole(id)}
            className={
              'grid min-h-[120px] cursor-pointer content-start gap-2 rounded-2xl border-2 p-5 text-left transition-[border-color,box-shadow,background-color] duration-150 ' +
              (role === id ? 'border-signal bg-panel shadow-raised' : 'border-line bg-field hover:border-signal-bright')
            }
          >
            <span className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-signal-tint text-signal">
                <Icon name={r.icon} size={24} />
              </span>
              <b className="font-display text-[20px]">{r.label}</b>
              {role === id && <Icon name="done" className="ml-auto text-ok" />}
            </span>
            <span className="text-[15px] text-muted">{r.note}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <label htmlFor="dock-name" className="font-display text-[17px] font-bold">
          Your name
        </label>
        {recent.length > 0 && (
          <div role="group" aria-label="Recent names" className="flex flex-wrap gap-2">
            {recent.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={name.trim() === n}
                onClick={() => setName(n)}
                className={
                  'min-h-11 cursor-pointer rounded-full border-[1.5px] px-4 text-[15px] font-semibold transition-colors duration-150 ' +
                  (name.trim() === n ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel hover:border-signal-bright')
                }
              >
                {n}
              </button>
            ))}
          </div>
        )}
        <input
          id="dock-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && onStart(role, name.trim())}
          placeholder={recent.length ? 'Or type your name' : 'Type your name'}
          autoComplete="off"
          className={ui.input + ' max-w-[420px]'}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!ok} onClick={() => onStart(role, name.trim())} className={ui.btnPrimary + ' min-w-[200px]'}>
          Start
          <Icon name="chevron" />
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={ui.btnGhost}>
            Keep {savedName} signed in
          </button>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- The docks
function DockWall({ entries, jobs, onRun }) {
  const byDock = new Map(entries.filter(atDockNow).map((e) => [dockKey(e.dockDoor), e]))
  const jobById = new Map(jobs.map((j) => [j.e.id, j]))
  return (
    <section aria-labelledby="dock-wall-title" className="on-chrome grid gap-4 rounded-2xl bg-chrome px-5 pt-4 pb-5 text-white shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h2 id="dock-wall-title" className="font-display text-[19px] font-bold">
          The docks
        </h2>
        <ul className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-rail-text" aria-label="Stripe colours">
          <li className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-4 rounded-full" style={{ background: COLOR.load }} aria-hidden="true" />
            Loading
          </li>
          <li className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-4 rounded-full" style={{ background: COLOR.insp }} aria-hidden="true" />
            Inspection
          </li>
        </ul>
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {DOCKS.map((d) => {
          const e = byDock.get(dockKey(d))
          const j = e && jobById.get(e.id)
          return (
            <li key={d} className="grid content-start gap-2">
              <span className="text-center font-display text-[34px] leading-none font-bold text-white/85" aria-hidden="true">
                {d}
              </span>
              {!e ? (
                <div className="grid min-h-[132px] place-items-center rounded-xl border-2 border-dashed border-white/35 font-display text-[16px] font-bold">
                  Open
                  <span className="sr-only">: Dock {d}</span>
                </div>
              ) : j ? (
                <button
                  type="button"
                  onClick={() => onRun(j)}
                  aria-label={`Dock ${d}, trailer ${e.trailerNumber}: ${j.label}${j.time ? `, ${j.time}` : ''}`}
                  className="grid min-h-[132px] cursor-pointer content-start gap-1 overflow-hidden rounded-xl bg-panel px-3 pt-0 pb-2.5 text-left text-ink shadow-card transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <span className="-mx-3 mb-1.5 block h-1.5" style={{ background: COLOR[j.section] }} aria-hidden="true" />
                  <b className="truncate font-display text-[17px] leading-tight">{e.trailerNumber}</b>
                  <span className="truncate text-[13px] text-muted">{carrierOf(e)}</span>
                  <span className="mt-1 text-[14px] font-bold text-signal">{j.label}</span>
                  {j.time && <span className={'text-[13px] font-semibold tabular-nums ' + TONE_TEXT[j.tone]}>{j.time}</span>}
                </button>
              ) : (
                <div className="grid min-h-[132px] content-start gap-1 rounded-xl bg-panel/90 px-3 py-2.5 text-ink">
                  <b className="truncate font-display text-[17px] leading-tight">{e.trailerNumber}</b>
                  <span className="truncate text-[13px] text-muted">{carrierOf(e)}</span>
                  <span className="mt-1 text-[13px] font-semibold text-ok">Released, waiting for the gate</span>
                  <span className="sr-only">Dock {d}</span>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------- Sections
const SECTION = {
  load: {
    title: 'Loading',
    icon: 'load',
    sub: `Check the empty trailer, then start and finish loading. Getting ready ${STAGES.preload.min}-${STAGES.preload.max} min, Loading ${STAGES.load.min}-${STAGES.load.max} min.`,
    empty: 'No trailers to check or load. Trucks show up when Shipping gives them a dock.',
  },
  insp: {
    title: 'Inspection',
    icon: 'inspect',
    sub: `Inspect the load, pass or fail, then release it. Inspection ${STAGES.inspect.min}-${STAGES.inspect.max} min.`,
    empty: 'Nothing to inspect or release. Trucks show up when their loading is finished.',
  },
}

function JobRow({ j, dark, onRun }) {
  const e = j.e
  return (
    <li className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 py-3.5 sm:grid-cols-[48px_minmax(0,1fr)_auto]">
      <span className="grid size-12 place-items-center rounded-xl bg-chrome font-display text-[20px] font-bold text-white" aria-label={`Dock ${e.dockDoor}`}>
        {e.dockDoor}
      </span>
      <div className="min-w-0">
        <b className="block truncate text-[16px] leading-snug">
          {e.trailerNumber} <span className="font-normal text-muted">{carrierOf(e)}</span>
        </b>
        {j.problem ? (
          <span className="block text-[14px] font-semibold text-danger">
            {j.problem}
            <span className="font-normal text-muted">{j.order}</span>
          </span>
        ) : (
          <span className="block text-[14px] text-muted">
            {j.need}
            {j.order}
          </span>
        )}
        {j.time && (
          <span className={'block text-[13px] font-semibold tabular-nums ' + TONE_TEXT[j.tone]}>
            {j.time} of {j.max} min
          </span>
        )}
      </div>
      <button type="button" onClick={() => onRun(j)} className={(dark ? ui.btnSmallPrimary : ui.btnSmall) + ' col-start-2 w-full sm:col-start-3 sm:w-auto sm:min-w-[190px]'}>
        <Icon name={j.icon} size={18} />
        {j.label}
      </button>
    </li>
  )
}

function JobSection({ id, jobs, mine, onRun }) {
  const s = SECTION[id]
  const late = jobs.filter((j) => j.tone === 'late').length
  return (
    <section aria-labelledby={`jobs-${id}-title`} className={ui.card + ' min-w-0 overflow-hidden'}>
      <span className="block h-1.5" style={{ background: COLOR[id] }} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal-tint text-signal">
          <Icon name={s.icon} />
        </span>
        <h2 id={`jobs-${id}-title`} className="font-display text-[20px] leading-tight font-bold">
          {s.title} <span className="font-body text-[17px] font-semibold text-muted">({jobs.length})</span>
        </h2>
        {late > 0 && <span className="text-[15px] font-bold text-danger">{late} late</span>}
        {mine && <span className={ui.tag + ' ml-auto bg-signal-tint text-signal'}>Your jobs</span>}
      </div>
      <p className="px-5 pt-1 text-[14px] text-muted">{s.sub}</p>
      {jobs.length ? (
        <ol className="divide-y divide-hair px-5 pb-1">
          {jobs.map((j, i) => (
            <JobRow key={j.e.id} j={j} dark={mine && i === 0} onRun={onRun} />
          ))}
        </ol>
      ) : (
        <p className="flex items-start gap-2 px-5 pt-3 pb-5 text-[15px] text-muted">
          <Icon name="info" size={18} className="mt-0.5" />
          {s.empty}
        </p>
      )}
    </section>
  )
}

// A panel folded at the bottom; its contents only mount once opened.
function Folded({ id, title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <section className={ui.card + ' overflow-hidden'}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-signal-tint">
        <Icon name="chevron" size={18} className={'text-signal transition-transform duration-150 ' + (open ? 'rotate-90' : '')} />
        <b className="font-display text-[17px]">{title}</b>
      </button>
      {open && (
        <div id={id} className="border-t border-hair p-4 sm:p-5">
          {children}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- The tab
export function DockWork({ entries, onEdit, onCheckOut, onSaveInspection, onSaveTrailerCheck, onLoading, onRelease }) {
  const [now, setNow] = useState(Date.now)
  const [role, setRole] = useState(() => (ROLES[read(ROLE_KEY)] ? read(ROLE_KEY) : ''))
  const [name, setName] = useState(() => read(NAME_KEY))
  const [asking, setAsking] = useState(false)
  // The open checklist: { id, part: 'trailer' | 'load' }.
  const [open, setOpen] = useState(null)
  // The passed truck whose release pop-up is open.
  const [releasingId, setReleasingId] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const start = (r, n) => {
    setRole(r)
    setName(n)
    store(ROLE_KEY, r)
    store(NAME_KEY, n)
    setAsking(false)
  }

  // Problems first, then whatever is closest to (or furthest past) its target.
  const jobs = entries
    .filter(atDockNow)
    .map((e) => jobOf(e, now))
    .filter(Boolean)
    .sort((a, b) => Number(!!b.problem) - Number(!!a.problem) || (a.left ?? Infinity) - (b.left ?? Infinity))
  const bySection = { load: jobs.filter((j) => j.section === 'load'), insp: jobs.filter((j) => j.section === 'insp') }
  const late = jobs.filter((j) => j.tone === 'late').length
  const nextToDock = entries.filter((e) => !e.timeOut && !e.dockDoor && !inYard(e) && e.orderReadyAt).sort((a, b) => a.orderReadyAt - b.orderReadyAt)[0]
  const released = entries.filter((e) => isReleased(e) && !inYard(e)).length
  const openEntry = open && entries.find((e) => e.id === open.id && atDockNow(e))

  const run = (j) => {
    if (j.run === 'trailer' || j.run === 'load') {
      setOpen({ id: j.e.id, part: j.run })
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    } else if (j.run === 'start') onLoading(j.e.id, { loadStartedAt: Date.now() })
    else if (j.run === 'finish') onLoading(j.e.id, { loadFinishedAt: Date.now() })
    else setReleasingId(j.e.id)
  }
  const close = () => setOpen(null)

  if (!role || !name || asking)
    return <WhoScreen entries={entries} role={role} name={name} onStart={start} onCancel={role && name ? () => setAsking(false) : undefined} />

  const releaseDialog = (
    <ReleaseDialog
      entry={entries.find((x) => x.id === releasingId && awaitingRelease(x)) ?? null}
      entries={entries}
      inspector={name}
      onClose={() => setReleasingId(null)}
      onRelease={(id, data) => {
        onRelease(id, data)
        setReleasingId(null)
      }}
    />
  )

  // While a checklist is open, the board steps aside and the sheet fills the page.
  if (openEntry) {
    const key = `${openEntry.id}:${open.part}`
    const props = { entry: openEntry, entries, inspector: name, onClose: close }
    return open.part === 'trailer' ? (
      <TrailerCheckSheet
        key={key}
        {...props}
        defaultTech={role === 'crew' ? name : ''}
        onSave={(id, check) => {
          onSaveTrailerCheck(id, check)
          close()
        }}
      />
    ) : (
      <LoadCheckSheet
        key={key}
        {...props}
        onSave={(id, inspection) => {
          onSaveInspection(id, inspection)
          close()
        }}
      />
    )
  }

  const order = role === 'inspector' ? ['insp', 'load'] : ['load', 'insp']
  const mineId = order[0]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {releaseDialog}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-bold">
            {jobs.length} job{jobs.length === 1 ? '' : 's'} at the docks
          </h1>
          <p className="text-[15px] text-muted">
            {late > 0 && <b className="text-danger">{late} running late. </b>}
            Signed in as <b className="text-ink">{name}</b>, {ROLES[role].words}.{' '}
            <button type="button" onClick={() => setAsking(true)} className={ui.btnGhost + ' -ml-1 px-2'}>
              Not you?
            </button>
          </p>
        </div>
        <div className="grid gap-0.5 text-right text-[14px]">
          <span className="font-semibold">{nextToDock ? `Next to a dock: ${nextToDock.trailerNumber} (${carrierOf(nextToDock)})` : 'No trucks waiting for a dock'}</span>
          <span className="text-muted">{released} released, waiting for the gate</span>
        </div>
      </div>

      <DockWall entries={entries} jobs={jobs} onRun={run} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {order.map((id) => (
          <JobSection key={id} id={id} jobs={bySection[id]} mine={id === mineId} onRun={run} />
        ))}
      </div>

      <Folded id="dock-yard-chart" title="The yard over the last 6 hours">
        <LiveYardCard entries={entries} now={now} compact />
      </Folded>
      <Folded id="dock-yard-map" title="Yard map: where every truck and trailer is parked">
        <LiveYard
          entries={entries}
          onEdit={onEdit}
          onCheckOut={onCheckOut}
          onInspect={(e) => {
            const j = jobOf(e, Date.now())
            if (j) run(j)
          }}
        />
      </Folded>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { clockTime, dayKey, duration } from '../time'
import { dockKey } from './AssignDock'
import { InspectionSummary, LoadCheckSheet, TrailerCheckSheet, hasDraft } from './LoadingInspection'
import LiveYardCard from './LiveYardCard'
import YardMap from './YardMap'
import YardPlayer from './YardPlayer'
import { dayMetrics, isDrop, yardMetrics } from '../metrics'
import { needsInspection } from '../detention'
import { atDockNow, awaitingRelease, isReleased } from '../handoff'
import { STAGES, currentStage } from '../stages'
import { YARD_STAGES } from '../liveYard'
import { Icon } from '../icons'
import CardHead from './CardHead'
import { TimerLegend, TimerLine } from './StageTimer'
import ReleaseDialog from './ReleaseDialog'

// Where a truck at a dock is in the work, and which section it sits in: Loading (trailer check, then
// loading) until "Loading finished", then Inspection (inspect, re-check, passed).
export function phaseOf(e) {
  const insp = e.loadingInspection
  if (insp?.result === 'Pass') return 'passed'
  if (insp?.result === 'Fail') return 'failed'
  if (e.loadFinishedAt) return 'inspect'
  if (e.loadStartedAt) return 'loading'
  if (e.trailerCheck?.result === 'Fail') return 'trailerFail'
  if (e.trailerCheck) return 'ready'
  return 'trailer'
}
const IN_LOADING = ['trailer', 'trailerFail', 'ready', 'loading']
const INSPECTION_ORDER = { failed: 0, inspect: 1, passed: 2 }
const STAGE_COLOR = Object.fromEntries(YARD_STAGES.map((s) => [s.key, s.color]))

// The inspector's name, set once per shift on this device; every checklist is signed with it.
const INSPECTOR_KEY = 'inspector-on-duty'
function InspectorOnDuty({ name, onChange }) {
  const dialog = useRef(null)
  const [draft, setDraft] = useState(name)
  const open = () => {
    setDraft(name)
    dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()
  const save = (ev) => {
    ev.preventDefault()
    if (!draft.trim()) return
    onChange(draft.trim())
    close()
  }
  return (
    <>
      <span className="inline-flex min-h-12 items-center gap-3 rounded-2xl border border-hair bg-panel py-1 pr-1.5 pl-3.5 shadow-card">
        <Icon name="people" size={18} className="text-muted" />
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">Inspector on duty</span>
          {name ? <b>{name}</b> : <b className="text-danger">Not set</b>}
        </span>
        <button id="inspector-on-duty" type="button" onClick={open} className={ui.btnGhost + ' scroll-mt-[calc(var(--header-h,114px)+24px)]'}>
          {name ? 'Change' : 'Set name'}
        </button>
      </span>
      <dialog ref={dialog} aria-labelledby="inspector-title" onClick={(ev) => ev.target === dialog.current && close()} className={'w-[95vw] max-w-[440px] ' + ui.dialog}>
        <form onSubmit={save} className="grid gap-4 p-5">
          <h2 id="inspector-title" className="flex items-center gap-3 font-display text-[20px] leading-tight font-bold">
            <Icon name="people" size={24} className="text-signal" />
            Inspector on duty
          </h2>
          <label className="grid gap-1.5">
            <span className={ui.label}>Your name</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus autoComplete="name" className={ui.input} />
            <span className="text-[13px] text-muted">Trailer checks and inspections on this device are signed with this name until it's changed.</span>
          </label>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={close} className={ui.btn}>
              Cancel
            </button>
            <button type="submit" disabled={!draft.trim()} className={ui.btnPrimary}>
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

const PILL = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn text-warn-ink', bad: 'bg-danger-soft text-danger', info: 'bg-signal-soft text-ink', mute: 'bg-signal-tint text-muted' }
function Pill({ tone, icon, children }) {
  return (
    <span className={ui.tag + ' min-h-7 px-3 ' + PILL[tone]}>
      <Icon name={icon} size={14} />
      {children}
    </span>
  )
}

// Two steps per section, ticked off as they're done.
function Progress({ steps }) {
  const now = steps.findIndex((s) => !s.done)
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={s.label} className={'flex items-center gap-1.5 ' + (s.done ? 'text-ok' : i === now ? 'text-ink' : 'text-muted')}>
          {i > 0 && (
            <span className="mr-0.5 text-line" aria-hidden="true">
              —
            </span>
          )}
          <span
            className={
              'grid size-4 place-items-center rounded-full text-[10px] ' +
              (s.done ? 'bg-ok text-signal-ink' : i === now ? 'bg-signal text-signal-ink' : 'border-[1.5px] border-line')
            }
            aria-hidden="true"
          >
            {s.done ? <Icon name="check" size={11} className="[stroke-width:3]" /> : i + 1}
          </span>
          {s.label}
          <span className="sr-only">{s.done ? ' (done)' : i === now ? ' (now)' : ''}</span>
        </li>
      ))}
    </ol>
  )
}

// One truck at a dock: dock, status, trailer, carrier and customer, its two steps, the stage timer, and
// the one button for what to do next.
function TruckCard({ e, now, open, fresh, onOpen, onLoading, onRelease }) {
  const phase = phaseOf(e)
  const st = currentStage(e)
  const loadingSide = IN_LOADING.includes(phase)
  const draft = (part) => hasDraft(e.id, part)
  const big = ui.btnSmallPrimary.replace('text-[15px]', 'text-[16px]') + ' min-h-[52px] w-full'
  // Release is the last step and sends the truck to the gate, so it's green like the gate's main button.
  const go = big.replace('border-signal bg-signal', 'border-ok bg-ok').replace('hover:border-signal-hover hover:bg-signal-hover', 'hover:brightness-110')
  const status = {
    trailer: <Pill tone="warn" icon="search">Check trailer</Pill>,
    trailerFail: (
      <Pill tone="bad" icon="failed">
        Trailer not OK{e.trailerCheck?.technician ? ` · ${e.trailerCheck.technician}` : ''}
      </Pill>
    ),
    ready: (
      <Pill tone="ok" icon="done">
        Trailer OK · {clockTime(e.trailerCheck?.savedAt)}
        {e.trailerCheck?.technician ? ` · ${e.trailerCheck.technician}` : ''}
      </Pill>
    ),
    loading: <Pill tone="mute" icon="waiting">Since {clockTime(e.loadStartedAt)}</Pill>,
    inspect: <Pill tone="warn" icon="inspect">Ready to inspect</Pill>,
    failed: <Pill tone="bad" icon="failed">Failed</Pill>,
    passed: isReleased(e) ? (
      <Pill tone="info" icon="handoff">Released to gate</Pill>
    ) : (
      <Pill tone="ok" icon="inspected">Passed · {clockTime(e.loadingInspection?.savedAt ?? e.loadingInspection?.inspectedAt)}</Pill>
    ),
  }[phase]
  const action = {
    trailer: (
      <button type="button" onClick={() => onOpen(e.id, 'trailer')} className={big}>
        <Icon name="search" />
        {draft('trailer') ? 'Continue trailer check' : 'Check empty trailer'}
      </button>
    ),
    trailerFail: (
      <button type="button" onClick={() => onOpen(e.id, 'trailer')} className={big}>
        <Icon name="search" />
        Re-check trailer
      </button>
    ),
    ready: (
      <button type="button" onClick={() => onLoading(e.id, { loadStartedAt: Date.now() })} className={big}>
        <Icon name="load" />
        Loading started
      </button>
    ),
    loading: (
      <button type="button" onClick={() => onLoading(e.id, { loadFinishedAt: Date.now() })} className={big}>
        <Icon name="done" />
        Loading finished
      </button>
    ),
    inspect: (
      <button type="button" onClick={() => onOpen(e.id, 'load')} className={big}>
        <Icon name="inspect" />
        {draft('load') ? 'Continue inspection' : 'Inspect load'}
      </button>
    ),
    failed: (
      <button type="button" onClick={() => onOpen(e.id, 'load')} className={big}>
        <Icon name="inspect" />
        Re-check load
      </button>
    ),
    passed: (
      <div className="grid gap-1">
        {/* Only the inspector releases a passed truck to the gate; then the Gate checks it out. */}
        {/* A dropped trailer has no driver: it's released to the yard, where a driver hooks it later. */}
        {isReleased(e) ? (
          <p className="flex min-h-[52px] items-center justify-center gap-2 rounded-[10px] border border-dashed border-line text-[14px] text-muted">
            <Icon name="handoff" size={16} />
            Released {clockTime(e.release.releasedAt)} · waiting for gate checkout
          </p>
        ) : (
          <button type="button" onClick={() => onRelease(e)} className={go}>
            <Icon name={isDrop(e) ? 'yard' : 'checkOut'} />
            {isDrop(e) ? 'Release to yard' : 'Release to gate'}
          </button>
        )}
        <button type="button" onClick={() => onOpen(e.id, 'view')} className={ui.btnGhost + ' justify-center'}>
          View inspection
        </button>
      </div>
    ),
  }[phase]
  const steps = loadingSide
    ? [
        { label: 'Trailer check', done: phase === 'ready' || phase === 'loading' },
        { label: 'Loading', done: false },
      ]
    : [
        { label: 'Loaded', done: true },
        { label: 'Inspection', done: phase === 'passed' },
      ]
  const problem = phase === 'failed' ? e.loadingInspection?.issues : phase === 'trailerFail' ? e.trailerCheck?.issues : null
  const color = STAGE_COLOR[phase === 'passed' ? 'ready' : loadingSide ? 'load' : 'insp']

  return (
    <article
      id={`dock-card-${e.id}`}
      aria-label={`Dock ${e.dockDoor}, trailer ${e.trailerNumber || 'unknown'}`}
      className={
        'relative flex scroll-mt-[calc(var(--header-h,114px)+24px)] flex-col gap-3.5 rounded-2xl border p-[18px] transition-[background-color,border-color,box-shadow] duration-200 ' +
        (open ? 'border-signal bg-panel shadow-raised' : 'border-hair bg-field') +
        (fresh ? ' animate-fresh' : '')
      }
    >
      <span className="absolute inset-y-[18px] left-0 w-1 rounded-r" style={{ background: color }} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold tracking-[0.06em] text-muted uppercase">Dock {e.dockDoor}</span>
        {status}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[18px] leading-tight font-bold" title={e.trailerNumber}>
          {e.trailerNumber || 'No trailer #'}
        </div>
        <div className="truncate text-[14px] text-muted" title={[e.truckName, e.customerPickupFor, e.pickupNumber].filter(Boolean).join(' · ')}>
          {[e.truckName, e.customerPickupFor, e.pickupNumber && `Order ${e.pickupNumber}`].filter(Boolean).join(' · ') || '—'}
        </div>
        {isDrop(e) && <div className="mt-1 text-[13px] font-semibold text-drop">Drop trailer · no driver waiting</div>}
      </div>
      <Progress steps={steps} />
      {problem?.length > 0 && <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">{problem.join(' · ')}</p>}
      {st && (
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold">
            {st.recheck ? 'Re-check' : STAGES[st.key].label}
            <span className="font-normal text-muted">
              {' '}
              · target {STAGES[st.key].min}–{STAGES[st.key].max} min
            </span>
          </span>
          <TimerLine stage={st.key} since={st.since} now={now} />
        </div>
      )}
      <div className="mt-auto pt-0.5">{action}</div>
    </article>
  )
}

function Section({ id, icon, color, title, count, sub, target, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={ui.card + ' scroll-mt-[calc(var(--header-h,114px)+16px)]'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hair px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
          <Icon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="font-display text-[20px] leading-tight font-bold">
            {title} <span className="font-body text-[17px] font-semibold text-muted">({count})</span>
          </h2>
          <p className="text-[14px] text-muted">{sub}</p>
        </div>
        <span className={ui.tag + ' min-h-7 bg-signal-tint px-3 text-muted'}>
          <Icon name="waiting" size={14} />
          {target}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

// Trucks whose order is ready but that have no dock yet: Shipping is about to send them to a dock. View
// only, so the dock crew can get set (the set point says fresh or frozen).
function ComingToDocks({ entries, now }) {
  const noDock = entries.filter((e) => !e.timeOut && !e.dockDoor)
  const coming = noDock.filter((e) => e.orderReadyAt).sort((a, b) => a.orderReadyAt - b.orderReadyAt)
  const notReady = noDock.length - coming.length
  return (
    <section aria-labelledby="coming-title" className={ui.card}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hair px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${STAGE_COLOR.wait} 18%, transparent)`, color: STAGE_COLOR.wait }}>
          <Icon name="dock" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="coming-title" className="font-display text-[20px] leading-tight font-bold">
            Coming to the docks <span className="font-body text-[17px] font-semibold text-muted">({coming.length})</span>
          </h2>
          <p className="text-[14px] text-muted">Orders are ready; Shipping is about to assign each a dock. View only, so the crew can get set.</p>
        </div>
        <span className={ui.tag + ' min-h-7 bg-signal-tint px-3 text-muted'}>
          <Icon name="waiting" size={14} />
          {notReady} still waiting for their order
        </span>
      </div>
      <div className="p-5">
        {coming.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3">
            {coming.map((e) => (
              <li key={e.id} className="relative grid gap-0.5 rounded-xl border border-hair bg-field py-2.5 pr-3 pl-4">
                <span className="absolute inset-y-2.5 left-0 w-1 rounded-r" style={{ background: STAGE_COLOR.wait }} aria-hidden="true" />
                <b className="truncate text-[17px] leading-tight">{e.trailerNumber || 'No trailer #'}</b>
                <span className="truncate text-[14px] text-muted">{[e.truckName, e.customerPickupFor].filter(Boolean).join(' · ') || '—'}</span>
                <span className="text-[13px] text-muted">
                  {isDrop(e) ? 'Drop trailer' : 'Pickup'} · order ready {duration(now - e.orderReadyAt)} ago
                  {e.tempSet ? ` · set point ${e.tempSet} °F` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No ready orders waiting for a dock right now.</Empty>
        )}
      </div>
    </section>
  )
}

const Empty = ({ children }) => (
  <p className="flex items-start gap-2 text-muted">
    <Icon name="info" size={18} className="mt-0.5" />
    {children}
  </p>
)

// The Loading & Inspection tab, laid out the way the work moves: the Live yard, then Loading (check the
// empty trailer, time the loading), then Inspection (trucks drop in when loading is finished), and the
// yard map folded away at the bottom. Docks are assigned from the Shipping tab.
export function DockBoard({ entries, onEdit, onCheckOut, onSaveInspection, onSaveTrailerCheck, onLoading, onRelease }) {
  const [now, setNow] = useState(Date.now)
  // The open checklist: { id, part: 'trailer' | 'load' | 'view' }.
  const [open, setOpen] = useState(null)
  const [freshId, setFreshId] = useState(null)
  const [mapOpen, setMapOpen] = useState(false)
  // The passed truck whose Release to gate pop-up is open.
  const [releasingId, setReleasingId] = useState(null)
  const [inspector, setInspector] = useState(() => {
    try {
      return localStorage.getItem(INSPECTOR_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const changeInspector = (name) => {
    setInspector(name)
    try {
      localStorage.setItem(INSPECTOR_KEY, name)
    } catch {
      // Kept for this session only.
    }
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!freshId) return
    const t = setTimeout(() => setFreshId(null), 2600)
    return () => clearTimeout(t)
  }, [freshId])

  const atDock = useMemo(
    () => entries.filter(atDockNow).sort((a, b) => dockKey(a.dockDoor).localeCompare(dockKey(b.dockDoor), undefined, { numeric: true })),
    [entries],
  )
  const loading = atDock.filter((e) => IN_LOADING.includes(phaseOf(e)))
  const inspection = atDock.filter((e) => !IN_LOADING.includes(phaseOf(e))).sort((a, b) => INSPECTION_ORDER[phaseOf(a)] - INSPECTION_ORDER[phaseOf(b)])
  const openEntry = open && atDock.find((e) => e.id === open.id)

  const scrollTo = (id) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  const openSheet = (id, part) => {
    setOpen({ id, part })
    scrollTo(part === 'trailer' ? 'loading-sheet' : 'inspection-sheet')
  }
  const close = () => setOpen(null)
  const handleLoading = (id, patch) => {
    onLoading(id, patch)
    // Loading finished: the truck moves down to Inspection; follow it there.
    if (patch.loadFinishedAt) {
      setFreshId(id)
      setTimeout(() => document.getElementById(`dock-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
    }
  }
  // A truck tapped on the yard map: open what it needs next, or show its card.
  const fromMap = (e) => {
    const phase = phaseOf(e)
    if (phase === 'trailer' || phase === 'trailerFail') openSheet(e.id, 'trailer')
    else if (phase === 'inspect' || phase === 'failed') openSheet(e.id, 'load')
    else document.getElementById(`dock-card-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const card = (e) => <TruckCard key={e.id} e={e} now={now} open={open?.id === e.id} fresh={freshId === e.id} onOpen={openSheet} onLoading={handleLoading} onRelease={(x) => setReleasingId(x.id)} />
  const cards = 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4'
  const sheet = (part) => {
    if (!openEntry || (part === 'trailer') !== (open.part === 'trailer')) return null
    const props = { key: `${openEntry.id}:${open.part}`, entry: openEntry, entries, inspector, onClose: close }
    if (open.part === 'trailer')
      return (
        <TrailerCheckSheet
          {...props}
          onSave={(id, check) => {
            onSaveTrailerCheck(id, check)
            close()
          }}
        />
      )
    if (open.part === 'view' && openEntry.loadingInspection) return <InspectionSummary {...props} onRecheck={() => setOpen({ id: openEntry.id, part: 'load' })} />
    return (
      <LoadCheckSheet
        {...props}
        onSave={(id, inspection) => {
          onSaveInspection(id, inspection)
          close()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <ReleaseDialog
        entry={entries.find((x) => x.id === releasingId && awaitingRelease(x)) ?? null}
        entries={entries}
        inspector={inspector}
        onClose={() => setReleasingId(null)}
        onRelease={(id, data) => {
          onRelease(id, data)
          setReleasingId(null)
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-bold">Loading &amp; Inspection</h1>
          <p className="text-muted">Load at the top, inspect at the bottom. Each truck shows its one next step.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TimerLegend />
          <InspectorOnDuty name={inspector} onChange={changeInspector} />
        </div>
      </div>

      <LiveYardCard entries={entries} now={now} />

      <ComingToDocks entries={entries} now={now} />

      <Section
        id="loading"
        icon="load"
        color={STAGE_COLOR.load}
        title="Loading"
        count={loading.length}
        sub="Check the empty trailer, then time the loading"
        target={`Pre-loading ${STAGES.preload.min}–${STAGES.preload.max} · Loading ${STAGES.load.min}–${STAGES.load.max} min`}
      >
        {loading.length ? <div className={cards}>{loading.map(card)}</div> : <Empty>No trucks loading. Shipping assigns docks on the Shipping tab.</Empty>}
        <div id="loading-sheet" className="scroll-mt-[calc(var(--header-h,114px)+16px)]">
          {sheet('trailer')}
        </div>
      </Section>

      <p className="-my-1.5 flex items-center justify-center gap-2.5 text-[13px] font-semibold text-muted before:h-px before:max-w-40 before:flex-1 before:bg-line after:h-px after:max-w-40 after:flex-1 after:bg-line" aria-hidden="true">
        <Icon name="handoff" size={16} />
        Loading finished moves the truck to Inspection
      </p>

      <Section
        id="inspection"
        icon="inspect"
        color={STAGE_COLOR.insp}
        title="Inspection"
        count={inspection.length}
        sub="Probe the product, check the load and seal, then pass or fail"
        target={`Inspection ${STAGES.inspect.min}–${STAGES.inspect.max} min`}
      >
        {inspection.length ? <div className={cards}>{inspection.map(card)}</div> : <Empty>Nothing to inspect. Trucks appear here when their loading is finished.</Empty>}
        <div id="inspection-sheet" className="scroll-mt-[calc(var(--header-h,114px)+16px)]">
          {sheet('load')}
        </div>
      </Section>

      <section className={ui.card}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-signal-soft text-signal">
              <Icon name="yard" />
            </span>
            <div>
              <h2 className="font-display text-[18px] leading-tight font-bold">Yard map</h2>
              <p className="text-[14px] text-muted">Where every truck and trailer is parked. Tap a truck to open what it needs.</p>
            </div>
          </div>
          <button type="button" onClick={() => setMapOpen((v) => !v)} aria-expanded={mapOpen} className={ui.btnSmall}>
            {mapOpen ? 'Hide map' : 'Show map'}
          </button>
        </div>
      </section>
      {mapOpen && <LiveYard entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} onInspect={fromMap} />}
    </div>
  )
}

// Small live copy of the yard map, refreshed every 30 seconds. Clicking it (or Enlarge)
// opens the full-size map in a pop-up; Esc, Close or a click on the dimmed background closes it.
// `stretch`: fill the parent's height (beside At the Docks on Loading & Inspection).
// `onInspect` (Loading & Inspection) adds a Needs inspection / All trucks switch, starting on Needs
// inspection: trucks waiting for their Loading Inspection are highlighted and open it when tapped.
export function LiveYard({ entries, onEdit, onCheckOut, onInspect, stretch }) {
  const [now, setNow] = useState(Date.now)
  const [view, setView] = useState(onInspect ? 'inspect' : 'all')
  const inspecting = onInspect && view === 'inspect'
  const dialog = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const yard = useMemo(() => yardMetrics(entries, Infinity, now), [entries, now])
  const gateCounts = useMemo(() => dayMetrics(entries, dayKey(new Date(now)), now).gateCounts, [entries, now])
  const open = () => dialog.current?.showModal()
  const close = () => dialog.current?.close()
  // Check out / View entry leave the tab, so close the pop-up first.
  const closeThen = (fn) => (e) => {
    close()
    fn(e)
  }

  return (
    <section className={'rounded-2xl border border-hair bg-panel shadow-card sm:col-span-2 lg:col-span-1' + (stretch ? ' h-full' : '')}>
      <CardHead icon="yard" title={inspecting ? 'Inspection Map' : 'Live Yard Map'} size="text-[18px]">
        <div className="flex flex-wrap items-center gap-2">
          {onInspect && (
            <div role="group" aria-label="Map view" className="flex gap-1 rounded-xl border border-hair bg-panel p-1">
              {[
                ['inspect', 'Needs inspection'],
                ['all', 'All trucks'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={
                    'min-h-10 cursor-pointer rounded-lg px-3 text-[14px] font-semibold transition-colors duration-150 ' +
                    (view === id ? 'bg-signal text-signal-ink shadow-card' : 'text-ink hover:bg-signal-tint')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={open} className={ui.btnGhost}>
            <Icon name="enlarge" size={18} />
            Enlarge
          </button>
        </div>
      </CardHead>
      <div className="p-4">
        <YardMap
          yard={yard}
          gateCounts={gateCounts}
          at={Infinity}
          clock={now}
          live
          compact
          onExpand={open}
          focus={inspecting ? needsInspection : undefined}
          onInspect={inspecting ? onInspect : undefined}
        />
      </div>

      <dialog
        ref={dialog}
        aria-label="Live yard map"
        onClick={(ev) => ev.target === dialog.current && close()}
        className={'w-[95vw] max-w-[1300px] ' + ui.dialog}
      >
        {/* Padding sits on this wrapper so a click inside the pop-up never reaches the dialog itself. */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-3 font-display text-[22px] leading-tight font-bold">
              <Icon name="yard" size={24} className="text-signal" />
              {inspecting ? 'Inspection Map' : 'Yard Map'}
            </h2>
            <button type="button" onClick={close} className={ui.btnSmall}>
              <Icon name="close" />
              Close
            </button>
          </div>
          {/* Live by default, with Pause and Replay of any of the last 30 days. */}
          <YardPlayer
            entries={entries}
            onEdit={closeThen(onEdit)}
            onCheckOut={closeThen(onCheckOut)}
            focus={inspecting ? needsInspection : undefined}
            onInspect={inspecting ? closeThen(onInspect) : undefined}
          />
        </div>
      </dialog>
    </section>
  )
}

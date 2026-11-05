import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { ago, arrivalMs, clockTime, dayKey, departureMs, duration } from '../time'
import AssignDock, { dockKey } from './AssignDock'
import LoadingInspection from './LoadingInspection'
import YardMap from './YardMap'
import EmptyState from './EmptyState'
import { DETENTION_FREE_MIN, DOCKS } from '../yard'
import { dayMetrics, isDrop, stagingBays, yardMetrics } from '../metrics'
import { DETENTION_TAG, detentionState, needsInspection } from '../detention'
import { awaitingRelease, isReleased } from '../handoff'
import { STAGES, currentStage, inspectionSavedAt } from '../stages'
import { TimerLegend, TimerLine, TimerPill } from './StageTimer'
import OnDuty from './OnDuty'
import ReleaseDialog from './ReleaseDialog'
import { hasDraft } from './LoadingInspection'

// Detention pill (past or near free time), or nothing when the truck is fine.
function DetentionPill({ e, now }) {
  const det = detentionState(e, now)
  return det ? <span className={ui.tag + ' ' + DETENTION_TAG[det.level]}>{det.text}</span> : null
}

function Stripe({ purposes }) {
  return (
    <div className="flex flex-col">
      {purposes.length ? (
        purposes.map((p) => <div key={p} className={'flex-1 ' + (ui.PURPOSE_STYLES[p]?.stripe ?? 'bg-line')} />)
      ) : (
        <div className="flex-1 bg-line" />
      )}
    </div>
  )
}

function Meta({ items }) {
  const shown = items.filter(Boolean)
  if (!shown.length) return null
  return <div className="text-[13px] leading-snug text-muted">{shown.reduce((acc, m, i) => (i ? [...acc, ' · ', m] : [m]), [])}</div>
}

function WaitingCard({ e, now, occupied, onAssignDock, onEdit }) {
  const waited = now - arrivalMs(e)
  const purposes = e.visitPurpose ?? []

  return (
    <div className="grid grid-cols-[8px_1fr] overflow-hidden rounded-lg bg-page">
      <Stripe purposes={purposes} />
      <div className="px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-display text-[16px] leading-tight font-semibold break-words">
            {e.trailerNumber} · {e.truckName}
          </span>
          <span className="flex items-center gap-2">
            <span className="sr-only">Waiting {duration(waited)}</span>
            {isDrop(e) ? (
              <span className="text-[14px] font-semibold">Here {duration(waited)}</span>
            ) : (
              <TimerPill stage="dock" since={e.createdAt ?? arrivalMs(e)} now={now} label="Waiting for a dock" />
            )}
          </span>
        </div>
        <div className="my-0.5">
          <DetentionPill e={e} now={now} />
        </div>
        <Meta
          items={[
            purposes.length > 0 && <b key="p" className="font-semibold text-ink">{purposes.join(' + ')}</b>,
            e.truckerNameIn && <span key="d">Trucker Name: {e.truckerNameIn}</span>,
            e.driverPhone && (
              <a key="ph" href={`tel:${e.driverPhone}`} className="underline">
                {e.driverPhone}
              </a>
            ),
          ]}
        />
        <Meta
          items={[
            `In ${e.timeIn || '—'}`,
            e.appointmentTime && <span key="a">Appt {e.appointmentTime}</span>,
            e.waitingLocation && <span key="w">Waiting at {e.waitingLocation}</span>,
          ]}
        />
        <AssignDock
          entry={e}
          occupied={occupied}
          onAssignDock={onAssignDock}
          extra={
            <button onClick={() => onEdit(e)} className="cursor-pointer py-1 text-sm underline">
              View entry
            </button>
          }
        />
      </div>
    </div>
  )
}

// Inspection and handoff state as a tag; the word carries the meaning, color only reinforces it.
// `wrap` lets the tag break onto two lines in a narrow tile instead of running past its edge.
function InspectionTag({ e, wrap }) {
  const tag = wrap ? ui.tag.replace('whitespace-nowrap', 'whitespace-normal') : ui.tag
  const inspection = e.loadingInspection
  if (!inspection) return <span className={tag + ' bg-warn-soft text-ink ring-1 ring-warn-line/40'}>Not inspected</span>
  if (inspection.result !== 'Pass') return <span className={tag + ' bg-danger-soft text-danger'}>⚠ Inspection failed</span>
  return isReleased(e) ? (
    <span className={tag + ' bg-delivery-soft text-delivery'}>✓ Released to gate</span>
  ) : (
    <span className={tag + ' bg-ok-soft text-ok'}>✓ Passed · awaiting release</span>
  )
}

// Full At the Docks card for the Shipping tab's side column.
function DockCard({ e, now, onCheckOut }) {
  const purposes = e.visitPurpose ?? []
  return (
    <div className="grid grid-cols-[8px_1fr] overflow-hidden rounded-lg bg-page">
      <Stripe purposes={purposes} />
      <div className="flex gap-4 px-3 py-2.5">
        <div className="shrink-0 text-center">
          <div className="text-[13px] font-semibold text-muted">Dock</div>
          <div className="font-display text-[22px] leading-none font-semibold">{e.dockDoor}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[16px] leading-tight font-semibold break-words">
            {e.trailerNumber} · {e.truckName}
          </div>
          <Meta
            items={[
              purposes.length > 0 && <b key="p" className="font-semibold text-ink">{purposes.join(' + ')}</b>,
              e.truckerNameIn && <span key="d">Trucker Name: {e.truckerNameIn}</span>,
            ]}
          />
          <Meta
            items={[
              `At dock since ${clockTime(e.dockAssignedAt)} (${duration(now - e.dockAssignedAt)})`,
              `Waited ${duration(e.dockAssignedAt - arrivalMs(e))}`,
            ]}
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            <InspectionTag e={e} />
            <DetentionPill e={e} now={now} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => onCheckOut(e)} className={ui.btnSmall}>
              Check out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Where a truck at a dock is in the work, and its one next step: check the empty trailer, start and
// finish the loading, inspect the load, then the inspector releases it to the gate.
export function dockPhase(e) {
  if (e.timeOut) return 'gone'
  // An inspection on file decides it (older visits have no trailer check or loading times).
  if (e.loadingInspection) return e.loadingInspection.result !== 'Pass' ? 'failed' : isReleased(e) ? 'released' : 'release'
  if (!e.trailerCheck) return 'trailer'
  if (e.trailerCheck.result !== 'Pass') return 'trailerFail'
  if (!e.loadStartedAt) return 'ready'
  if (!e.loadFinishedAt) return 'loading'
  if (!e.loadingInspection) return 'inspect'
  if (e.loadingInspection.result !== 'Pass') return 'failed'
  return isReleased(e) ? 'released' : 'release'
}
const WORK_STEPS = [
  { key: 'trailer', label: 'Trailer' },
  { key: 'load', label: 'Loading' },
  { key: 'inspect', label: 'Inspection' },
  { key: 'release', label: 'Release' },
]
const stepIndex = { trailer: 0, trailerFail: 0, ready: 1, loading: 1, inspect: 2, failed: 2, release: 3, released: 4 }

// One truck at a dock on Dock & Loading: its steps, the timer for the step it's in, and the button for
// what comes next.
function DockWorkCard({ e, now, selected, onOpen, onLoading, onRelease }) {
  const phase = dockPhase(e)
  const at = stepIndex[phase]
  const stage = currentStage(e)
  const purposes = e.visitPurpose ?? []
  const draft = (part) => (hasDraft(e.id, part) ? ' · draft' : '')
  const action = {
    trailer: { label: `Check trailer${draft('trailer')}`, run: () => onOpen(e, 'trailer') },
    trailerFail: { label: 'Re-check trailer', run: () => onOpen(e, 'trailer'), bad: true },
    ready: { label: 'Start loading', run: () => onLoading(e, { loadStartedAt: Date.now() }) },
    loading: { label: 'Loading finished', run: () => onLoading(e, { loadFinishedAt: Date.now() }) },
    inspect: { label: `Inspect load${draft('load')}`, run: () => onOpen(e, 'load') },
    failed: { label: 'Re-inspect', run: () => onOpen(e, 'load'), bad: true },
    release: { label: 'Release to gate', run: () => onRelease(e) },
  }[phase]
  return (
    <article
      className={
        'grid grid-cols-[6px_1fr] overflow-hidden rounded-lg border bg-page ' + (selected ? 'border-signal-line bg-panel' : 'border-transparent')
      }
    >
      <Stripe purposes={purposes} />
      <div className="min-w-0 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow text-muted">Dock {e.dockDoor}</div>
            <div className="truncate font-display text-[17px] leading-tight font-semibold">{e.trailerNumber || '—'}</div>
            <div className="truncate text-[13px] text-muted">
              {[e.truckName, purposes.join(' + '), e.pickupNumber && `Order ${e.pickupNumber}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          {stage && <TimerPill stage={stage.key} since={stage.since} now={now} />}
        </div>
        {/* Steps: done ✓, current filled, later hollow. */}
        <ol className="mt-2 grid grid-cols-4 gap-1" aria-label="Steps at the dock">
          {WORK_STEPS.map((st, i) => {
            const done = i < at
            const current = i === at
            const bad = current && (phase === 'trailerFail' || phase === 'failed')
            return (
              <li key={st.key} className="min-w-0">
                <span
                  className={
                    'block h-1 rounded-full ' + (done ? 'bg-ok' : bad ? 'bg-danger' : current ? 'bg-signal' : 'bg-track')
                  }
                />
                <span className={'mt-1 block truncate text-[11.5px] font-semibold ' + (current ? (bad ? 'text-danger' : 'text-ink') : 'text-muted')}>
                  {done ? '✓ ' : ''}
                  {st.label}
                </span>
                <span className="sr-only">{done ? 'done' : current ? 'now' : 'to do'}</span>
              </li>
            )
          })}
        </ol>
        {stage && phase !== 'released' && (
          <div className="mt-2">
            <TimerLine stage={stage.key} since={stage.since} now={now} />
          </div>
        )}
        {phase === 'trailerFail' && <p className="mt-1.5 text-[12.5px] font-semibold text-danger">⚠ {e.trailerCheck.issues?.[0] ?? 'Trailer not OK'}</p>}
        {phase === 'failed' && <p className="mt-1.5 text-[12.5px] font-semibold text-danger">⚠ {e.loadingInspection.issues?.[0] ?? 'Inspection failed'}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {action ? (
            <button type="button" onClick={action.run} className={(action.bad ? ui.btnSmall + ' border-danger text-danger' : ui.btnSmallPrimary) + ' flex-1'}>
              {action.label}
            </button>
          ) : (
            <span className={ui.tag + ' bg-delivery-soft text-delivery'}>✓ Released · waiting for the gate</span>
          )}
          {e.loadingInspection && phase !== 'failed' && (
            <button type="button" onClick={() => onOpen(e, 'load')} className="min-h-10 cursor-pointer px-1 text-[13px] font-semibold underline">
              View inspection
            </button>
          )}
          <DetentionPill e={e} now={now} />
        </div>
      </div>
    </article>
  )
}

// Docks assigned outside DOCKS still appear under At the Docks.
// At-a-glance board of which docks are free. Status is written out, not shown by color alone.
function DockStatus({ occupied, now, wide }) {
  const free = DOCKS.filter((d) => !occupied.has(dockKey(d))).length
  return (
    <section className="rounded-xl bg-panel shadow-card p-4">
      <h2 className="font-display text-[17px] leading-tight font-semibold">
        Dock Status <span className="text-muted">({free} free)</span>
      </h2>
      <ul className={'mt-3 grid grid-cols-3 gap-2' + (wide ? ' md:grid-cols-6' : '')}>
        {DOCKS.map((d) => {
          const truck = occupied.get(dockKey(d))
          return (
            <li
              key={d}
              className={
                'flex min-h-[92px] flex-col rounded-lg border px-2 py-1.5 ' +
                (truck ? 'border-ink bg-ink text-panel' : 'border-ok bg-ok-soft text-ink')
              }
            >
              <span className="text-[12px] font-semibold opacity-80">Dock</span>
              <span className="font-display text-[22px] leading-none font-semibold">{d}</span>
              {truck ? (
                <span className="mt-auto text-[12px] leading-tight">
                  <b className="block">In use</b>
                  <span className="block truncate" title={`Trailer ${truck.trailerNumber}`}>
                    {truck.trailerNumber}
                  </span>
                  {truck.dockAssignedAt && <span className="block opacity-80">{duration(now - truck.dockAssignedAt)}</span>}
                </span>
              ) : (
                <b className="mt-auto text-[13px] text-ok">✓ Free</b>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Trucks without a dock, in the staging bay picked at check-in (or the next free bay if none was picked).
function StagingBays({ entries, now, wide }) {
  const { bays, overflow } = stagingBays(entries)
  const open = bays.filter((e) => !e).length
  return (
    <section className="rounded-xl bg-panel shadow-card p-4">
      <h2 className="font-display text-[17px] leading-tight font-semibold">
        Staging Bays <span className="text-muted">({open} open)</span>
      </h2>
      <ul className={'mt-3 grid grid-cols-3 gap-2' + (wide ? ' md:grid-cols-6' : '')}>
        {bays.map((e, i) => (
          <li
            key={i}
            className={
              'flex min-h-[92px] flex-col rounded-lg border px-2 py-1.5 ' +
              (!e ? 'border-ok bg-ok-soft text-ink' : isDrop(e) ? 'border-drop bg-drop-soft text-ink' : 'border-warn-line bg-warn-soft text-ink')
            }
          >
            <span className="text-[12px] font-semibold opacity-80">Bay</span>
            <span className="font-display text-[22px] leading-none font-semibold">{i + 1}</span>
            {e ? (
              <span className="mt-auto text-[12px] leading-tight">
                <b className="block">{isDrop(e) ? 'Dropped' : 'Waiting'}</b>
                <span className="block truncate" title={`Trailer ${e.trailerNumber}`}>
                  {e.trailerNumber}
                </span>
                <span className="block opacity-80">{duration(now - arrivalMs(e))}</span>
              </span>
            ) : (
              <b className="mt-auto text-[13px] text-ok">✓ Open</b>
            )}
          </li>
        ))}
      </ul>
      {overflow.length > 0 && (
        <p className="mt-2 text-sm font-semibold text-danger">
          ⚠ {overflow.length} more without a bay: {overflow.map((e) => e.trailerNumber).join(', ')}
        </p>
      )}
    </section>
  )
}

// `tiles` lays the children out as a grid of small tiles instead of a single column; `action` sits
// at the right of the title; `className` adds layout classes to the card.
function Panel({ id, title, count, empty, emptyKind, tiles, action, className = '', children }) {
  return (
    <section id={id} className={'scroll-mt-[calc(var(--header-h,114px)+16px)] rounded-xl bg-panel shadow-card p-4 ' + className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[17px] leading-tight font-semibold">
          {title} <span className="text-muted">({count})</span>
        </h2>
        {action}
      </div>
      {count === 0 ? (
        <EmptyState compact kind={emptyKind}>{empty}</EmptyState>
      ) : (
        <div className={'mt-3 grid gap-2' + (tiles ? ' grid-cols-[repeat(auto-fill,minmax(190px,1fr))]' : '')}>{children}</div>
      )}
    </section>
  )
}

// Dock Status, Trucks Waiting and At the Docks. `wide` lays them out full width (Dock & Loading tab).
// Otherwise (Shipping tab) `section="waiting"` renders only Trucks Waiting, filling and scrolling
// inside its parent on wide screens; without it, the dock and bay boxes stack for the sidebar.
export function DockBoard({ entries, onAssignDock, onEdit, onCheckOut, onSaveInspection, onSaveTrailerCheck, onLoading, onRelease, inspector, onSetInspector, wide, section }) {
  const [now, setNow] = useState(Date.now)
  // The checklist open below the cards (wide layout only): { id, part: 'trailer' | 'load' }.
  const [open, setOpen] = useState(null)
  const inspectingId = open?.id ?? null
  // The truck whose release pop-up is open.
  const [releasing, setReleasing] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const onSite = entries.filter((e) => !e.timeOut)
  // Longest-waiting trucks first so the guard sees who to dock next.
  const waiting = onSite.filter((e) => !e.dockDoor).sort((a, b) => arrivalMs(a) - arrivalMs(b))
  const atDock = onSite
    .filter((e) => e.dockDoor)
    .sort((a, b) => dockKey(a.dockDoor).localeCompare(dockKey(b.dockDoor), undefined, { numeric: true }))
  const occupied = new Map(atDock.map((e) => [dockKey(e.dockDoor), e]))

  const waitingPanel = (
    <Panel
      title="Trucks Waiting"
      count={waiting.length}
      empty="No trucks waiting. Trucks logged on the Gate tab appear here."
      className={section === 'waiting' ? 'lg:absolute lg:inset-0 lg:overflow-y-auto' : ''}
    >
      {waiting.map((e) => (
        <WaitingCard key={e.id} e={e} now={now} occupied={occupied} onAssignDock={onAssignDock} onEdit={onEdit} />
      ))}
    </Panel>
  )
  const inspect = (truck, part) => {
    const p = part ?? (['trailer', 'trailerFail'].includes(dockPhase(truck)) ? 'trailer' : 'load')
    setOpen({ id: truck.id, part: p })
    requestAnimationFrame(() => document.getElementById('loading-inspection')?.scrollIntoView({ behavior: 'smooth' }))
  }

  // Dock & Loading tab: the inspector on duty and the timer key, every truck at a dock with its next
  // step, the checklist that step opens, then the live yard map. No Trucks Waiting here (docks are
  // assigned on Shipping).
  if (wide) {
    // Trucks needing the inspector first (a failed check, an inspection due, a release), then the rest.
    const order = { trailerFail: 0, failed: 0, release: 1, inspect: 2, trailer: 3, loading: 4, ready: 5, released: 6 }
    const work = [...atDock].sort((a, b) => order[dockPhase(a)] - order[dockPhase(b)] || dockKey(a.dockDoor).localeCompare(dockKey(b.dockDoor), undefined, { numeric: true }))
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[22px] leading-tight font-semibold">Dock & Loading</h2>
            <p className="text-[13px] text-muted">Check the empty trailer, time the loading, inspect the load, then release it to the gate.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TimerLegend />
            <OnDuty role="inspector" name={inspector} onChange={onSetInspector} id="field-inspector-on-duty" />
          </div>
        </div>
        <section id="at-the-docks" className="scroll-mt-[calc(var(--header-h,114px)+16px)] rounded-xl bg-panel p-4 shadow-card">
          <h2 className="font-display text-[17px] leading-tight font-semibold">
            At the Docks <span className="text-muted">({atDock.length})</span>
          </h2>
          {atDock.length === 0 ? (
            <EmptyState compact kind="dock">
              No docks in use. Assign a dock to a waiting truck on Shipping to see it here.
            </EmptyState>
          ) : (
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2.5">
              {work.map((e) => (
                <DockWorkCard
                  key={e.id}
                  e={e}
                  now={now}
                  selected={e.id === inspectingId}
                  onOpen={inspect}
                  onLoading={onLoading}
                  onRelease={setReleasing}
                />
              ))}
            </div>
          )}
        </section>
        {open && (
          <LoadingInspection
            atDock={atDock}
            selected={open}
            inspector={inspector}
            onSelect={() => setOpen(null)}
            onSave={(id, inspection) => {
              onSaveInspection(id, inspection)
              setOpen(null)
            }}
            onSaveTrailerCheck={(id, check) => {
              onSaveTrailerCheck(id, { ...check, inspector: check.inspector || inspector })
              setOpen(null)
            }}
          />
        )}
        {/* Here the map opens on the trucks needing inspection; tapping one opens its next checklist. */}
        <LiveYard entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} onInspect={(truck) => inspect(truck)} highlightId={inspectingId} />
        <ReleaseDialog
          entry={releasing}
          by={inspector}
          onRelease={(id, data) => {
            onRelease(id, data)
            setReleasing(null)
          }}
          onClose={() => setReleasing(null)}
        />
      </div>
    )
  }
  // Shipping tab: Trucks Waiting sits beside the map; the dock and bay boxes go in the sidebar.
  if (section === 'waiting') return waitingPanel
  return (
    <>
      <DockStatus occupied={occupied} now={now} />
      <StagingBays entries={entries} now={now} />
    </>
  )
}

// Small live copy of the yard map, refreshed every 30 seconds. Clicking it (or Enlarge)
// opens the full-size map in a pop-up; Esc, Close or a click on the dimmed background closes it.
// `stretch`: fill the parent's height (beside At the Docks on Dock & Loading, Trucks Waiting on Shipping).
// `onInspect` (Dock & Loading) adds a Needs inspection / All trucks switch, starting on Needs
// inspection: trucks waiting for their Loading Inspection are highlighted and open it when tapped.
// `highlightId`: the truck picked elsewhere on the page (Dock & Loading), drawn glowing on the map.
function LiveYard({ entries, onEdit, onCheckOut, onInspect, stretch, highlightId }) {
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
  // Check out / View entry leave the Shipping tab, so close the pop-up first.
  const closeThen = (fn) => (e) => {
    close()
    fn(e)
  }

  return (
    <section className={'rounded-xl bg-panel shadow-card p-4 sm:col-span-2 lg:col-span-1' + (stretch ? ' h-full' : '')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[17px] leading-tight font-semibold">{inspecting ? 'Inspection Map' : 'Live Yard Map'}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {onInspect && (
            <div role="group" aria-label="Map view" className="flex gap-1">
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
                    'min-h-11 cursor-pointer rounded-md border px-3 text-[14px] font-semibold ' +
                    (view === id ? 'border-signal bg-signal text-signal-ink' : 'border-edge bg-panel text-ink hover:bg-field')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={open} className="cursor-pointer font-semibold underline">
            ⤢ Enlarge
          </button>
        </div>
      </div>
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
        highlightId={highlightId}
      />

      <dialog
        ref={dialog}
        aria-label="Live yard map"
        onClick={(ev) => ev.target === dialog.current && close()}
        className="m-auto w-[95vw] max-w-[1300px] rounded-xl bg-panel shadow-raised p-0 text-ink backdrop:bg-black/60"
      >
        {/* Padding sits on this wrapper so a click inside the pop-up never reaches the dialog itself. */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[20px] leading-tight font-semibold">{inspecting ? 'Inspection Map' : 'Live Yard Map'}</h2>
            <button type="button" onClick={close} className={ui.btnSmall}>
              ✕ Close
            </button>
          </div>
          <YardMap
            yard={yard}
            gateCounts={gateCounts}
            at={Infinity}
            clock={now}
            live
            onEdit={closeThen(onEdit)}
            onCheckOut={closeThen(onCheckOut)}
            focus={inspecting ? needsInspection : undefined}
            onInspect={inspecting ? closeThen(onInspect) : undefined}
            highlightId={highlightId}
          />
        </div>
      </dialog>
    </section>
  )
}

// Counts for the "Right now" tiles at moment `t`, for their trend lines.
const HOUR = 3600000
function countsAt(entries, t) {
  const yard = yardMetrics(entries, t, t)
  const onSite = entries.filter((e) => arrivalMs(e) <= t && !(departureMs(e) <= t))
  return {
    onSite: onSite.length,
    waiting: yard.waiting.length,
    free: DOCKS.length - DOCKS.filter((d) => yard.atDock.has(dockKey(d))).length,
    over: onSite.filter((e) => !isDrop(e) && t - arrivalMs(e) > DETENTION_FREE_MIN * 60000).length,
    awaiting: onSite.filter(
      (e) => e.loadingInspection?.result === 'Pass' && (e.loadingInspection.inspectedAt ?? 0) <= t && !((e.release?.releasedAt ?? Infinity) <= t),
    ).length,
  }
}

// A small trend line for a stat tile: one series in the chart color, its latest point marked. The
// numbers are in the tile and its title, so the line is decoration for screen readers.
function Sparkline({ values, title }) {
  const W = 84
  const H = 26
  const max = Math.max(1, ...values)
  const step = W / Math.max(1, values.length - 1)
  const y = (v) => H - 3 - (v / max) * (H - 6)
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  return (
    <svg width={W} height={H} viewBox={`-3 0 ${W + 6} ${H}`} className="shrink-0" aria-hidden="true">
      <title>{title}</title>
      <line x1={0} x2={W} y1={H - 3} y2={H - 3} stroke="var(--color-line)" strokeWidth={1} />
      <polyline points={points} fill="none" stroke="var(--color-chart-live)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last * step} cy={y(values[last])} r={3} fill="var(--color-chart-live)" stroke="var(--color-panel)" strokeWidth={1.5} />
    </svg>
  )
}

// "Right now" row at the top of the Shipping page: the figures that say what needs action next, each
// with its trend over the last 8 hours. Each figure's tone is also written in its note, so it never
// relies on color alone.
function SummaryStrip({ entries }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const onSite = entries.filter((e) => !e.timeOut)
  const yard = yardMetrics(entries, Infinity, now)
  const free = DOCKS.filter((d) => !yard.atDock.has(dockKey(d))).length
  const states = onSite.map((e) => detentionState(e, now)).filter(Boolean)
  const over = states.filter((s) => s.level === 'over')
  const near = states.length - over.length
  const fee = over.reduce((s, d) => s + d.fee, 0)
  const awaiting = onSite.filter(awaitingRelease).length
  const released = onSite.filter(isReleased).length
  // Every half hour over the last 8 hours, ending now.
  const history = useMemo(() => {
    const end = Math.floor(now / (HOUR / 2)) * (HOUR / 2)
    return Array.from({ length: 17 }, (_, i) => countsAt(entries, end - (16 - i) * (HOUR / 2)))
  }, [entries, now])
  const series = (key, current) => [...history.slice(0, -1).map((c) => c[key]), current]

  const items = [
    { label: 'On site', value: onSite.length, trend: series('onSite', onSite.length), note: `${yard.drops.length} dropped trailer${yard.drops.length === 1 ? '' : 's'}` },
    {
      label: 'Waiting for a dock',
      value: yard.waiting.length,
      trend: series('waiting', yard.waiting.length),
      note: yard.waiting.length ? `Longest ${duration(yard.longestWaitMs)}` : 'No one waiting',
      tone: yard.waiting.length > 2 ? 'warn' : undefined,
    },
    {
      label: 'Docks free',
      value: `${free} of ${DOCKS.length}`,
      trend: series('free', free),
      note: free ? 'Ready to assign' : '⚠ All docks in use',
      tone: free ? 'good' : 'alert',
    },
    {
      label: 'Past free time',
      value: over.length,
      trend: series('over', over.length),
      note: over.length ? `⚠ Est. $${Math.round(fee)} so far${near ? ` · ${near} near` : ''}` : near ? `${near} near free time` : 'None',
      tone: over.length ? 'alert' : near ? 'warn' : 'good',
    },
    {
      label: 'Awaiting release',
      value: awaiting,
      trend: series('awaiting', awaiting),
      note: (awaiting ? 'Passed · the inspector releases it' : 'None to release') + (released ? ` · ${released} released to gate` : ''),
      tone: awaiting ? 'warn' : undefined,
    },
  ]
  const toneBar = { good: 'bg-ok', warn: 'bg-warn', alert: 'bg-danger' }

  return (
    <section aria-label="Right now" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="relative overflow-hidden rounded-xl bg-panel py-3 pr-3 pl-4 shadow-card">
          {it.tone && <span aria-hidden="true" className={'absolute inset-y-0 left-0 w-1 ' + toneBar[it.tone]} />}
          <div className="text-[13px] font-semibold text-muted">{it.label}</div>
          {/* The trend line drops below the figure when the tile is too narrow for both. */}
          <div className="flex flex-wrap items-end justify-between gap-x-2">
            <div className="font-display text-[24px] leading-tight font-semibold whitespace-nowrap tabular-nums">{it.value}</div>
            <Sparkline values={it.trend} title={`${it.label}, last 8 hours: ${it.trend[0]} → ${it.trend[it.trend.length - 1]}`} />
          </div>
          <div className={'text-[13px] ' + (it.tone === 'alert' ? 'font-semibold text-danger' : 'text-muted')}>{it.note}</div>
        </div>
      ))}
    </section>
  )
}

// Trucks that passed their inspection and wait for Shipping to release them to the gate, oldest first.
// Shipping's view of a truck at a dock: where it is in the work and its timer (the work itself is done
// on Dock & Loading).
function LaneDockCard({ e, now }) {
  const phase = dockPhase(e)
  const at = stepIndex[phase]
  const stage = currentStage(e)
  const words = {
    trailer: 'Trailer check next',
    trailerFail: 'Trailer not OK · re-check',
    ready: 'Ready to load',
    loading: 'Loading',
    inspect: 'Inspection next',
    failed: 'Inspection failed · re-check',
  }[phase]
  return (
    <div className="grid grid-cols-[6px_1fr] overflow-hidden rounded-lg bg-page">
      <Stripe purposes={e.visitPurpose ?? []} />
      <div className="min-w-0 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow text-muted">Dock {e.dockDoor}</div>
            <div className="truncate font-display text-[16px] leading-tight font-semibold">{e.trailerNumber || '—'}</div>
            <div className="truncate text-[13px] text-muted">{[e.truckName, e.customerPickupFor].filter(Boolean).join(' · ')}</div>
          </div>
          {stage && <TimerPill stage={stage.key} since={stage.since} now={now} />}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1" aria-hidden="true">
          {WORK_STEPS.slice(0, 3).map((st, i) => (
            <span key={st.key} className={'h-1 rounded-full ' + (i < at ? 'bg-ok' : i === at ? (phase === 'failed' || phase === 'trailerFail' ? 'bg-danger' : 'bg-signal') : 'bg-track')} />
          ))}
        </div>
        <div className={'mt-1 text-[12.5px] font-semibold ' + (phase === 'failed' || phase === 'trailerFail' ? 'text-danger' : 'text-ink')}>{words}</div>
        {stage && (
          <div className="mt-1.5">
            <TimerLine stage={stage.key} since={stage.since} now={now} />
          </div>
        )}
      </div>
    </div>
  )
}

// A passed truck as Shipping sees it: waiting for the inspector's release, or released and heading
// to the gate (with the checkout timer).
function LanePassedCard({ e, now }) {
  const released = isReleased(e)
  return (
    <div className="grid grid-cols-[6px_1fr] overflow-hidden rounded-lg bg-page">
      <Stripe purposes={e.visitPurpose ?? []} />
      <div className="min-w-0 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow text-muted">Dock {e.dockDoor}</div>
            <div className="truncate font-display text-[16px] leading-tight font-semibold">{e.trailerNumber || '—'}</div>
            <div className="truncate text-[13px] text-muted">
              {[e.truckName, e.loadingInspection?.inspectedAt && `passed ${clockTime(e.loadingInspection.inspectedAt)}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <TimerPill stage="checkout" since={inspectionSavedAt(e)} now={now} />
        </div>
        <div className="mt-2">
          <TimerLine stage="checkout" since={inspectionSavedAt(e)} now={now} />
        </div>
        <div className="mt-2">
          {released ? (
            <span className={ui.tag + ' bg-delivery-soft text-delivery'}>✓ Released {e.release?.releasedBy ? `by ${e.release.releasedBy}` : ''} · to the gate</span>
          ) : (
            <span className={ui.tag + ' bg-warn-soft text-ink ring-1 ring-warn-line/40'}>Waiting for the inspector to release it</span>
          )}
        </div>
      </div>
    </div>
  )
}

// A column of the Shipping work board: title, count and the target for its step.
function Lane({ title, count, target, empty, children }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-[17px] leading-tight font-semibold">
          {title} <span className="text-muted">({count})</span>
        </h2>
        {target && <span className="text-[12px] text-muted">{target}</span>}
      </div>
      {count === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">{empty}</p>
      ) : (
        <div className="mt-3 grid gap-2">{children}</div>
      )}
    </section>
  )
}

// Shipping's work board: who needs a dock, who's at one (and where in the work), who has passed.
function WorkBoard({ entries, onAssignDock, onEdit }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const onSite = entries.filter((e) => !e.timeOut)
  const atDock = onSite.filter((e) => e.dockDoor)
  const occupied = new Map(atDock.map((e) => [dockKey(e.dockDoor), e]))
  const waiting = onSite.filter((e) => !e.dockDoor && !isDrop(e)).sort((a, b) => arrivalMs(a) - arrivalMs(b))
  const passed = atDock.filter((e) => awaitingRelease(e) || isReleased(e)).sort((a, b) => (inspectionSavedAt(a) ?? 0) - (inspectionSavedAt(b) ?? 0))
  const working = atDock
    .filter((e) => !passed.includes(e))
    .sort((a, b) => dockKey(a.dockDoor).localeCompare(dockKey(b.dockDoor), undefined, { numeric: true }))
  const range = (k) => `target ${STAGES[k].min}–${STAGES[k].max} min`
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Lane title="Needs a Dock" count={waiting.length} target={`assign within ${range('dock').replace('target ', '')}`} empty="Every truck has a dock.">
        {waiting.map((e) => (
          <WaitingCard key={e.id} e={e} now={now} occupied={occupied} onAssignDock={onAssignDock} onEdit={onEdit} />
        ))}
      </Lane>
      <Lane
        title="At the Docks"
        count={working.length}
        target={`pre-load ${STAGES.preload.min}–${STAGES.preload.max} · load ${STAGES.load.min}–${STAGES.load.max} · inspect ${STAGES.inspect.min}–${STAGES.inspect.max} min`}
        empty="No trucks loading right now."
      >
        {working.map((e) => (
          <LaneDockCard key={e.id} e={e} now={now} />
        ))}
      </Lane>
      <Lane title="Passed Inspection" count={passed.length} target={`release and check out within ${STAGES.checkout.max} min`} empty="Nothing passed and waiting to leave.">
        {passed.map((e) => (
          <LanePassedCard key={e.id} e={e} now={now} />
        ))}
      </Lane>
    </div>
  )
}

// Average minutes per stage for trucks checked in today, against each stage's target window (shaded).
function stageMinutesToday(entries, now) {
  const today = dayKey(new Date(now))
  const list = entries.filter((e) => e.dateIn === today)
  const pairs = {
    checkIn: (e) => [e.checkInStartedAt, e.createdAt],
    dock: (e) => [e.createdAt, e.dockAssignedAt],
    preload: (e) => [e.dockAssignedAt, e.loadStartedAt],
    load: (e) => [e.loadStartedAt, e.loadFinishedAt],
    inspect: (e) => [e.loadFinishedAt, inspectionSavedAt(e)],
    checkout: (e) => [inspectionSavedAt(e), e.checkedOutAt ?? (e.timeOut ? departureMs(e) : undefined)],
  }
  return Object.entries(pairs).map(([key, get]) => {
    const mins = list
      .map(get)
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
      .map(([a, b]) => (b - a) / 60000)
    const avg = mins.length ? mins.reduce((x, y) => x + y, 0) / mins.length : null
    return { key, stage: STAGES[key], avg, n: mins.length }
  })
}

function StageToday({ entries }) {
  const [now] = useState(Date.now)
  const rows = stageMinutesToday(entries, now)
  const scale = Math.max(...rows.map((r) => Math.max(r.avg ?? 0, r.stage.max))) * 1.1
  return (
    <section className="flex min-w-0 flex-col rounded-xl bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[17px] leading-tight font-semibold">Time per Stage Today</h2>
        <span className="text-[12px] text-muted">average · shaded = target</span>
      </div>
      <ul className="mt-3 grid gap-3">
        {rows.map((r) => {
          const tone = r.avg == null ? null : r.avg > r.stage.max ? 'late' : r.avg >= r.stage.min ? 'window' : 'ok'
          return (
            <li key={r.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
              <span className="truncate text-[13px] font-semibold" title={`${r.stage.from} → ${r.stage.to}`}>
                {r.stage.label}
              </span>
              <span className="relative h-3 rounded-sm bg-track" aria-hidden="true">
                <span
                  className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(15_23_42/0.16)_0_3px,transparent_3px_6px)]"
                  style={{ left: `${(r.stage.min / scale) * 100}%`, width: `${((r.stage.max - r.stage.min) / scale) * 100}%` }}
                />
                {r.avg != null && (
                  <span
                    className={'absolute inset-y-0 left-0 rounded-sm ' + (tone === 'late' ? 'bg-danger' : 'bg-chart-live')}
                    style={{ width: `${Math.min(100, (r.avg / scale) * 100)}%` }}
                  />
                )}
              </span>
              <span className={'figure w-24 text-right text-[13px] ' + (tone === 'late' ? 'font-semibold text-danger' : 'text-ink')}>
                {r.avg == null ? <span className="text-muted">—</span> : `${Math.round(r.avg)}m`}
                {tone === 'late' && ' ⚠'}
                {r.n > 0 && <span className="ml-1 text-[11px] text-muted">({r.n})</span>}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[12px] text-muted">Trucks checked in today, per stage they’ve finished. Red: average over the stage’s limit.</p>
    </section>
  )
}

// Lays out the Shipping page: the "Right now" row; the work board (needs a dock, at the docks, passed
// inspection); the live yard map beside the time per stage today; then `children` on the left and the
// dock and bay boxes in a sticky right column. Below lg everything stacks.
export default function Dashboard({ entries, onAssignDock, onEdit, onCheckOut, children }) {
  const board = { entries, onAssignDock, onEdit, onCheckOut }
  return (
    <div className="space-y-5">
      <SummaryStrip entries={entries} />
      <WorkBoard entries={entries} onAssignDock={onAssignDock} onEdit={onEdit} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <LiveYard entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} stretch />
        </div>
        <StageToday entries={entries} />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <aside className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-[calc(var(--header-h,114px)+16px)] lg:order-2 lg:max-h-[calc(100vh-var(--header-h,114px)-32px)] lg:grid-cols-1 lg:overflow-y-auto">
          <DockBoard {...board} />
        </aside>
        <div className="min-w-0 space-y-5 lg:order-1">{children}</div>
      </div>
    </div>
  )
}

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
          <span className="text-[15px] font-semibold">Waiting {duration(waited)}</span>
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

// Compact At the Docks tile for the Dock & Loading tab: dock, trailer, carrier, purpose, time at the
// dock and inspection. Clicking selects it for the panel's Inspect button.
function DockTile({ e, now, selected, onSelect }) {
  const purposes = e.visitPurpose ?? []
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(e.id)}
      className={
        'grid cursor-pointer grid-cols-[6px_1fr] overflow-hidden rounded-lg border bg-page text-left ' +
        (selected ? 'border-signal-line bg-panel' : 'border-transparent hover:border-line')
      }
    >
      <Stripe purposes={purposes} />
      <div className="min-w-0 px-2.5 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[16px] leading-none font-semibold whitespace-nowrap">Dock {e.dockDoor}</span>
          <span className="text-[13px] font-semibold whitespace-nowrap" title={`At dock since ${clockTime(e.dockAssignedAt)}`}>
            {duration(now - e.dockAssignedAt)}
          </span>
        </div>
        <div className="mt-1 truncate text-[15px] font-bold" title={e.trailerNumber}>
          {e.trailerNumber || '—'}
        </div>
        <div className="truncate text-[13px] text-muted" title={[e.truckName, ...purposes].join(' · ')}>
          {[e.truckName, purposes.join(' + ')].filter(Boolean).join(' · ')}
        </div>
        {/* The tag may wrap in a narrow tile rather than run past its edge. */}
        <div className="mt-1.5">
          <InspectionTag e={e} wrap />
        </div>
      </div>
    </button>
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
export function DockBoard({ entries, onAssignDock, onEdit, onCheckOut, onSaveInspection, wide, section }) {
  const [now, setNow] = useState(Date.now)
  // Truck whose Loading Inspection is open (wide layout only).
  const [inspectingId, setInspectingId] = useState(null)
  // At the Docks tile picked for the panel's Inspect button (wide layout only).
  const [selectedTileId, setSelectedTileId] = useState(null)

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
  const inspect = (truck) => {
    setInspectingId(truck.id)
    requestAnimationFrame(() => document.getElementById('loading-inspection')?.scrollIntoView({ behavior: 'smooth' }))
  }
  // Dock & Loading tab: small tiles; click one to select it, then the panel's Inspect button opens its
  // Loading Inspection (check out from the Gate or Shipping tab). Shipping tab: full cards with Check out.
  const selectedTile = atDock.find((e) => e.id === selectedTileId)
  const inspectButton = wide && atDock.length > 0 && (
    <button type="button" onClick={() => inspect(selectedTile)} disabled={!selectedTile} className={ui.btnSmallPrimary}>
      {!selectedTile
        ? 'Select a tile to inspect'
        : `${selectedTile.loadingInspection ? 'View Inspection' : 'Inspect'} · Dock ${selectedTile.dockDoor}`}
    </button>
  )
  const docksPanel = (
    <Panel
      id={wide ? 'at-the-docks' : undefined}
      title="At the Docks"
      count={atDock.length}
      emptyKind="dock"
      empty="No docks in use. Assign a dock to a waiting truck to see it here."
      tiles={wide}
      action={inspectButton}
    >
      {atDock.map((e) =>
        wide ? (
          <DockTile key={e.id} e={e} now={now} selected={e.id === selectedTileId} onSelect={setSelectedTileId} />
        ) : (
          <DockCard key={e.id} e={e} now={now} onCheckOut={onCheckOut} />
        ),
      )}
    </Panel>
  )

  // Dock & Loading tab: At the Docks beside the live yard map; no Trucks Waiting there (docks are
  // assigned from the Shipping tab).
  if (wide) {
    return (
      <div className="space-y-5">
        {/* At the Docks takes 1/3 and the map 2/3 of the width; both cards stretch to the taller one. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {docksPanel}
          {/* The wrapper keeps LiveYard's sidebar column spans out of this grid. Here the map opens on
              the trucks needing inspection; tapping one selects its tile and opens its inspection. */}
          <div>
            <LiveYard
              entries={entries}
              onEdit={onEdit}
              onCheckOut={onCheckOut}
              onInspect={(truck) => {
                setSelectedTileId(truck.id)
                inspect(truck)
              }}
              stretch
              highlightId={inspectingId ?? selectedTileId}
            />
          </div>
        </div>
        <LoadingInspection
          atDock={atDock}
          selectedId={inspectingId}
          onSelect={setInspectingId}
          onSave={(id, inspection) => {
            onSaveInspection(id, inspection)
            setInspectingId(null)
          }}
        />
      </div>
    )
  }
  // Shipping tab: Trucks Waiting sits beside the map; the dock and bay boxes go in the sidebar.
  if (section === 'waiting') return waitingPanel
  return (
    <>
      <DockStatus occupied={occupied} now={now} />
      {docksPanel}
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
      note: (awaiting ? 'Passed inspection · release below' : 'None to release') + (released ? ` · ${released} released to gate` : ''),
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
function ReadyForRelease({ entries, onStartRelease }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const ready = entries
    .filter(awaitingRelease)
    .sort((a, b) => (a.loadingInspection.inspectedAt ?? 0) - (b.loadingInspection.inspectedAt ?? 0))
  return (
    <Panel title="Ready for Release" count={ready.length} empty="Nothing waiting for release. Trucks appear here when their loading inspection passes." tiles>
      {ready.map((e) => (
        <div key={e.id} className="grid grid-cols-[6px_1fr] overflow-hidden rounded-lg bg-page">
          <Stripe purposes={e.visitPurpose ?? []} />
          <div className="flex min-w-0 flex-col gap-1 px-2.5 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-display text-[16px] leading-tight font-semibold whitespace-nowrap">Dock {e.dockDoor}</span>
              {e.loadingInspection.inspectedAt && (
                <span className="text-[13px] font-semibold whitespace-nowrap">Passed {ago(now - e.loadingInspection.inspectedAt)}</span>
              )}
            </div>
            <div className="truncate text-[15px] font-bold" title={`${e.trailerNumber} · ${e.truckName}`}>
              {e.trailerNumber} · {e.truckName}
            </div>
            <div className="truncate text-[13px] text-muted">
              {[e.customerPickupFor, e.pickupNumber && `Order ${e.pickupNumber}`].filter(Boolean).join(' · ') || 'No order details'}
            </div>
            <DetentionPill e={e} now={now} />
            <button type="button" onClick={() => onStartRelease(e)} className={ui.btnSmallPrimary + ' mt-1 w-full whitespace-nowrap'}>
              Release to gate
            </button>
          </div>
        </div>
      ))}
    </Panel>
  )
}

// Lays out the Shipping page: the "Right now" row; Ready for Release (Shipping's sign-off after a
// passed inspection); then Trucks Waiting (1/3) beside a large live yard map (2/3), as on Dock &
// Loading; then `children` on the left and the dock and bay boxes in a sticky right column. Below lg
// everything stacks, Trucks Waiting first.
export default function Dashboard({ entries, onAssignDock, onEdit, onCheckOut, onStartRelease, children }) {
  const board = { entries, onAssignDock, onEdit, onCheckOut }
  return (
    <div className="space-y-5">
      <SummaryStrip entries={entries} />
      {onStartRelease && <ReadyForRelease entries={entries} onStartRelease={onStartRelease} />}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* The map sets this row's height; Trucks Waiting fills it and scrolls inside when long. */}
        <div className="relative">
          <DockBoard {...board} section="waiting" />
        </div>
        <div>
          <LiveYard entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} stretch />
        </div>
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

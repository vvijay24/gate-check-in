import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, clockTime, dayKey, duration } from '../time'
import AssignDock, { dockKey } from './AssignDock'
import LoadingInspection from './LoadingInspection'
import YardMap from './YardMap'
import { DOCKS } from '../yard'
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
          <span className="font-display text-[19px] leading-tight font-bold break-words">
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
function InspectionTag({ e }) {
  const inspection = e.loadingInspection
  if (!inspection) return <span className={ui.tag + ' bg-signal text-signal-ink'}>Not inspected</span>
  if (inspection.result !== 'Pass') return <span className={ui.tag + ' bg-danger-soft text-danger'}>⚠ Inspection failed</span>
  return isReleased(e) ? (
    <span className={ui.tag + ' bg-delivery-soft text-delivery'}>✓ Released to gate</span>
  ) : (
    <span className={ui.tag + ' bg-ok-soft text-ok'}>✓ Passed · awaiting release</span>
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
          <div className="font-display text-[28px] leading-none font-bold">{e.dockDoor}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[19px] leading-tight font-bold break-words">
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
        'grid cursor-pointer grid-cols-[6px_1fr] overflow-hidden rounded-lg border-2 bg-page text-left ' +
        (selected ? 'border-signal' : 'border-transparent hover:border-line')
      }
    >
      <Stripe purposes={purposes} />
      <div className="min-w-0 px-2.5 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[19px] leading-none font-bold">Dock {e.dockDoor}</span>
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
        <div className="mt-1.5">
          <InspectionTag e={e} />
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
    <section className="rounded-[10px] border border-line bg-panel p-4">
      <h2 className="font-display text-[21px] leading-tight font-bold">
        Dock Status <span className="text-muted">({free} free)</span>
      </h2>
      <ul className={'mt-3 grid grid-cols-3 gap-2' + (wide ? ' md:grid-cols-6' : '')}>
        {DOCKS.map((d) => {
          const truck = occupied.get(dockKey(d))
          return (
            <li
              key={d}
              className={
                'flex min-h-[92px] flex-col rounded-lg border-2 px-2 py-1.5 ' +
                (truck ? 'border-ink bg-ink text-panel' : 'border-ok bg-ok-soft text-ink')
              }
            >
              <span className="text-[12px] font-semibold opacity-80">Dock</span>
              <span className="font-display text-[28px] leading-none font-bold">{d}</span>
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
    <section className="rounded-[10px] border border-line bg-panel p-4">
      <h2 className="font-display text-[21px] leading-tight font-bold">
        Staging Bays <span className="text-muted">({open} open)</span>
      </h2>
      <ul className={'mt-3 grid grid-cols-3 gap-2' + (wide ? ' md:grid-cols-6' : '')}>
        {bays.map((e, i) => (
          <li
            key={i}
            className={
              'flex min-h-[92px] flex-col rounded-lg border-2 px-2 py-1.5 ' +
              (!e ? 'border-ok bg-ok-soft text-ink' : isDrop(e) ? 'border-drop bg-drop-soft text-ink' : 'border-signal bg-signal text-signal-ink')
            }
          >
            <span className="text-[12px] font-semibold opacity-80">Bay</span>
            <span className="font-display text-[28px] leading-none font-bold">{i + 1}</span>
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
function Panel({ id, title, count, empty, tiles, action, className = '', children }) {
  return (
    <section id={id} className={'scroll-mt-[calc(var(--header-h,114px)+16px)] rounded-[10px] border border-line bg-panel p-4 ' + className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[21px] leading-tight font-bold">
          {title} <span className="text-muted">({count})</span>
        </h2>
        {action}
      </div>
      {count === 0 ? (
        <p className="py-2 text-sm text-muted">{empty}</p>
      ) : (
        <div className={'mt-3 grid gap-2' + (tiles ? ' grid-cols-[repeat(auto-fill,minmax(165px,1fr))]' : '')}>{children}</div>
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
function LiveYard({ entries, onEdit, onCheckOut, onInspect, stretch }) {
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
    <section className={'rounded-[10px] border border-line bg-panel p-4 sm:col-span-2 lg:col-span-1' + (stretch ? ' h-full' : '')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[21px] leading-tight font-bold">{inspecting ? 'Inspection Map' : 'Live Yard Map'}</h2>
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
                    'min-h-11 cursor-pointer rounded-md border-2 px-3 text-[14px] font-semibold ' +
                    (view === id ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel text-ink')
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
      />

      <dialog
        ref={dialog}
        aria-label="Live yard map"
        onClick={(ev) => ev.target === dialog.current && close()}
        className="m-auto w-[95vw] max-w-[1300px] rounded-[10px] border border-line bg-panel p-0 text-ink backdrop:bg-black/60"
      >
        {/* Padding sits on this wrapper so a click inside the pop-up never reaches the dialog itself. */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[26px] leading-tight font-bold">{inspecting ? 'Inspection Map' : 'Live Yard Map'}</h2>
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
          />
        </div>
      </dialog>
    </section>
  )
}

// "Right now" row at the top of the Shipping page: the figures that say what needs action next.
// Each figure's tone is also written in its note, so it never relies on color alone.
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

  const items = [
    { label: 'On site', value: onSite.length, note: `${yard.drops.length} dropped trailer${yard.drops.length === 1 ? '' : 's'}` },
    {
      label: 'Waiting for a dock',
      value: yard.waiting.length,
      note: yard.waiting.length ? `Longest ${duration(yard.longestWaitMs)}` : 'No one waiting',
      tone: yard.waiting.length > 2 ? 'warn' : undefined,
    },
    {
      label: 'Docks free',
      value: `${free} of ${DOCKS.length}`,
      note: free ? 'Ready to assign' : '⚠ All docks in use',
      tone: free ? 'good' : 'alert',
    },
    {
      label: 'Past free time',
      value: over.length,
      note: over.length ? `⚠ Est. $${Math.round(fee)} so far${near ? ` · ${near} near` : ''}` : near ? `${near} near free time` : 'None',
      tone: over.length ? 'alert' : near ? 'warn' : 'good',
    },
    {
      label: 'Awaiting release',
      value: awaiting,
      note: (awaiting ? 'Passed inspection · release below' : 'None to release') + (released ? ` · ${released} released to gate` : ''),
      tone: awaiting ? 'warn' : undefined,
    },
  ]
  const toneCls = { good: 'border-l-ok', warn: 'border-l-signal', alert: 'border-l-danger' }

  return (
    <section aria-label="Right now" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className={'rounded-lg border border-l-[5px] border-line bg-panel px-3 py-2 ' + (toneCls[it.tone] ?? '')}>
          <div className="text-[13px] font-semibold text-muted">{it.label}</div>
          <div className="font-display text-[26px] leading-tight font-bold">{it.value}</div>
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
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-[19px] leading-none font-bold">Dock {e.dockDoor}</span>
              {e.loadingInspection.inspectedAt && (
                <span className="text-[13px] font-semibold whitespace-nowrap">Passed {duration(now - e.loadingInspection.inspectedAt)} ago</span>
              )}
            </div>
            <div className="truncate text-[15px] font-bold" title={`${e.trailerNumber} · ${e.truckName}`}>
              {e.trailerNumber} · {e.truckName}
            </div>
            <div className="truncate text-[13px] text-muted">
              {[e.customerPickupFor, e.pickupNumber && `Order ${e.pickupNumber}`].filter(Boolean).join(' · ') || 'No order details'}
            </div>
            <DetentionPill e={e} now={now} />
            <button type="button" onClick={() => onStartRelease(e)} className={ui.btnSmallPrimary + ' mt-1 w-full'}>
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
        <aside className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-[140px] lg:order-2 lg:max-h-[calc(100vh-160px)] lg:grid-cols-1 lg:overflow-y-auto">
          <DockBoard {...board} />
        </aside>
        <div className="min-w-0 space-y-5 lg:order-1">{children}</div>
      </div>
    </div>
  )
}

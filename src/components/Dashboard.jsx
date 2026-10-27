import { useEffect, useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, clockTime, duration } from '../time'
import AssignDock, { dockKey } from './AssignDock'
import LoadingInspection from './LoadingInspection'
import { DOCKS } from '../yard'
import { isDrop, stagingBays } from '../metrics'

// Waits longer than this are flagged (with text, not just color).
const LONG_WAIT_MS = 2 * 60 * 60 * 1000

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
  const long = waited > LONG_WAIT_MS
  const purposes = e.visitPurpose ?? []

  return (
    <div className="grid grid-cols-[8px_1fr] overflow-hidden rounded-lg bg-page">
      <Stripe purposes={purposes} />
      <div className="px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-display text-[19px] leading-tight font-bold break-words">
            {e.trailerNumber} · {e.truckName}
          </span>
          <span className={'text-[15px] font-semibold ' + (long ? 'text-danger' : 'text-ink')}>
            {long && '⚠ Over 2h · '}Waiting {duration(waited)}
          </span>
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

// Inspection state as a tag; the word carries the meaning, color only reinforces it.
function InspectionTag({ inspection }) {
  if (!inspection) return <span className={ui.tag + ' bg-signal text-signal-ink'}>Not inspected</span>
  return inspection.result === 'Pass' ? (
    <span className={ui.tag + ' bg-ok-soft text-ok'}>✓ Inspection passed</span>
  ) : (
    <span className={ui.tag + ' bg-danger-soft text-danger'}>⚠ Inspection failed</span>
  )
}

function DockCard({ e, now, onCheckOut, onInspect }) {
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
          <div className="mt-1">
            <InspectionTag inspection={e.loadingInspection} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {onInspect && (
              <button onClick={() => onInspect(e)} className={ui.btnSmallPrimary}>
                {e.loadingInspection ? 'View Inspection' : 'Inspect'}
              </button>
            )}
            <button onClick={() => onCheckOut(e)} className={ui.btnSmall}>
              Check out
            </button>
          </div>
        </div>
      </div>
    </div>
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

// Trucks without a dock, filled into the staging bays in arrival order (longest wait in Bay 1).
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

function Panel({ title, count, empty, children }) {
  return (
    <section className="rounded-[10px] border border-line bg-panel p-4">
      <h2 className="font-display text-[21px] leading-tight font-bold">
        {title} <span className="text-muted">({count})</span>
      </h2>
      {count === 0 ? <p className="py-2 text-sm text-muted">{empty}</p> : <div className="mt-3 grid gap-2">{children}</div>}
    </section>
  )
}

// Dock Status, Trucks Waiting and At the Docks. `wide` lays them out full width (Dock & Loading tab);
// otherwise they render as stacked boxes for a narrow column.
export function DockBoard({ entries, onAssignDock, onEdit, onCheckOut, onSaveInspection, wide }) {
  const [now, setNow] = useState(Date.now)
  // Truck whose Loading Inspection is open (wide layout only).
  const [inspectingId, setInspectingId] = useState(null)

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

  const panels = (
    <>
      <Panel title="Trucks Waiting" count={waiting.length} empty="No trucks waiting. Trucks logged on the Gate tab appear here.">
        {waiting.map((e) => (
          <WaitingCard key={e.id} e={e} now={now} occupied={occupied} onAssignDock={onAssignDock} onEdit={onEdit} />
        ))}
      </Panel>
      <Panel title="At the Docks" count={atDock.length} empty="No docks in use. Assign a dock to a waiting truck to see it here.">
        {atDock.map((e) => (
          <DockCard
            key={e.id}
            e={e}
            now={now}
            onCheckOut={onCheckOut}
            onInspect={
              wide
                ? (truck) => {
                    setInspectingId(truck.id)
                    requestAnimationFrame(() => document.getElementById('loading-inspection')?.scrollIntoView({ behavior: 'smooth' }))
                  }
                : undefined
            }
          />
        ))}
      </Panel>
    </>
  )

  if (wide) {
    return (
      <div className="space-y-5">
        <DockStatus occupied={occupied} now={now} wide />
        <StagingBays entries={entries} now={now} wide />
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">{panels}</div>
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
  return (
    <>
      <DockStatus occupied={occupied} now={now} />
      <StagingBays entries={entries} now={now} />
      {panels}
    </>
  )
}

// Lays out the Shipping page: `children` on the left, the dock boxes in a sticky right column
// (stacked above the content below lg).
export default function Dashboard({ entries, onAssignDock, onEdit, onCheckOut, children }) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <aside className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-[140px] lg:order-2 lg:max-h-[calc(100vh-160px)] lg:grid-cols-1 lg:overflow-y-auto">
        <DockBoard entries={entries} onAssignDock={onAssignDock} onEdit={onEdit} onCheckOut={onCheckOut} />
      </aside>
      <div className="min-w-0 space-y-5 lg:order-1">{children}</div>
    </div>
  )
}

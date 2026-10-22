import { useEffect, useState } from 'react'
import * as ui from '../ui'
import { arrivalMs, clockTime, duration } from '../time'

// Waits longer than this are flagged (with text, not just color).
const LONG_WAIT_MS = 2 * 60 * 60 * 1000

const dockKey = (dock) => String(dock ?? '').trim().toUpperCase()

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
  const [assigning, setAssigning] = useState(false)
  const [dock, setDock] = useState('')
  const [error, setError] = useState('')
  const waited = now - arrivalMs(e)
  const long = waited > LONG_WAIT_MS
  const purposes = e.visitPurpose ?? []

  const save = (ev) => {
    ev.preventDefault()
    const key = dockKey(dock)
    if (!key) return setError('Enter a dock #')
    const busy = occupied.get(key)
    if (busy) return setError(`Dock ${dock.trim()} is in use by trailer ${busy.trailerNumber}. Check it out first.`)
    onAssignDock(e.id, dock.trim())
  }

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

        {assigning ? (
          <form onSubmit={save} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
            <div className="w-32">
              <label htmlFor={`dock-${e.id}`} className={ui.label + ' mb-1'}>
                Dock #
              </label>
              <input
                id={`dock-${e.id}`}
                value={dock}
                onChange={(ev) => {
                  setDock(ev.target.value)
                  setError('')
                }}
                inputMode="numeric"
                autoFocus
                className={ui.input + (error ? ui.inputError : '')}
              />
            </div>
            <button type="submit" className={ui.btnSmallPrimary + ' min-h-[52px]'}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setAssigning(false)
                setDock('')
                setError('')
              }}
              className={ui.btnSmall + ' min-h-[52px]'}
            >
              Cancel
            </button>
            {error && <p className={ui.errorText + ' w-full'}>{error}</p>}
          </form>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button onClick={() => setAssigning(true)} className={ui.btnSmallPrimary}>
              Assign Dock
            </button>
            <button onClick={() => onEdit(e)} className="cursor-pointer py-1 text-sm underline">
              View entry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

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
          <button onClick={() => onCheckOut(e)} className={ui.btnSmall + ' mt-2'}>
            Check out
          </button>
        </div>
      </div>
    </div>
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

// Lays out the Shipping page: `children` on the left, the two dock panels as compact boxes
// in a sticky right column (stacked above the content below lg).
export default function Dashboard({ entries, onAssignDock, onEdit, onCheckOut, children }) {
  const [now, setNow] = useState(Date.now)

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

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <aside className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-[140px] lg:order-2 lg:max-h-[calc(100vh-160px)] lg:grid-cols-1 lg:overflow-y-auto">
        <Panel title="Trucks Waiting" count={waiting.length} empty="No trucks waiting. Trucks logged on the Gate tab appear here.">
          {waiting.map((e) => (
            <WaitingCard key={e.id} e={e} now={now} occupied={occupied} onAssignDock={onAssignDock} onEdit={onEdit} />
          ))}
        </Panel>
        <Panel title="At the Docks" count={atDock.length} empty="No docks in use. Assign a dock to a waiting truck to see it here.">
          {atDock.map((e) => (
            <DockCard key={e.id} e={e} now={now} onCheckOut={onCheckOut} />
          ))}
        </Panel>
      </aside>
      <div className="min-w-0 space-y-5 lg:order-1">{children}</div>
    </div>
  )
}

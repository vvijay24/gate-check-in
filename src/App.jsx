import { useEffect, useRef, useState } from 'react'
import CheckInForm from './components/CheckInForm'
import CheckOutPage from './components/CheckOutPage'
import GuardOnDuty from './components/GuardOnDuty'
import EntryLog from './components/EntryLog'
import ShippingDashboard from './components/ShippingDashboard'
import { DockBoard, phaseOf } from './components/Dashboard'
import Messages from './components/Messages'
import Overview from './components/Overview'
import { makeSampleEntries } from './sampleData'
import { awaitingRelease, checkOutBlock, isReleased } from './handoff'
import { Icon } from './icons'

const STORAGE_KEY = 'guard-load-log'
const EVENTS_KEY = 'gate-events'
// The guard on duty, set once per shift in the Gate header and kept on this device.
const GUARD_KEY = 'guard-on-duty'

const TABS = [
  { id: 'gate', label: 'Gate', icon: 'gate' },
  { id: 'shipping', label: 'Shipping', icon: 'shipping' },
  { id: 'docks', label: 'Loading & Inspection', icon: 'dock' },
  { id: 'analytics', label: 'Overview', icon: 'overview' },
]

const GATE_MODES = [
  { id: 'in', label: 'Check In', icon: 'checkIn' },
  { id: 'out', label: 'Check Out', icon: 'checkOut' },
]

const timeNow = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
    // Older entries stored a single `loadType`; convert to the `visitPurpose` list.
    // Entries from before gates were recorded came in Gate 1 and, if departed, left through Gate 2.
    return saved.map(({ loadType, ...e }) => ({
      ...e,
      visitPurpose: e.visitPurpose ?? (loadType ? [loadType] : []),
      gateIn: e.gateIn || 'Gate 1',
      gateOut: e.gateOut || (e.timeOut ? 'Gate 2' : ''),
    }))
  } catch {
    return []
  }
}

export default function App() {
  const [entries, setEntries] = useState(loadEntries)
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [clock, setClock] = useState(timeNow)
  const [tab, setTab] = useState('gate')
  // Gate sub-tab; `editing` is the entry open in that form (none = new check-in / truck list).
  const [gateMode, setGateMode] = useState('in')
  // Falls back to whoever logged the latest entry, so an existing device keeps its guard.
  const [guard, setGuard] = useState(() => {
    try {
      return localStorage.getItem(GUARD_KEY) ?? entries[0]?.guardOnDuty ?? ''
    } catch {
      return entries[0]?.guardOnDuty ?? ''
    }
  })
  const changeGuard = (name) => {
    setGuard(name)
    try {
      localStorage.setItem(GUARD_KEY, name)
    } catch {
      // Only a convenience; the name still applies for this session.
    }
  }

  useEffect(() => {
    const t = setInterval(() => setClock(timeNow()), 15000)
    return () => clearInterval(t)
  }, [])

  // The header's height as --header-h, so things pinned below it (the Overview sidebar) start exactly
  // where it ends, even when its contents wrap.
  const headerRef = useRef(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
      setStorageError(false)
    } catch {
      // Usually the storage quota is full (photos are large); entries stay in memory for this session.
      setStorageError(true)
    }
  }, [entries])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(t)
  }, [notice])

  // Gate events the Overview's Data Quality section counts; today only check-outs blocked because
  // the truck wasn't inspected or released. Kept in this browser beside the entries.
  const [gateEvents, setGateEvents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(EVENTS_KEY)) ?? []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(gateEvents))
    } catch {
      // Only the Overview counts these; losing them doesn't affect the gate log.
    }
  }, [gateEvents])

  const handleSave = (form) => {
    if (form.id) {
      const checkedOut = gateMode === 'out' && !editing?.timeOut
      // Anything but a first check-out is a correction to a saved entry; the Overview counts them.
      setEntries((list) =>
        list.map((e) =>
          e.id === form.id
            ? { ...form, updatedAt: Date.now(), ...(!checkedOut && { edits: (e.edits ?? 0) + 1, editedAt: Date.now() }) }
            : e,
        ),
      )
      setEditing(null)
      setNotice(checkedOut ? `Checked out ${form.truckName} — trailer ${form.trailerNumber}` : `Updated entry for ${form.truckName}`)
    } else {
      // The form shows its own "Check In Confirmed" banner, so no page notice here.
      setEntries((list) => [{ ...form, id: crypto.randomUUID(), createdAt: Date.now() }, ...list])
    }
  }

  const openGate = (mode, entry) => {
    setGateMode(mode)
    setEditing(entry)
    setTab('gate')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const handleEdit = (entry) => openGate('in', entry)
  const handleCheckOut = (entry) => {
    // A guard opening a truck that can't leave yet is a mistake the system stopped.
    if (checkOutBlock(entry)) setGateEvents((list) => [...list, { type: 'blocked', id: entry.id, at: Date.now() }])
    openGate('out', entry)
  }

  const handleAssignDock = (id, dockDoor) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, dockDoor, dockAssignedAt: Date.now() } : e)))
    const entry = entries.find((e) => e.id === id)
    setNotice(`Trailer ${entry?.trailerNumber ?? ''} assigned to dock ${dockDoor}`)
  }

  // Loading & Inspection's "Loading started" / "Loading finished": `patch` is { loadStartedAt } or { loadFinishedAt }.
  const handleLoading = (id, patch) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    const entry = entries.find((e) => e.id === id)
    setNotice(`Trailer ${entry?.trailerNumber ?? ''}: loading ${patch.loadStartedAt ? 'started' : 'finished'}`)
  }

  // Loading & Inspection's trailer check, done on the empty trailer before loading. A pass lets the dock
  // start loading; a fail stays on the dock card until the trailer is re-checked.
  const handleSaveTrailerCheck = (id, trailerCheck) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, trailerCheck } : e)))
    const trailer = entries.find((e) => e.id === id)?.trailerNumber ?? ''
    setNotice(
      trailerCheck.result === 'Pass'
        ? `Trailer ${trailer} checked · ready to load`
        : `Trailer ${trailer} not OK · ${trailerCheck.issues[0] ?? 're-check needed'}`,
    )
  }

  // Saves the Loading Inspection on the entry; the applied seal fills Outgoing Seals # if it's still empty.
  // Saving an inspection again clears any earlier release, so the inspector must release the truck again.
  const handleSaveInspection = (id, loadingInspection) => {
    setEntries((list) =>
      list.map((e) =>
        e.id === id
          ? { ...e, loadingInspection, release: undefined, outgoingSeals: e.outgoingSeals || loadingInspection.sealApplied }
          : e,
      ),
    )
    const trailer = entries.find((e) => e.id === id)?.trailerNumber ?? ''
    setNotice(
      loadingInspection.result === 'Pass'
        ? `Inspection passed · trailer ${trailer} is ready to release to the gate`
        : `Inspection failed for trailer ${trailer} · re-check needed before it can leave`,
    )
  }

  // The inspector releases a truck that passed its inspection to the gate (Loading & Inspection only;
  // Shipping just sees the status). The confirmed seal and order
  // number go onto the visit, so the Gate's check-out starts with them.
  const handleRelease = (id, { orderNo, seal, paperwork, releasedBy, note }) => {
    setEntries((list) =>
      list.map((e) =>
        e.id === id
          ? {
              ...e,
              pickupNumber: orderNo || e.pickupNumber,
              outgoingSeals: seal || e.outgoingSeals,
              release: { releasedAt: Date.now(), releasedBy, paperwork, orderNo, seal, note },
            }
          : e,
      ),
    )
    const trailer = entries.find((e) => e.id === id)?.trailerNumber ?? ''
    setNotice(`Trailer ${trailer} released to the gate`)
  }

  // Tab badges: what's waiting for each team.
  // Loading & Inspection: loaded trucks to inspect or re-check, and passed trucks to release.
  const inspectorTodo = entries.filter((e) => !e.timeOut && e.dockDoor && (awaitingRelease(e) || ['inspect', 'failed'].includes(phaseOf(e)))).length
  const badges = { docks: inspectorTodo, gate: entries.filter(isReleased).length }
  const badgeWords = { docks: 'to inspect or release', gate: 'released to the gate' }

  // Sample visits are marked `sample: true` and go in by arrival time among the real entries;
  // loading again replaces the old samples.
  const handleLoadSample = () => {
    const samples = makeSampleEntries()
    setEntries((list) => [...samples, ...list.filter((e) => !e.sample)].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)))
    setNotice(`Loaded ${samples.length} sample visits from the last two weeks`)
  }
  const handleRemoveSample = () => {
    setEntries((list) => list.filter((e) => !e.sample))
    setNotice('Removed the sample visits')
  }
  const sampleCount = entries.filter((e) => e.sample).length

  const handleDelete = (id) => {
    setEntries((list) => list.filter((e) => e.id !== id))
    if (editing?.id === id) setEditing(null)
  }

  // Check In / Check Out switch, shown in the Gate page's top line.
  const gateSwitch = (
    <div role="tablist" aria-label="Gate form" className="inline-flex gap-1 rounded-xl border-[1.5px] border-line bg-field p-1">
      {GATE_MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={gateMode === m.id}
          onClick={() => openGate(m.id, null)}
          className={
            'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 font-display text-[16px] font-bold ' +
            (gateMode === m.id ? 'bg-signal text-signal-ink' : 'text-ink hover:bg-panel')
          }
        >
          <Icon name={m.icon} size={22} />
          {m.label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-10 bg-chrome text-white shadow-raised">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-3">
          {tab === 'gate' && (
            <>
              <h1 className="font-display text-[24px] leading-none font-bold">Gate</h1>
              <GuardOnDuty guard={guard} onChange={changeGuard} />
            </>
          )}
          {/* ml-auto keeps the clock on the right when there's no title. */}
          <span className="ml-auto font-display text-xl font-semibold text-signal-bright">{clock}</span>
        </div>
        <nav role="tablist" className="no-print mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={
                // The active tab joins the page below it, marked by a slate strip along its top.
                'relative inline-flex min-h-[52px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-xl px-[18px] font-display text-[17px] font-semibold transition-colors duration-150 ' +
                (tab === t.id
                  ? 'bg-page text-ink before:absolute before:inset-x-[18px] before:top-0 before:h-[3px] before:rounded-b-sm before:bg-signal'
                  : 'text-rail-text hover:bg-white/5 hover:text-white')
              }
            >
              <Icon name={t.icon} />
              {t.label}
              {badges[t.id] > 0 && (
                <span
                  className={
                    'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 align-middle font-body text-[13px] font-bold tabular-nums ' +
                    (tab === t.id ? 'bg-signal text-signal-ink' : 'bg-signal-bright text-chrome')
                  }
                >
                  {badges[t.id]}
                  <span className="sr-only"> {badgeWords[t.id]}</span>
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-5">
        {storageError && (
          <div role="alert" className="no-print flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-5 py-4 font-semibold text-danger shadow-card">
            <Icon name="warning" className="mt-0.5" />
            Browser storage is full — the latest changes are NOT saved and will be lost when this page closes. Delete
            old entries to free up space.
          </div>
        )}

        {notice && (
          <div role="status" className="no-print flex animate-pop items-center gap-3 rounded-2xl border border-hair bg-panel px-5 py-4 font-semibold text-ok shadow-raised">
            <Icon name="done" />
            {notice}
          </div>
        )}

        {tab === 'gate' ? (
          <div
            role="tabpanel"
            id="panel-gate"
            aria-labelledby="tab-gate"
            className="mx-auto max-w-[860px]"
          >
            {/* The Check In / Check Out page: one column, at tablet width. */}
            <div className="min-w-0">
              {gateMode === 'out' ? (
                <CheckOutPage
                  key={editing?.id ?? 'list'}
                  entries={entries}
                  initial={editing}
                  guard={guard}
                  switcher={gateSwitch}
                  onPick={handleCheckOut}
                  onSave={handleSave}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <CheckInForm
                  key={editing?.id ?? 'new'}
                  initial={editing}
                  entries={entries}
                  guard={guard}
                  switcher={gateSwitch}
                  onSave={handleSave}
                  onCancel={editing ? () => setEditing(null) : undefined}
                />
              )}
            </div>
          </div>
        ) : tab === 'docks' ? (
          <div role="tabpanel" id="panel-docks" aria-labelledby="tab-docks">
            <DockBoard
              entries={entries}
              onEdit={handleEdit}
              onCheckOut={handleCheckOut}
              onSaveInspection={handleSaveInspection}
              onSaveTrailerCheck={handleSaveTrailerCheck}
              onLoading={handleLoading}
              onRelease={handleRelease}
            />
          </div>
        ) : tab === 'analytics' ? (
          <div role="tabpanel" id="panel-analytics" aria-labelledby="tab-analytics">
            <Overview
              entries={entries}
              sampleCount={sampleCount}
              onLoadSample={handleLoadSample}
              onRemoveSample={handleRemoveSample}
            />
          </div>
        ) : (
          <div role="tabpanel" id="panel-shipping" aria-labelledby="tab-shipping">
            <ShippingDashboard
              entries={entries}
              onAssignDock={handleAssignDock}
              onEdit={handleEdit}
              onCheckOut={handleCheckOut}
              top={
                <EntryLog entries={entries} onEdit={handleEdit} onCheckOut={handleCheckOut} onDelete={handleDelete} onAssignDock={handleAssignDock} />
              }
            />
          </div>
        )}
        {(tab === 'gate' || tab === 'shipping') && <Messages raised={tab === 'gate'} />}
      </main>
    </>
  )
}

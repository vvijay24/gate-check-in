import { useEffect, useRef, useState } from 'react'
import GuardForm from './components/GuardForm'
import CheckOutPicker from './components/CheckOutPicker'
import EntryLog from './components/EntryLog'
import ShippingDashboard from './components/ShippingDashboard'
import { DockBoard } from './components/Dashboard'
import Messages, { ChatButton } from './components/Messages'
import Analytics, { RAIL_PAD } from './components/Analytics'
import { makeSampleEntries } from './sampleData'
import { takenBays } from './metrics'
import { awaitingRelease, checkOutBlock, isReleased } from './handoff'

const STORAGE_KEY = 'guard-load-log'
const EVENTS_KEY = 'gate-events'

// `short` is shown on phones so all four tabs fit on one row.
const TABS = [
  { id: 'gate', label: 'Gate' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'docks', label: 'Dock & Loading', short: 'Docks' },
  { id: 'analytics', label: 'Overview' },
]

const GATE_MODES = [
  { id: 'in', label: 'Check In' },
  { id: 'out', label: 'Check Out' },
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
  // The entry open in the Gate form, by id, so the form always sees its latest state (e.g. Shipping
  // releasing the truck while the guard has it open).
  const [editingId, setEditingId] = useState(null)
  const editing = editingId ? (entries.find((e) => e.id === editingId) ?? null) : null
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [clock, setClock] = useState(timeNow)
  const [tab, setTab] = useState('gate')
  // The demo Shipping chat: opened from the header on the Gate and Shipping tabs.
  const [chatOpen, setChatOpen] = useState(false)
  const chatTab = tab === 'gate' || tab === 'shipping'
  // Gate sub-tab; `editing` is the entry open in that form (none = new check-in / truck picker).
  const [gateMode, setGateMode] = useState('in')

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

  // For a saved entry `form` holds only the fields the guard changed (plus its id), merged onto the
  // latest entry so a dock, inspection or release recorded meanwhile isn't overwritten.
  const handleSave = (form) => {
    if (form.id) {
      const entry = { ...entries.find((e) => e.id === form.id), ...form }
      const checkedOut = gateMode === 'out' && !editing?.timeOut
      // Anything but a first check-out is a correction to a saved entry; the Overview counts them.
      setEntries((list) =>
        list.map((e) =>
          e.id === form.id
            ? { ...e, ...form, updatedAt: Date.now(), ...(!checkedOut && { edits: (e.edits ?? 0) + 1, editedAt: Date.now() }) }
            : e,
        ),
      )
      setEditingId(null)
      setNotice(checkedOut ? `Checked out ${entry.truckName} — trailer ${entry.trailerNumber}` : `Updated entry for ${entry.truckName}`)
    } else {
      // The form shows its own "Check In Confirmed" banner, so no page notice here.
      setEntries((list) => [{ ...form, id: crypto.randomUUID(), createdAt: Date.now() }, ...list])
    }
  }

  const openGate = (mode, entry) => {
    setGateMode(mode)
    setEditingId(entry?.id ?? null)
    setTab('gate')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const handleEdit = (entry) => openGate('in', entry)
  // A guard trying to check out a truck that can't leave yet is a mistake the system stopped; it's
  // counted once per truck and reason. Not counted when the screen already said so (`warned`, e.g. the
  // Check Out list's "View details" on a blocked truck).
  const handleCheckOut = (entry, { warned } = {}) => {
    const reason = checkOutBlock(entry)
    if (reason && !warned) {
      setGateEvents((list) =>
        list.some((g) => g.type === 'blocked' && g.id === entry.id && g.reason === reason)
          ? list
          : [...list, { type: 'blocked', id: entry.id, reason, at: Date.now() }],
      )
    }
    openGate('out', entry)
  }

  const handleAssignDock = (id, dockDoor) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, dockDoor, dockAssignedAt: Date.now() } : e)))
    const entry = entries.find((e) => e.id === id)
    setNotice(`Trailer ${entry?.trailerNumber ?? ''} assigned to dock ${dockDoor}`)
  }

  // Saves the Loading Inspection on the entry; the applied seal fills Outgoing Seals # if it's still empty.
  // Saving an inspection again clears any earlier Shipping release, so the truck must be released again.
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
        ? `Inspection passed · trailer ${trailer} sent to Shipping for release`
        : `Inspection failed for trailer ${trailer} · re-check needed before it can leave`,
    )
  }

  // Shipping releases a truck that passed its inspection to the gate. The confirmed seal and order
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
  const badges = { shipping: entries.filter(awaitingRelease).length, gate: entries.filter(isReleased).length }
  const badgeWords = { shipping: 'awaiting release', gate: 'released to the gate' }

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
    if (editingId === id) setEditingId(null)
  }

  return (
    <>
      <header ref={headerRef} className="on-chrome sticky top-0 z-10 border-b-[6px] border-signal bg-chrome text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <h1 className="font-display text-[22px] leading-none font-bold whitespace-nowrap sm:text-[28px]">Gate Check In</h1>
          {/* ml-auto keeps the chat and clock on the right. */}
          <div className="ml-auto flex items-center gap-2.5 sm:gap-4">
            {chatTab && <ChatButton open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />}
            <span className="font-display text-[20px] font-semibold whitespace-nowrap text-signal sm:text-2xl">{clock}</span>
          </div>
        </div>
        {/* Scrolls sideways rather than wrapping if the tabs still don't fit. */}
        <nav role="tablist" className="no-print mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 sm:gap-1.5 sm:px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={
                'min-h-[52px] shrink-0 cursor-pointer rounded-t-lg px-2 font-display text-[17px] font-semibold whitespace-nowrap sm:px-[18px] sm:text-[21px] ' +
                (tab === t.id ? 'bg-signal text-signal-ink' : 'text-[#C9D0D5] hover:text-white')
              }
            >
              {t.short ? (
                <>
                  <span className="sm:hidden">{t.short}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </>
              ) : (
                t.label
              )}
              {badges[t.id] > 0 && (
                <span
                  className={
                    'ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1 align-middle font-body text-[12px] font-bold tabular-nums sm:ml-2 sm:min-w-6 sm:px-1.5 sm:text-[13px] ' +
                    (tab === t.id ? 'bg-chrome text-white' : 'bg-signal text-signal-ink')
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

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-5">
        {/* On the Overview the notices clear its fixed left rail, like the section content does. */}
        {(storageError || notice) && (
          <div className={'space-y-5' + (tab === 'analytics' ? ' ' + RAIL_PAD : '')}>
            {storageError && (
              <div role="alert" className="no-print rounded-md border-l-[6px] border-danger bg-danger-soft px-4 py-3 font-semibold text-danger">
                Browser storage is full — the latest changes are NOT saved and will be lost when this page closes. Delete
                old entries to free up space.
              </div>
            )}
            {notice && (
              <div role="status" className="no-print rounded-md border-l-[6px] border-signal-line bg-panel px-4 py-3 font-semibold text-ok">
                {notice}
              </div>
            )}
          </div>
        )}

        {/* The Gate panel stays mounted while another tab is open, so a half-typed check-in or check-out
            isn't lost when the guard glances at Shipping; it follows the live entry meanwhile. */}
        <div
          role="tabpanel"
          id="panel-gate"
          aria-labelledby="tab-gate"
          hidden={tab !== 'gate'}
          className="mx-auto max-w-[620px]"
        >
          {/* The Check In / Check Out form, kept narrow and centered. */}
          <div className="min-w-0 space-y-3">
            <div role="tablist" aria-label="Gate form" className="no-print grid grid-cols-2 gap-2">
              {GATE_MODES.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={gateMode === m.id}
                  onClick={() => openGate(m.id, null)}
                  className={
                    'min-h-14 cursor-pointer rounded-[10px] border-2 font-display text-[22px] font-bold ' +
                    (gateMode === m.id ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel text-ink')
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>

            {gateMode === 'out' && !editing ? (
              <CheckOutPicker entries={entries} onPick={handleCheckOut} />
            ) : (
              <GuardForm
                key={`${gateMode}-${editing?.id ?? 'new'}`}
                mode={gateMode}
                initial={editing}
                defaultGuard={entries[0]?.guardOnDuty ?? ''}
                takenBays={takenBays(entries)}
                onSave={handleSave}
                onCancel={editing ? () => setEditingId(null) : undefined}
              />
            )}
          </div>
        </div>
        {tab === 'gate' ? null : tab === 'docks' ? (
          <div role="tabpanel" id="panel-docks" aria-labelledby="tab-docks">
            <DockBoard
              entries={entries}
              onAssignDock={handleAssignDock}
              onEdit={handleEdit}
              onCheckOut={handleCheckOut}
              onSaveInspection={handleSaveInspection}
              wide
            />
          </div>
        ) : tab === 'analytics' ? (
          <div role="tabpanel" id="panel-analytics" aria-labelledby="tab-analytics">
            <Analytics
              entries={entries}
              gateEvents={gateEvents}
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
              onRelease={handleRelease}
              top={
                <EntryLog entries={entries} onEdit={handleEdit} onCheckOut={handleCheckOut} onDelete={handleDelete} onAssignDock={handleAssignDock} />
              }
            />
          </div>
        )}
        {chatTab && <Messages open={chatOpen} onClose={() => setChatOpen(false)} />}
      </main>
    </>
  )
}

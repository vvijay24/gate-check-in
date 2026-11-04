import { useEffect, useMemo, useRef, useState } from 'react'
import GuardForm from './components/GuardForm'
import CheckOutPicker from './components/CheckOutPicker'
import EntryLog from './components/EntryLog'
import ShippingDashboard from './components/ShippingDashboard'
import { DockBoard } from './components/Dashboard'
import Messages, { ChatButton } from './components/Messages'
import Toast from './components/Toast'
import Analytics, { RAIL_PAD } from './components/Analytics'
import { makeSampleEntries } from './sampleData'
import { takenBays } from './metrics'
import { awaitingRelease, checkOutBlock, isReleased } from './handoff'

const STORAGE_KEY = 'guard-load-log'
const EVENTS_KEY = 'gate-events'

// `short` is shown on phones so all four tabs fit on one row.
const TABS = [
  { id: 'gate', label: 'Gate', icon: 'M3 20V9m0 0h18M3 9l2-4h14l2 4M7 9v11M17 9v11M10 13h4' },
  { id: 'shipping', label: 'Shipping', icon: 'M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4m0-10v10m9-14v10l-9 4' },
  { id: 'docks', label: 'Dock & Loading', short: 'Docks', icon: 'M3 21V8l9-5 9 5v13M7 21v-7h10v7M7 17h10' },
  { id: 'analytics', label: 'Insights', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
]

// A 16px line icon for a header tab.
const TabIcon = ({ d }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="hidden h-4 w-4 shrink-0 sm:block" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

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
  // The latest pop-up message: { text, tone: 'ok' | 'fail', id }. Shown for 3 seconds.
  const [notice, setNotice] = useState(null)
  const notify = (text, tone = 'ok') => setNotice({ text, tone, id: Date.now() })
  const [storageError, setStorageError] = useState(false)
  const [clock, setClock] = useState(timeNow)
  // A shared Insights link (?tab=insights…) opens straight on Insights.
  const [tab, setTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('tab') === 'insights' ? 'analytics' : 'gate'
    } catch {
      return 'gate'
    }
  })
  // The header turns translucent once the page scrolls.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  // The demo Shipping chat: opened from the header on the Gate and Shipping tabs.
  const [chatOpen, setChatOpen] = useState(false)
  const chatTab = tab === 'gate' || tab === 'shipping'
  // Gate sub-tab; `editing` is the entry open in that form (none = new check-in / truck picker).
  const [gateMode, setGateMode] = useState('in')

  useEffect(() => {
    const t = setInterval(() => setClock(timeNow()), 15000)
    return () => clearInterval(t)
  }, [])

  // The header's height as --header-h, so things pinned below it (the Insights sidebar) start exactly
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
    const t = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(t)
  }, [notice])

  // Gate events Insights' Data Quality section counts; today only check-outs blocked because
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
      // Only Insights counts these; losing them doesn't affect the gate log.
    }
  }, [gateEvents])

  // For a saved entry `form` holds only the fields the guard changed (plus its id), merged onto the
  // latest entry so a dock, inspection or release recorded meanwhile isn't overwritten.
  const handleSave = (form) => {
    if (form.id) {
      const entry = { ...entries.find((e) => e.id === form.id), ...form }
      const checkedOut = gateMode === 'out' && !editing?.timeOut
      // Anything but a first check-out is a correction to a saved entry; Insights counts them.
      setEntries((list) =>
        list.map((e) =>
          e.id === form.id
            ? { ...e, ...form, updatedAt: Date.now(), ...(!checkedOut && { edits: (e.edits ?? 0) + 1, editedAt: Date.now() }) }
            : e,
        ),
      )
      setEditingId(null)
      notify(checkedOut ? `Checked out ${entry.truckName} — trailer ${entry.trailerNumber}` : `Updated entry for ${entry.truckName}`)
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
    notify(`Trailer ${entry?.trailerNumber ?? ''} assigned to dock ${dockDoor}`)
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
    notify(
      loadingInspection.result === 'Pass'
        ? `Inspection passed · trailer ${trailer} sent to Shipping for release`
        : `Inspection failed for trailer ${trailer} · re-check needed before it can leave`,
      loadingInspection.result === 'Pass' ? 'ok' : 'fail',
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
    notify(`Trailer ${trailer} released to the gate`)
  }

  // Carrier names used before, most frequent first, for the Gate form's suggestions.
  const carriers = useMemo(() => {
    const count = new Map()
    for (const e of entries) {
      const name = String(e.truckName ?? '').trim()
      if (name) count.set(name, (count.get(name) ?? 0) + 1)
    }
    return [...count].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [entries])

  // Tab badges: what's waiting for each team.
  const badges = { shipping: entries.filter(awaitingRelease).length, gate: entries.filter(isReleased).length }
  const badgeWords = { shipping: 'awaiting release', gate: 'released to the gate' }

  // Sample visits are marked `sample: true` and go in by arrival time among the real entries;
  // loading again replaces the old samples.
  const handleLoadSample = () => {
    const samples = makeSampleEntries()
    setEntries((list) => [...samples, ...list.filter((e) => !e.sample)].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)))
    notify(`Loaded ${samples.length} sample visits from the last two weeks`)
  }
  const handleRemoveSample = () => {
    setEntries((list) => list.filter((e) => !e.sample))
    notify('Removed the sample visits')
  }
  const sampleCount = entries.filter((e) => e.sample).length

  const handleDelete = (id) => {
    setEntries((list) => list.filter((e) => e.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <>
      {/* Slim header: the title, tabs, chat and clock on one row on wide screens (tabs wrap to a second
          row on phones). Once the page scrolls it turns translucent with a soft shadow. */}
      <header
        ref={headerRef}
        className={
          'on-chrome sticky top-0 z-20 border-b border-white/[0.07] bg-chrome text-white transition-shadow duration-200 ' +
          (scrolled ? 'shadow-[0_8px_24px_-12px_rgb(0_0_0/0.65)]' : '')
        }
      >
        {/* Full width: the title sits over the Insights rail at the left edge, the clock at the right. */}
        <div className="flex flex-wrap items-stretch gap-x-6 px-4 sm:px-5 lg:h-14 lg:flex-nowrap lg:px-6">
          <div className="flex items-center gap-2.5 py-2.5 lg:w-[calc(15rem-1.5rem)] lg:shrink-0 lg:py-0">
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-signal text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M4 18V8M4 9h16M8 9l3 4M13 9l3 4" />
              </svg>
            </span>
            <h1 className="text-[15px] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap">
              Gate Check In
              <span className="ml-2 hidden border-l border-white/15 pl-2 text-[12px] font-medium text-rail-muted md:inline">Yard Operations</span>
            </h1>
          </div>
          {/* Scrolls sideways rather than wrapping if the tabs still don't fit. */}
          <nav role="tablist" className="no-print order-last -mx-1 flex w-full gap-0.5 overflow-x-auto px-1 lg:order-none lg:w-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={
                  'relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 text-[14px] font-medium whitespace-nowrap transition-colors ' +
                  'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full lg:rounded-none ' +
                  (tab === t.id ? 'text-white after:bg-signal lg:bg-white/[0.04]' : 'text-rail-text/80 after:bg-transparent hover:bg-white/[0.06] hover:text-white')
                }
              >
                <TabIcon d={t.icon} />
                {t.short ? (
                  <>
                    <span className="sm:hidden">{t.short}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </>
                ) : (
                  t.label
                )}
                {badges[t.id] > 0 && (
                  <span className="figure inline-flex h-5 min-w-5 items-center justify-center rounded bg-warn px-1 text-[11px] font-semibold text-warn-ink">
                    {badges[t.id]}
                    <span className="sr-only"> {badgeWords[t.id]}</span>
                  </span>
                )}
              </button>
            ))}
          </nav>
          {/* ml-auto keeps the chat and clock on the right. */}
          <div className="ml-auto flex items-center gap-2.5 sm:gap-4">
            {chatTab && <ChatButton open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />}
            <span className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1">
              <i aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warn shadow-[0_0_0_3px_rgb(245_158_11/0.2)]" />
              <span className="figure text-[13px] font-medium whitespace-nowrap text-rail-text">{clock}</span>
            </span>
          </div>
        </div>
      </header>

      <Toast notice={notice} onClose={() => setNotice(null)} />

      {/* Insights uses the full width beside its rail; the other tabs sit centered. */}
      <main className={'space-y-5 px-4 py-5 sm:px-5 ' + (tab === 'analytics' ? 'lg:px-6 lg:py-6' : 'mx-auto max-w-[1440px] lg:px-6')}>
        {/* Storage trouble stays on the page (a pop-up would vanish); on Insights it clears the rail. */}
        {storageError && (
          <div className={tab === 'analytics' ? RAIL_PAD : ''}>
            <div role="alert" className="no-print rounded-md border-l-[6px] border-danger bg-danger-soft px-4 py-3 font-semibold text-danger">
              Browser storage is full — the latest changes are NOT saved and will be lost when this page closes. Delete
              old entries to free up space.
            </div>
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
            <div role="tablist" aria-label="Gate form" className="no-print grid grid-cols-2 gap-1 rounded-lg bg-track p-1">
              {GATE_MODES.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={gateMode === m.id}
                  onClick={() => openGate(m.id, null)}
                  className={
                    'min-h-12 cursor-pointer rounded-md text-[15px] font-semibold transition-colors ' +
                    (gateMode === m.id ? 'bg-panel text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12),0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink')
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
                active={tab === 'gate'}
                carriers={carriers}
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

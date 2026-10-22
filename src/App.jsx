import { useEffect, useState } from 'react'
import GuardForm from './components/GuardForm'
import EntryLog from './components/EntryLog'
import LogTab from './components/LogTab'

const STORAGE_KEY = 'guard-load-log'

const TABS = [
  { id: 'gate', label: 'Gate' },
  { id: 'log', label: 'Log' },
]

const timeNow = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
    // Older entries stored a single `loadType`; convert to the `visitPurpose` list.
    return saved.map(({ loadType, ...e }) => ({ ...e, visitPurpose: e.visitPurpose ?? (loadType ? [loadType] : []) }))
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

  useEffect(() => {
    const t = setInterval(() => setClock(timeNow()), 15000)
    return () => clearInterval(t)
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

  const handleSave = (form) => {
    if (form.id) {
      setEntries((list) => list.map((e) => (e.id === form.id ? { ...form, updatedAt: Date.now() } : e)))
      setEditing(null)
      setNotice(`Updated entry for ${form.truckName}`)
    } else {
      setEntries((list) => [{ ...form, id: crypto.randomUUID(), createdAt: Date.now() }, ...list])
      setNotice(`Logged ${form.truckName} — trailer ${form.trailerNumber}`)
    }
  }

  const handleEdit = (entry) => {
    setEditing(entry)
    setTab('gate')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (id) => {
    setEntries((list) => list.filter((e) => e.id !== id))
    if (editing?.id === id) setEditing(null)
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b-[6px] border-signal bg-chrome text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-3">
          <h1 className="mr-auto font-display text-[28px] leading-none font-bold">Gate Check In</h1>
          <span className="font-display text-2xl font-semibold text-signal">{clock}</span>
        </div>
        <nav role="tablist" className="no-print mx-auto flex max-w-[1400px] gap-1.5 px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={
                'min-h-[52px] cursor-pointer rounded-t-lg px-[18px] font-display text-[21px] font-semibold ' +
                (tab === t.id ? 'bg-signal text-signal-ink' : 'text-[#C9D0D5] hover:text-white')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-5">
        {storageError && (
          <div role="alert" className="no-print rounded-md border-l-[6px] border-danger bg-danger-soft px-4 py-3 font-semibold text-danger">
            Browser storage is full — the latest changes are NOT saved and will be lost when this page closes. Delete
            old entries to free up space.
          </div>
        )}

        {notice && (
          <div role="status" className="no-print rounded-md border-l-[6px] border-signal bg-panel px-4 py-3 font-semibold text-ok">
            {notice}
          </div>
        )}

        {tab === 'gate' ? (
          <div
            role="tabpanel"
            id="panel-gate"
            aria-labelledby="tab-gate"
            className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]"
          >
            {/* Narrow form on the left, log fills the right from lg up; stacked below. */}
            <GuardForm
              key={editing?.id ?? 'new'}
              initial={editing}
              defaultGuard={entries[0]?.guardOnDuty ?? ''}
              onSave={handleSave}
              onCancel={editing ? () => setEditing(null) : undefined}
            />

            {/* Stays in view while scrolling the long form. */}
            <div className="lg:sticky lg:top-[140px] lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto lg:rounded-[10px]">
              <EntryLog entries={entries} onEdit={handleEdit} onDelete={handleDelete} />
            </div>
          </div>
        ) : (
          <div role="tabpanel" id="panel-log" aria-labelledby="tab-log">
            <LogTab entries={entries} onEdit={handleEdit} onDelete={handleDelete} />
          </div>
        )}
      </main>
    </>
  )
}

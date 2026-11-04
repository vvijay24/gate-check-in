import { useMemo, useState } from 'react'
import { arrivalMs } from '../../time'
import { DETENTION_FREE_MIN } from '../../yard'
import { isDrop } from '../../metrics'
import { visitStages } from '../../analytics'
import { Card } from './ui'
import { STAGES, SortTable, dur, money } from './charts'
import { ProfileLink } from './nav'
import { visitCell } from './sections'

// Visit Explorer: every visit in the range (after the global filters), searchable, with each stage's
// time and the est. detention. Click a visit to open it.

const FREE_MS = DETENTION_FREE_MIN * 60000
const PAGE = 50
const SEARCH_FIELDS = ['truckName', 'trailerNumber', 'truckerNameIn', 'customerPickupFor', 'pickupNumber', 'driverPhone', 'dockDoor', 'incomingSeals', 'outgoingSeals']

const SHORT = { waitDockMs: 'Wait for dock', toInspectMs: 'Dock → inspected', toReleaseMs: 'Inspected → released', releaseToOutMs: 'Released → out' }

const STATUSES = [
  { id: '', label: 'All visits' },
  { id: 'onsite', label: 'On site now' },
  { id: 'departed', label: 'Departed' },
  { id: 'over', label: 'Past free time' },
  { id: 'drop', label: 'Dropped trailers' },
]
const statusOf = (s) => (s.drop ? 'Dropped trailer' : s.onSite ? 'On site' : 'Departed')

const COLUMNS = [
  { id: 'visit', label: 'Visit', value: (s) => arrivalMs(s.e), render: visitCell, minW: 170 },
  { id: 'purpose', label: 'Purpose', value: (s) => (s.e.visitPurpose ?? []).join(', '), render: (s) => (s.e.visitPurpose ?? []).join(', ') || '—' },
  {
    id: 'dock',
    label: 'Dock',
    minW: 80,
    value: (s) => s.e.dockDoor || null,
    render: (s) =>
      s.e.dockDoor ? (
        <ProfileLink kind="dock" id={String(s.e.dockDoor).trim().toUpperCase()}>
          Dock {s.e.dockDoor}
        </ProfileLink>
      ) : (
        '—'
      ),
  },
  ...STAGES.map((x) => ({ id: x.key, label: SHORT[x.key], numeric: true, value: (s) => s[x.key], render: (s) => dur(s[x.key]) })),
  {
    id: 'total',
    label: 'Time on site',
    numeric: true,
    value: (s) => s.onSiteMs,
    render: (s) => (
      <>
        <span className={!s.drop && s.onSiteMs > FREE_MS ? 'font-bold text-danger' : ''}>{dur(s.onSiteMs)}</span>
        <span className="block text-[12px] text-muted">{statusOf(s)}</span>
      </>
    ),
  },
  { id: 'cost', label: 'Est. detention', numeric: true, value: (s) => (s.drop ? null : s.cost), render: (s) => (s.drop ? '—' : s.cost ? money(s.cost) : '$0'), bar: 'danger' },
]

export function ExplorerSection({ entries, range, now }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const all = useMemo(
    () =>
      entries
        .filter((e) => e.dateIn >= range.from && e.dateIn <= range.to)
        .map((e) => ({ ...visitStages(e, now), drop: isDrop(e) })),
    [entries, range, now],
  )
  const q = query.trim().toLowerCase()
  const rows = all.filter((s) => {
    if (status === 'onsite' && !s.onSite) return false
    if (status === 'departed' && s.onSite) return false
    if (status === 'over' && (s.drop || !(s.overMs > 0))) return false
    if (status === 'drop' && !s.drop) return false
    if (!q) return true
    return SEARCH_FIELDS.some((f) => String(s.e[f] ?? '').toLowerCase().includes(q))
  })
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const at = Math.min(page, pages - 1)
  const cost = rows.reduce((t, s) => t + (s.drop ? 0 : s.cost), 0)

  const exportRows = async () => {
    const XLSX = await import('xlsx')
    const book = XLSX.utils.book_new()
    const m = (ms) => (ms == null ? '' : Math.round(ms / 60000))
    const sheet = [
      ['Date In', 'Time In', 'Carrier', 'Trailer #', 'Driver', 'Purpose', 'Customer', 'Order No', 'Dock', ...STAGES.map((x) => `${x.label} (min)`), 'Time on site (min)', 'Status', 'Est. detention ($)'],
      ...rows.map((s) => [
        s.e.dateIn,
        s.e.timeIn,
        s.e.truckName,
        s.e.trailerNumber,
        s.e.truckerNameIn,
        (s.e.visitPurpose ?? []).join(', '),
        s.e.customerPickupFor,
        s.e.pickupNumber,
        s.e.dockDoor,
        ...STAGES.map((x) => m(s[x.key])),
        m(s.onSiteMs),
        statusOf(s),
        s.drop ? '' : Math.round(s.cost),
      ]),
    ]
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet), 'Visits')
    XLSX.writeFile(book, `visits-${range.from}-to-${range.to}.xlsx`)
  }

  const field = 'min-h-10 rounded-md border border-edge bg-panel px-3 text-[13.5px] text-ink'
  return (
    <Card
      title="Every Visit"
      sub={`${rows.length} of ${all.length} visits in this range · ${money(cost)} est. detention among them · click a visit to open it`}
    >
      <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
        <label className="min-w-0 flex-1 basis-60 text-[12px] font-medium text-muted">
          <span className="mb-1 block">Search</span>
          <input
            type="search"
            value={query}
            onChange={(ev) => {
              setQuery(ev.target.value)
              setPage(0)
            }}
            placeholder="Carrier, trailer, driver, customer, order, seal…"
            className={field + ' w-full'}
          />
        </label>
        <div role="group" aria-label="Show" className="inline-flex flex-wrap gap-0.5 rounded-md bg-track p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={status === s.id}
              onClick={() => {
                setStatus(s.id)
                setPage(0)
              }}
              className={
                'min-h-9 cursor-pointer rounded-[5px] px-3 text-[13px] font-medium whitespace-nowrap ' +
                (status === s.id ? 'bg-panel text-ink shadow-[0_1px_2px_rgb(15_23_42/0.14),0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportRows} disabled={!rows.length} className={field + ' cursor-pointer font-semibold disabled:opacity-50'}>
          Export these
        </button>
      </div>
      <SortTable columns={COLUMNS} rows={rows} pageSize={PAGE} page={at} rowKey={(s) => s.e.id} initial={{ id: 'visit', dir: 'desc' }} minWidth={980} empty="No visits match." />
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
          <span className="text-muted">
            Showing {at * PAGE + 1}–{Math.min(rows.length, at * PAGE + PAGE)} of {rows.length}
          </span>
          <span className="flex gap-2">
            <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)} className={field + ' cursor-pointer font-semibold disabled:opacity-40'}>
              ← Newer
            </button>
            <button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} className={field + ' cursor-pointer font-semibold disabled:opacity-40'}>
              Older →
            </button>
          </span>
        </div>
      )}
      <div className="pb-2" />
    </Card>
  )
}

export const EXPLORER_SUMMARY = (r) => ({
  key: `${r.totals.visits} visits`,
  takeaway: (
    <>
      All <b>{r.totals.visits}</b> visits in this range, newest first. Search by carrier, trailer, driver, customer, order or seal, or narrow to trucks on site
      or past free time.
    </>
  ),
})

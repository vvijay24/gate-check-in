import { cloneElement, useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'
import { DOCKS } from '../yard'
import { dayKey, shiftDate } from '../time'
import { bookingsFromEntries } from '../schedule'
import { atDockNow } from '../handoff'
import { phaseOf } from './Dashboard'
import { dockKey, occupiedDocks } from './AssignDock'
import YardPlayer from './YardPlayer'
import EntryDialog from './EntryDialog'
import { Card, PageTitle, SubTabs } from './shipping/parts'
import { DocksSection, DropsSection, InspectionSection, LoadingSection, OrdersTiles, ReportSection } from './shipping/sections'
import { NowSection, carrierOf, needsYou } from './shipping/now'
import { ScheduleSection, scheduleSummary } from './shipping/schedule'
import { LoadSheetsSection } from './shipping/loads'
import { FindOrder, OrderHistory } from './shipping/history'

// The Shipping tab, for the clerk at the desk. Two groups in the sidebar: Today (Now, Today's schedule,
// Docks & loads) and Past days (Records). Each section's title is its sidebar name, with one status line
// and a "Live" marker. Wide screens: a navy rail beside the content, pinned under the header. Narrow
// screens: a row of chips. Partners (Carriers, Customers, Waiting charges) moves to the Overview; its
// components stay in shipping/sections.jsx.

const SECTIONS = [
  { id: 'now', group: 'Today', label: 'Now', icon: 'now' },
  { id: 'schedule', group: 'Today', label: "Today's schedule", icon: 'calendar' },
  { id: 'docks', group: 'Today', label: 'Docks & loads', icon: 'dock' },
  { id: 'records', group: 'Past days', label: 'Records', icon: 'log' },
]
const GROUPS = [...new Set(SECTIONS.map((s) => s.group))]
const KEY = 'shipping-section'
// Sections from before this layout, so a remembered one still opens in the right place.
const OLD = { live: 'now', yard: 'docks', docks: 'docks', partners: 'now', log: 'records', report: 'records' }

const DOCK_TABS = [
  { id: 'use', label: 'Dock use', icon: 'calendar', line: "The day's dock schedule and how busy each dock was. To see the docks right now, open Now." },
  { id: 'loading', label: 'Loading', icon: 'load', line: 'Who is loading now and how long it is taking. View only: the dock crew works on the Loading & Inspection tab.' },
  { id: 'inspection', label: 'Inspection', icon: 'inspect', line: "Loads waiting for inspection, failed loads being fixed, and passed loads waiting for the inspector's release. View only." },
  { id: 'loads', label: 'Load sheets', icon: 'orders', line: 'What went on each trailer, and the box temperature against its rule.' },
  { id: 'drops', label: 'Drop trailers', icon: 'drop', line: 'Trailers left without a driver: empty ones to load, and loaded ones waiting for a driver.' },
  { id: 'yard', label: 'Yard map', icon: 'yard', line: 'Every truck and trailer on site in 3D. Pause it, or replay any of the last 30 days. Tap a truck for its card.' },
]
const RECORD_TABS = [
  { id: 'log', label: 'Entry log', icon: 'log' },
  { id: 'report', label: 'Daily report', icon: 'report' },
]

// Kept on this device for today only: { day, items: { [key]: ms } }. Used for orders marked staged (by
// order no.) and carriers called (by booking id).
function useDayStore(key) {
  const today = dayKey(new Date())
  const [store, setStore] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key))
      return saved?.day === today ? saved : { day: today, items: {} }
    } catch {
      return { day: today, items: {} }
    }
  })
  const items = store.day === today ? store.items : {}
  const update = (fn) =>
    setStore((s) => {
      const next = { day: today, items: fn(s.day === today ? { ...s.items } : {}) }
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Still applies for this session.
      }
      return next
    })
  return [items, update]
}

function Sidebar({ section, onSelect, counts }) {
  return (
    <nav
      aria-label="Shipping sections"
      className="no-print min-w-0 lg:sticky lg:top-[calc(var(--header-h,114px)+20px)] lg:self-start lg:rounded-2xl lg:bg-chrome lg:p-2.5 lg:shadow-raised lg:[&_button:focus-visible]:outline-signal-bright"
    >
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2 lg:mx-0 lg:block lg:overflow-visible lg:p-0">
        {GROUPS.map((g) => (
          <li key={g} className="contents lg:block">
            <span className="hidden px-3 pt-3.5 pb-1.5 text-[12px] font-bold text-rail-muted lg:block">{g}</span>
            <ul className="contents lg:grid lg:gap-0.5">
              {SECTIONS.filter((s) => s.group === g).map((s) => {
                const on = section === s.id
                const b = counts[s.id]
                return (
                  <li key={s.id} className="shrink-0">
                    <button
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      onClick={() => onSelect(s.id)}
                      className={
                        'relative flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-full border px-3.5 text-left text-[14.5px] font-semibold whitespace-nowrap shadow-card transition-colors duration-150 ' +
                        'lg:rounded-xl lg:border-0 lg:px-3 lg:shadow-none ' +
                        'lg:before:absolute lg:before:top-2 lg:before:bottom-2 lg:before:-left-2.5 lg:before:w-[3px] lg:before:rounded-r ' +
                        (on
                          ? 'border-signal bg-signal text-signal-ink lg:bg-white/12 lg:text-white lg:before:bg-signal-bright'
                          : 'border-hair bg-panel text-ink hover:bg-signal-tint lg:bg-transparent lg:text-rail-text lg:hover:bg-white/6 lg:hover:text-white')
                      }
                    >
                      <Icon name={s.icon} size={19} className={on ? '' : 'lg:opacity-80'} />
                      {s.label}
                      {b && (
                        <span
                          className={
                            'ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums ' +
                            (b.bad ? 'bg-danger text-white' : b.warn ? 'bg-warn text-warn-ink' : on ? 'bg-panel/25 text-current lg:bg-signal-bright lg:text-chrome' : 'bg-signal-soft text-signal lg:bg-white/12 lg:text-rail-text')
                          }
                        >
                          <span aria-hidden={b.words ? true : undefined}>{b.n}</span>
                          {b.words && <span className="sr-only">{b.words}</span>}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// "Thu Nov 12".
const dayName = (key) => {
  const d = new Date(`${key}T00:00`)
  return `${WEEKDAY[d.getDay()]} ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

// Today's schedule for another day: ◀ Yesterday | Today | Tomorrow ▶, and a date box.
function DayPicker({ day, today, onChange }) {
  const seg = (on) =>
    'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-[14px] font-semibold transition-colors duration-150 ' +
    (on ? 'bg-signal text-signal-ink shadow-card' : 'text-ink hover:bg-signal-tint')
  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Day to show" className="flex gap-1 rounded-xl border border-hair bg-panel p-1 shadow-card">
        <button type="button" aria-label="Previous day" onClick={() => onChange(shiftDate(day, -1))} className={seg(false) + ' px-2.5'}>
          <Icon name="chevron" size={18} className="rotate-180" />
        </button>
        {[
          ['Yesterday', shiftDate(today, -1)],
          ['Today', today],
          ['Tomorrow', shiftDate(today, 1)],
        ].map(([label, key]) => (
          <button key={label} type="button" aria-pressed={day === key} onClick={() => onChange(key)} className={seg(day === key)}>
            {label}
          </button>
        ))}
        <button type="button" aria-label="Next day" onClick={() => onChange(shiftDate(day, 1))} className={seg(false) + ' px-2.5'}>
          <Icon name="chevron" size={18} />
        </button>
      </div>
      <label className="flex items-center gap-2 text-[14px] font-semibold text-muted">
        Date
        <input
          type="date"
          value={day}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="min-h-11 cursor-pointer rounded-[10px] border-[1.5px] border-line bg-panel px-2.5 text-[14px] font-semibold text-ink hover:border-signal-bright"
        />
      </label>
    </div>
  )
}

// `log` is the Entry log (built in App with its handlers). `schedule`: today's bookings (App builds it
// once, so the Gate sees the same list). `onDelayReason(id, reasonId)` saves why a truck stayed long;
// `onNotice(text | { text, undo })` shows a notice at the bottom of the screen.
export default function ShippingPage({ entries, schedule = [], onAssignDock, onOrderReady, onDelayReason, onNotice, onEdit, onUpdateEntry, onCheckOut, log }) {
  const [now, setNow] = useState(Date.now)
  const [section, setSection] = useState(() => {
    try {
      const saved = sessionStorage.getItem(KEY)
      return SECTIONS.some((s) => s.id === saved) ? saved : OLD[saved] ?? 'now'
    } catch {
      return 'now'
    }
  })
  const [dockTab, setDockTab] = useState('use')
  const [recordTab, setRecordTab] = useState('log')
  // The entry open in the View entry pop-up, and the order open in the order history pop-up.
  const [viewingId, setViewingId] = useState(null)
  const [historyId, setHistoryId] = useState(null)
  // The day Today's schedule shows (today unless the clerk picks another).
  const [schedDay, setSchedDay] = useState(() => dayKey(new Date()))
  const [staged, setStaged] = useDayStore('shipping-staged')
  const [calls, setCalls] = useDayStore('shipping-calls')
  const top = useRef(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const select = (id) => {
    setSection(id)
    try {
      sessionStorage.setItem(KEY, id)
    } catch {
      // Remembering the section is only a convenience.
    }
    const el = top.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Orders marked staged here count on top of the schedule's own.
  const day = schedule.map((a) => (staged[a.orderNo] ? { ...a, staged: true } : a))
  const markStaged = (a) => {
    setStaged((items) => ({ ...items, [a.orderNo]: Date.now() }))
    onNotice?.({
      text: `${a.orderNo} marked staged for ${carrierOf(a)}`,
      undo: () => {
        setStaged((items) => {
          delete items[a.orderNo]
          return items
        })
        onNotice?.('Undone')
      },
    })
  }
  const call = (id) => setCalls((items) => ({ ...items, [id]: Date.now() }))

  // Figures for the sidebar and the titles.
  const rows = needsYou({ entries, schedule: day, now, calls })
  const todo = rows.filter((r) => !r.info)
  const anyLate = todo.some((r) => r.kind === 'late')
  const sched = scheduleSummary(day, null, now)
  const busy = occupiedDocks(entries)
  const free = DOCKS.filter((d) => !busy.has(dockKey(d))).length
  const atDock = entries.filter(atDockNow)
  const loading = atDock.filter((e) => ['trailer', 'trailerFail', 'ready', 'loading'].includes(phaseOf(e))).length
  const toInspect = atDock.filter((e) => ['inspect', 'failed'].includes(phaseOf(e))).length
  const counts = {
    now: todo.length ? { n: todo.length, bad: anyLate, warn: !anyLate, words: `${plural(todo.length, 'thing')} ${todo.length === 1 ? 'needs' : 'need'} action` } : null,
    schedule: sched.late ? { n: sched.late, bad: true, words: `${plural(sched.late, 'truck')} late or not here` } : null,
    docks: { n: `${free} free`, words: `${free} of ${DOCKS.length} docks free` },
  }

  const view = (id) => setViewingId(id)
  // "Find an order" sits in the title row of every section.
  const find = <FindOrder entries={entries} onOpen={setHistoryId} />
  const today = dayKey(new Date(now))
  const isToday = schedDay === today
  const shownDay = isToday ? day : bookingsFromEntries(entries, schedDay)
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]))
  const schedLine = isToday
    ? sched.line
    : schedDay > today
      ? `No bookings for ${dayName(schedDay)} yet.`
      : scheduleSummary(shownDay, byId, now, dayName(schedDay)).line
  const body = {
    now: (
      <>
        <PageTitle
          title="Now"
          now={now}
          line={todo.length ? `${plural(todo.length, 'thing')} ${todo.length === 1 ? 'needs' : 'need'} action. The most urgent is first.` : 'No action required right now.'}
        >
          {find}
        </PageTitle>
        <NowSection
          entries={entries}
          schedule={day}
          now={now}
          rows={rows}
          calls={calls}
          onCall={call}
          onStage={markStaged}
          onView={view}
          onAssignDock={onAssignDock}
          onOrderReady={onOrderReady}
          onDelayReason={onDelayReason}
          onOpenSchedule={() => select('schedule')}
        />
      </>
    ),
    schedule: (
      <>
        <PageTitle title={isToday ? "Today's schedule" : `Schedule for ${dayName(schedDay)}`} now={now} line={schedLine}>
          {find}
        </PageTitle>
        <DayPicker day={schedDay} today={today} onChange={setSchedDay} />
        <ScheduleSection key={schedDay} schedule={shownDay} entries={entries} now={now} onStage={markStaged} onView={view} isToday={isToday} />
      </>
    ),
    docks: (
      <>
        <PageTitle
          title="Docks & loads"
          now={now}
          line={`${DOCKS.length - free} of ${DOCKS.length} docks busy. ${plural(loading, 'truck')} loading, ${toInspect} waiting for inspection. ${DOCK_TABS.find((t) => t.id === dockTab).line}`}
        >
          {find}
        </PageTitle>
        <SubTabs label="Docks & loads views" tabs={DOCK_TABS} value={dockTab} onChange={setDockTab} />
        {dockTab === 'use' && <DocksSection entries={entries} now={now} head={false} />}
        {dockTab === 'loading' && <LoadingSection entries={entries} now={now} head={false} />}
        {dockTab === 'inspection' && <InspectionSection entries={entries} now={now} head={false} />}
        {dockTab === 'loads' && <LoadSheetsSection entries={entries} now={now} />}
        {dockTab === 'drops' && <DropsSection entries={entries} now={now} onView={view} head={false} />}
        {dockTab === 'yard' && (
          <Card icon="yard" title="Union Springs yard" sub="Docks, the yard lane and the gate">
            <div className="p-4 sm:p-5">
              <YardPlayer entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} />
            </div>
          </Card>
        )}
      </>
    ),
    records: (
      <>
        <PageTitle title="Records" now={now} line="Every truck that came through the gate, and the daily report.">
          {find}
        </PageTitle>
        <SubTabs label="Records views" tabs={RECORD_TABS} value={recordTab} onChange={setRecordTab} />
        {recordTab === 'log' ? (
          <>
            <OrdersTiles entries={entries} now={now} />
            {cloneElement(log, { bare: true })}
          </>
        ) : (
          <ReportSection entries={entries} now={now} head={false} />
        )}
      </>
    ),
  }[section]

  return (
    <div ref={top} className="grid scroll-mt-[calc(var(--header-h,114px)+16px)] grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-7">
      <EntryDialog
        entry={entries.find((x) => x.id === viewingId) ?? null}
        entries={entries}
        onClose={() => setViewingId(null)}
        onSave={(id, changes) => {
          onUpdateEntry(id, changes)
          setViewingId(null)
        }}
      />
      <OrderHistory entry={entries.find((x) => x.id === historyId) ?? null} onClose={() => setHistoryId(null)} />
      <Sidebar section={section} onSelect={select} counts={counts} />
      <div key={section} className="grid min-w-0 animate-fade content-start gap-5">
        {body}
      </div>
    </div>
  )
}

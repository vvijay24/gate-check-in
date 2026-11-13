import { cloneElement, useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'
import { DOCKS } from '../yard'
import { atDockNow } from '../handoff'
import { detentionState } from '../detention'
import { phaseOf } from './Dashboard'
import { dockKey, occupiedDocks } from './AssignDock'
import ShippingBoard from './ShippingBoard'
import YardPlayer from './YardPlayer'
import EntryDialog from './EntryDialog'
import { Card, InsightsLink, LivePill, RangeSwitch, SectionHead, SubTabs } from './shipping/parts'
import {
  CarriersSection,
  CustomersSection,
  DetentionSection,
  DocksSection,
  DropsSection,
  InspectionSection,
  LoadingSection,
  OrdersTiles,
  ReportSection,
} from './shipping/sections'

// The Shipping tab: a sidebar of six sections and the chosen one beside it. Live Board (the work
// board, live charts and the drop trailers in the yard) is the desk's home, with the 3D Yard map next. Docks holds
// the dock schedule and the view-only Loading and Inspection; Partners holds Customers, Carriers and
// Detention (Shipping's short-range view, with a link to Insights for the full one); then the Entry log
// (with the day's order figures) and the printable Daily report.
// Wide screens: a navy rail beside the content, pinned under the header. Narrow screens: a row of chips.

const SECTIONS = [
  { id: 'live', group: 'Today', label: 'Live Board', icon: 'live' },
  { id: 'yard', group: 'Today', label: 'Yard map', icon: 'yard' },
  { id: 'docks', group: 'Today', label: 'Docks', icon: 'dock' },
  { id: 'partners', group: 'Performance', label: 'Partners', icon: 'customer' },
  { id: 'log', group: 'Records', label: 'Entry log', icon: 'log' },
  { id: 'report', group: 'Records', label: 'Daily report', icon: 'report' },
]
const GROUPS = [...new Set(SECTIONS.map((s) => s.group))]
const KEY = 'shipping-section'

// The count beside a section in the sidebar, and whether it needs action (`warn`) or is just a figure.
function badges(entries, now) {
  const onSite = entries.filter((e) => !e.timeOut)
  const noDock = onSite.filter((e) => !e.dockDoor)
  const waiting = noDock.filter((e) => !e.orderReadyAt).length
  const ready = noDock.filter((e) => e.orderReadyAt).length
  const atDock = onSite.filter(atDockNow)
  const free = DOCKS.filter((d) => !occupiedDocks(entries).has(dockKey(d))).length
  const loading = atDock.filter((e) => ['trailer', 'trailerFail', 'ready', 'loading'].includes(phaseOf(e))).length
  const failed = atDock.filter((e) => phaseOf(e) === 'failed').length
  const toInspect = atDock.filter((e) => phaseOf(e) === 'inspect').length
  const over = onSite.filter((e) => detentionState(e, now)?.level === 'over').length
  return {
    live: waiting + ready ? { n: waiting + ready, warn: true, words: 'trucks waiting for their order or a dock' } : null,
    // Docks: a failed load needs a re-check first; otherwise how many docks are free.
    docks: failed ? { n: failed, warn: true, words: 'loads failed inspection' } : { n: `${free} free`, words: 'docks free' },
    partners: over ? { n: over, bad: true, words: 'trucks past free time' } : null,
    log: waiting ? { n: waiting, warn: true, words: 'orders not ready' } : null,
    // Tab counts inside Docks.
    tabs: { loading, inspection: failed + toInspect, failed },
  }
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
            <span className="hidden px-3 pt-3.5 pb-1.5 text-[11px] font-bold tracking-[0.09em] text-rail-muted uppercase lg:block">{g}</span>
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
                          {b.n}
                          <span className="sr-only"> {b.words}</span>
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

// Live Board: the work board, then the drop trailers in the yard.
function LiveBoard({ entries, now, onAssignDock, onOrderReady, onUpdateEntry, onEdit, onCheckOut, onView, onGo }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <ShippingBoard entries={entries} onAssignDock={onAssignDock} onOrderReady={onOrderReady} onUpdateEntry={onUpdateEntry} onGo={onGo} />
      <DropsSection entries={entries} now={now} onView={onView} compact />
    </div>
  )
}

const DOCK_TABS = [
  { id: 'schedule', label: 'Schedule & use', icon: 'calendar' },
  { id: 'loading', label: 'Loading', icon: 'load' },
  { id: 'inspection', label: 'Inspection', icon: 'inspect' },
]
const DOCK_SUB = {
  schedule: "The day's dock schedule and how busy each dock has been. The docks right now are on the Live Board.",
  loading: 'Who is loading now and how long it is taking. View only: the dock crew works on the Loading & Inspection tab.',
  inspection: "Loads waiting for inspection, failed loads being fixed, and passed loads waiting for the inspector's release. View only.",
}

function DocksHub({ entries, now, tab, onTab, counts }) {
  const tabs = DOCK_TABS.map((t) => ({ ...t, badge: counts[t.id] || null, warn: t.id === 'inspection' && counts.failed > 0 }))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <SectionHead title="Docks" sub={DOCK_SUB[tab]}>
        <LivePill />
      </SectionHead>
      <SubTabs label="Docks views" tabs={tabs} value={tab} onChange={onTab} />
      {tab === 'schedule' && <DocksSection entries={entries} now={now} head={false} />}
      {tab === 'loading' && <LoadingSection entries={entries} now={now} head={false} />}
      {tab === 'inspection' && <InspectionSection entries={entries} now={now} head={false} />}
    </div>
  )
}

const PARTNER_TABS = [
  { id: 'customers', label: 'Customers', icon: 'customer', insights: 'customers' },
  { id: 'carriers', label: 'Carriers', icon: 'truck', insights: 'carriers' },
  { id: 'detention', label: 'Detention', icon: 'money', insights: 'turnaround' },
]
const PARTNER_SUB = {
  customers: 'Who we load for: how many orders, how long their orders took to be ready, and how quickly their trucks turned.',
  carriers: 'Who brings the trucks: on-time arrival, how long they stay, and the detention they could bill.',
  detention: 'Trucks close to or past 2 h of free time, and what it costs. The clock starts at the later of the appointment and arrival.',
}

function PartnersHub({ entries, now, tab, onTab, onOpenInsights, over }) {
  const [days, setDays] = useState(7)
  const tabs = PARTNER_TABS.map((t) => ({ ...t, badge: t.id === 'detention' && over ? over : null, warn: true }))
  const props = { entries, now, onOpenInsights, head: false }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <SectionHead title="Partners" sub={PARTNER_SUB[tab]}>
        {tab === 'detention' ? <LivePill /> : <RangeSwitch value={days} onChange={setDays} />}
        <InsightsLink onOpen={onOpenInsights} section={PARTNER_TABS.find((t) => t.id === tab).insights} />
      </SectionHead>
      <SubTabs label="Partners views" tabs={tabs} value={tab} onChange={onTab} />
      {tab === 'customers' && <CustomersSection {...props} days={days} />}
      {tab === 'carriers' && <CarriersSection {...props} days={days} />}
      {tab === 'detention' && <DetentionSection {...props} />}
    </div>
  )
}

// `log` is the Entry Log (built in App with its handlers). `onOpenInsights(section)` opens Insights.
const SUBKEY = 'shipping-subtabs'
export default function ShippingPage({ entries, onAssignDock, onOrderReady, onEdit, onUpdateEntry, onCheckOut, onOpenInsights, log }) {
  const [now, setNow] = useState(Date.now)
  const [section, setSection] = useState(() => {
    try {
      const saved = sessionStorage.getItem(KEY)
      return SECTIONS.some((s) => s.id === saved) ? saved : 'live'
    } catch {
      return 'live'
    }
  })
  // The tab open inside Docks and Partners, kept while switching sections.
  const [sub, setSub] = useState(() => {
    try {
      return { docks: 'schedule', partners: 'customers', ...JSON.parse(sessionStorage.getItem(SUBKEY)) }
    } catch {
      return { docks: 'schedule', partners: 'customers' }
    }
  })
  const setSubTab = (hub) => (id) =>
    setSub((s) => {
      const next = { ...s, [hub]: id }
      try {
        sessionStorage.setItem(SUBKEY, JSON.stringify(next))
      } catch {
        // Remembering the tab is only a convenience.
      }
      return next
    })
  // Filters the Entry log opens with, set by a Live Board tile; `logKey` remounts it so they apply.
  const [logFilters, setLogFilters] = useState(null)
  const [logKey, setLogKey] = useState(0)
  // The entry open in the View entry pop-up (from the drop trailers table).
  const [viewingId, setViewingId] = useState(null)
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
    // Back to the top of the content (below the sticky header) when it's scrolled away.
    const el = top.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // From the Live Board: open a section (and its tab), with the Entry log's filters when given.
  const go = (id, tab, filters) => {
    if (tab && (id === 'docks' || id === 'partners')) setSubTab(id)(tab)
    if (id === 'log') {
      setLogFilters(filters ?? null)
      setLogKey((k) => k + 1)
    }
    select(id)
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const counts = badges(entries, now)
  const body = {
    live: (
      <LiveBoard
        entries={entries}
        now={now}
        onAssignDock={onAssignDock}
        onOrderReady={onOrderReady}
        onUpdateEntry={onUpdateEntry}
        onEdit={onEdit}
        onCheckOut={onCheckOut}
        onView={setViewingId}
        onGo={go}
      />
    ),
    // The 3D yard map on its own page: Live by default, with Pause and Replay of the last 30 days.
    yard: (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <SectionHead title="Yard map" sub="Every truck and trailer on site in 3D. Live by default; pause it, or replay any of the last 30 days. Tap a truck for its card.">
          <LivePill />
        </SectionHead>
        <Card icon="yard" title="Union Springs yard" sub="Docks, the yard lane and the gate">
          <div className="p-4 sm:p-5">
            <YardPlayer entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} />
          </div>
        </Card>
      </div>
    ),
    docks: <DocksHub entries={entries} now={now} tab={sub.docks} onTab={setSubTab('docks')} counts={counts.tabs} />,
    partners: <PartnersHub entries={entries} now={now} tab={sub.partners} onTab={setSubTab('partners')} onOpenInsights={onOpenInsights} over={counts.partners?.n} />,
    // The Entry log with the day's order figures on top (its Today view lists the same trucks as Orders did).
    log: (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <SectionHead title="Entry log" sub="Every gate entry. Today shows the day's orders with when each was ready and how long it waited; mark an order ready here or on the Live Board.">
          <LivePill />
        </SectionHead>
        <OrdersTiles entries={entries} now={now} />
        {cloneElement(log, { key: logKey, initialFilters: logFilters ?? undefined })}
      </div>
    ),
    report: <ReportSection entries={entries} now={now} />,
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
      <Sidebar section={section} onSelect={select} counts={counts} />
      <div key={section} className="min-w-0 animate-fade">
        {body}
      </div>
    </div>
  )
}

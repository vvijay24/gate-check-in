import { useState } from 'react'
import * as ui from '../../ui'
import { arrivalMs, duration } from '../../time'
import { isDrop, yardMetrics } from '../../metrics'
import { DOCKS } from '../../yard'
import { detentionState } from '../../detention'
import { awaitingRelease, isReleased } from '../../handoff'
import { checkedInAt } from '../../stages'
import { DockStatus, StageToday, StagingBays, SummaryStrip, WaitingCard, WorkBoard } from '../Dashboard'
import ShippingDashboard from '../ShippingDashboard'
import EntryLog from '../EntryLog'
import { TimerPill } from '../StageTimer'
import { BlockedNote, DockButtons, Hub, Kpi, MapPane, PanelHome, Queue, TruckCard, busyDocks, freeDocks, placeOf, useNow } from './shared'

const VIEWS = [
  { id: 'yard', label: 'Yard' },
  { id: 'board', label: 'Work Board' },
  { id: 'outbound', label: 'Outbound' },
  { id: 'log', label: 'Gate Log' },
]

// Shipping: who needs a dock (the strip on top, with the next free dock one tap away), the yard, and
// a truck's card. Picking a waiting truck lights up the free docks on the map: tap one to assign it.
// The work board, outbound shipments and gate log are a tap away in the views.
export default function ShippingHub({ entries, onAssignDock, onEdit, onCheckOut, onDelete }) {
  const now = useNow()
  const [view, setView] = useState('yard')
  const [picked, setPicked] = useState(null)
  const card = entries.find((e) => e.id === picked)

  const onSite = entries.filter((e) => !e.timeOut)
  const waiting = onSite.filter((e) => !e.dockDoor && !isDrop(e)).sort((a, b) => arrivalMs(a) - arrivalMs(b))
  const free = freeDocks(entries)
  const yard = yardMetrics(entries, Infinity, now)
  const states = onSite.map((e) => detentionState(e, now)).filter(Boolean)
  const over = states.filter((s) => s.level === 'over')
  const fee = over.reduce((s, d) => s + d.fee, 0)
  const awaiting = onSite.filter(awaitingRelease).length
  const released = onSite.filter(isReleased).length

  const assign = (e, d) => onAssignDock(e.id, d)
  const canDock = card && !card.timeOut && !card.dockDoor

  const queue = waiting.map((e) => ({
    e,
    place: e.waitingLocation || 'Waiting',
    note: [(e.visitPurpose ?? []).join(' + '), e.appointmentTime && `appt ${e.appointmentTime}`, detentionState(e, now)?.text].filter(Boolean).join(' · '),
    bad: detentionState(e, now)?.level === 'over',
    timer: <TimerPill stage="dock" since={checkedInAt(e)} now={now} label="Waiting for a dock" />,
    action: free.length ? { label: `→ Dock ${free[0]}`, run: () => assign(e, free[0]) } : null,
  }))

  const actions = card && (
    <>
      {!card.timeOut && (
        <button type="button" onClick={() => onCheckOut(card)} className={ui.btn}>
          Check out
        </button>
      )}
      <button type="button" onClick={() => onEdit(card)} className={ui.btn}>
        {card.timeOut ? 'View entry' : 'Edit check-in'}
      </button>
    </>
  )

  const occupied = busyDocks(entries)
  const lists = (children) => <div className="h-full space-y-4 overflow-y-auto rounded-xl">{children}</div>

  return (
    <Hub
      label="Shipping"
      views={VIEWS.map((v) => (v.id === 'board' ? { ...v, count: waiting.length } : v))}
      view={view}
      onView={setView}
      focusKey={picked}
      onEscape={() => setPicked(null)}
      kpis={
        <>
          <Kpi label="On site" value={onSite.length} note={`${yard.drops.length} dropped`} />
          <Kpi
            label="Waiting for a dock"
            value={waiting.length}
            tone={waiting.length > 2 ? 'warn' : undefined}
            note={waiting.length ? `Longest ${duration(now - arrivalMs(waiting[0]))}` : 'No one waiting'}
          />
          <Kpi label="Docks free" value={`${free.length} of ${DOCKS.length}`} tone={free.length ? 'good' : 'alert'} note={free.length ? 'Ready to assign' : '⚠ All docks in use'} />
          <Kpi label="Past free time" value={over.length} tone={over.length ? 'alert' : states.length ? 'warn' : 'good'} note={over.length ? `⚠ Est. $${Math.round(fee)} so far` : `${states.length} near`} />
          <Kpi label="Awaiting release" value={awaiting} tone={awaiting ? 'warn' : undefined} note={released ? `${released} released to gate` : 'The inspector releases'} />
        </>
      }
      queue={<Queue title="Needs a dock" items={queue} empty="Every truck has a dock." selectedId={picked} onSelect={setPicked} />}
      main={
        view === 'board' ? (
          lists(
            <>
              <SummaryStrip entries={entries} />
              <WorkBoard entries={entries} onAssignDock={onAssignDock} onEdit={onEdit} />
              <StageToday entries={entries} />
            </>,
          )
        ) : view === 'outbound' ? (
          lists(<ShippingDashboard bare entries={entries} onAssignDock={onAssignDock} onEdit={onEdit} onCheckOut={onCheckOut} />)
        ) : view === 'log' ? (
          lists(<EntryLog entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} onDelete={onDelete} onAssignDock={onAssignDock} />)
        ) : (
          <MapPane
            entries={entries}
            now={now}
            picked={picked}
            onPick={setPicked}
            focus={(e) => !e.timeOut && !e.dockDoor && !isDrop(e) && 'Needs dock'}
            dockTargets={canDock ? new Set(free) : undefined}
            onDockTap={canDock ? (d) => assign(card, d) : undefined}
            hint={canDock ? `Tap a free dock to assign trailer ${card.trailerNumber}` : 'Tap a waiting truck, then a free dock'}
          />
        )
      }
      panel={
        card ? (
          <TruckCard
            e={card}
            now={now}
            place={placeOf(card)}
            notice={canDock ? <DockButtons entries={entries} onPick={(d) => assign(card, d)} /> : card.dockDoor && !card.timeOut && <BlockedNote e={card} />}
            actions={actions}
            onClose={() => setPicked(null)}
          />
        ) : (
          <PanelHome title="Docks & Bays" hint="Tap a truck in the strip or on the map for its card.">
            {waiting.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[13px] font-semibold text-muted">Waiting for a dock ({waiting.length})</h4>
                {waiting.map((e) => (
                  <WaitingCard key={e.id} e={e} now={now} occupied={occupied} onAssignDock={onAssignDock} onEdit={onEdit} />
                ))}
              </section>
            )}
            <DockStatus occupied={occupied} now={now} />
            <StagingBays entries={entries} now={now} />
          </PanelHome>
        )
      }
    />
  )
}

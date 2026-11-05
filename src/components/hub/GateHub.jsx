import { useEffect, useState } from 'react'
import * as ui from '../../ui'
import { ago } from '../../time'
import { isDrop } from '../../metrics'
import { detentionState } from '../../detention'
import { checkOutBlock, isReleased } from '../../handoff'
import { inspectionSavedAt } from '../../stages'
import GuardForm from '../GuardForm'
import CheckOutPicker from '../CheckOutPicker'
import EntryLog from '../EntryLog'
import { TimerPill } from '../StageTimer'
import { BlockedNote, Hub, Kpi, MapPane, Queue, TruckCard, placeOf, useNow } from './shared'

const GATE_MODES = [
  { id: 'in', label: 'Check In' },
  { id: 'out', label: 'Check Out' },
]
const VIEWS = [
  { id: 'yard', label: 'Yard' },
  { id: 'log', label: 'Gate Log' },
]

// Gate: the check-in / check-out form beside the live yard. Released trucks wait in the strip on top
// with a Check out button; any truck on the map opens its card.
// `form` holds what the Gate form needs (guard, memory, bays, carriers, save and cancel); the form stays
// mounted while a card is open or another tab is shown, so a half-typed check-in is never lost.
export default function GateHub({ entries, active, gateMode, editing, onOpenGate, form, onCheckOut, onEdit, onDelete, onAssignDock }) {
  const now = useNow()
  const [view, setView] = useState('yard')
  const [picked, setPicked] = useState(null)
  // Opening a form (here or from another tab) closes the card so the form shows.
  useEffect(() => setPicked(null), [gateMode, editing?.id])
  const card = entries.find((e) => e.id === picked)

  const onSite = entries.filter((e) => !e.timeOut)
  const released = onSite.filter(isReleased).sort((a, b) => a.release.releasedAt - b.release.releasedAt)
  const stuck = onSite.filter((e) => checkOutBlock(e))
  const over = onSite.filter((e) => detentionState(e, now)?.level === 'over')
  const drops = onSite.filter(isDrop)

  const queue = released.map((e) => ({
    e,
    place: `Dock ${e.dockDoor}`,
    note: `Released ${ago(now - e.release.releasedAt)}${e.release.releasedBy ? ` by ${e.release.releasedBy}` : ''}`,
    timer: <TimerPill stage="checkout" since={inspectionSavedAt(e)} now={now} />,
    action: { label: 'Check out', run: () => onCheckOut(e) },
  }))

  const actions = card && (
    <>
      {card.timeOut ? (
        <button type="button" onClick={() => onCheckOut(card)} className={ui.btnPrimary + ' flex-1'}>
          Edit check-out
        </button>
      ) : checkOutBlock(card) ? (
        <button type="button" onClick={() => onCheckOut(card, { warned: true })} className={ui.btn + ' flex-1'}>
          View check-out
        </button>
      ) : (
        <button type="button" onClick={() => onCheckOut(card)} className={ui.btnPrimary + ' flex-1'}>
          Check out
        </button>
      )}
      <button type="button" onClick={() => onEdit(card)} className={ui.btn}>
        Edit check-in
      </button>
    </>
  )

  const gateForm = (
    <div className="min-h-full space-y-2.5 bg-page p-2.5" hidden={Boolean(card)}>
      <div role="tablist" aria-label="Gate form" className="no-print grid grid-cols-2 gap-1 rounded-lg bg-track p-1">
        {GATE_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={gateMode === m.id}
            onClick={() => onOpenGate(m.id, null)}
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
        <CheckOutPicker entries={entries} onPick={onCheckOut} />
      ) : (
        <GuardForm key={`${gateMode}-${editing?.id ?? 'new'}`} mode={gateMode} initial={editing} active={active} {...form} />
      )}
    </div>
  )

  return (
    <Hub
      label="Gate"
      views={VIEWS}
      view={view}
      onView={setView}
      wide={!card}
      focusKey={picked ?? (editing ? `${gateMode}-${editing.id}` : null)}
      onEscape={() => setPicked(null)}
      kpis={
        <>
          <Kpi label="On site" value={onSite.length} note={`${drops.length} dropped trailer${drops.length === 1 ? '' : 's'}`} />
          <Kpi label="Ready to leave" value={released.length} tone={released.length ? 'warn' : undefined} note={released.length ? 'Released by the inspector' : 'None released'} />
          <Kpi label="Can’t leave yet" value={stuck.length} note="At a dock, not released" />
          <Kpi label="Past free time" value={over.length} tone={over.length ? 'alert' : 'good'} note={over.length ? '⚠ Detention running' : 'None'} />
        </>
      }
      queue={<Queue title="Ready to leave" items={queue} empty="No trucks released to the gate right now." selectedId={picked} onSelect={setPicked} />}
      main={
        view === 'log' ? (
          <div className="h-full overflow-y-auto rounded-xl">
            <EntryLog entries={entries} onEdit={onEdit} onCheckOut={onCheckOut} onDelete={onDelete} onAssignDock={onAssignDock} />
          </div>
        ) : active ? (
          <MapPane
            entries={entries}
            now={now}
            picked={picked}
            onPick={setPicked}
            focus={(e) => isReleased(e) && 'Check out'}
            hint={card ? null : 'Tap a truck for its details and check-out'}
          />
        ) : null
      }
      panel={
        <>
          {card && (
            <TruckCard e={card} now={now} place={placeOf(card)} notice={!card.timeOut && <BlockedNote e={card} />} actions={actions} onClose={() => setPicked(null)} />
          )}
          {gateForm}
        </>
      }
    />
  )
}

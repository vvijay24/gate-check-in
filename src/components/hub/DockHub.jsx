import { useState } from 'react'
import * as ui from '../../ui'
import { dockKey } from '../AssignDock'
import { dockPhase, DockWorkCard } from '../Dashboard'
import { InspectionForm } from '../LoadingInspection'
import ReleaseDialog from '../ReleaseDialog'
import OnDuty from '../OnDuty'
import { TimerLegend, TimerPill } from '../StageTimer'
import { currentStage } from '../../stages'
import { Hub, Kpi, MapPane, PanelHome, Queue, TruckCard, dockAction, nextWords, placeOf, useNow } from './shared'

const VIEWS = [
  { id: 'yard', label: 'Yard' },
  { id: 'docks', label: 'All Docks' },
]
// The inspector's work first (a failed check, a release, an inspection, a trailer check), then loading.
const ORDER = { trailerFail: 0, failed: 0, release: 1, inspect: 2, trailer: 3, loading: 4, ready: 5, released: 6 }
const byDock = (a, b) => dockKey(a.dockDoor).localeCompare(dockKey(b.dockDoor), undefined, { numeric: true })

// Dock & Loading: every truck at a dock in the strip on top with its next step one tap away (check the
// empty trailer, start and finish loading, inspect, release to the gate). Checklists open in the side
// panel beside the yard; the release opens as a pop-up.
export default function DockHub({ entries, onEdit, onSaveInspection, onSaveTrailerCheck, onLoading, onRelease, inspector, onSetInspector }) {
  const now = useNow()
  const [view, setView] = useState('yard')
  const [picked, setPicked] = useState(null)
  // The checklist open in the panel: { id, part: 'trailer' | 'load' }.
  const [form, setForm] = useState(null)
  const [releasing, setReleasing] = useState(null)
  const card = entries.find((e) => e.id === picked)
  const formEntry = form && entries.find((e) => e.id === form.id)

  const open = (e, part) => {
    setPicked(e.id)
    setForm({ id: e.id, part })
  }
  const handlers = { onOpen: open, onLoading, onRelease: setReleasing }

  const atDock = entries.filter((e) => !e.timeOut && e.dockDoor)
  const work = [...atDock].sort((a, b) => ORDER[dockPhase(a)] - ORDER[dockPhase(b)] || byDock(a, b))
  const todo = work.filter((e) => dockAction(e, handlers))
  const needInspector = atDock.filter((e) => ['trailer', 'trailerFail', 'inspect', 'failed', 'release'].includes(dockPhase(e))).length
  const loading = atDock.filter((e) => dockPhase(e) === 'loading').length
  const incoming = entries.filter((e) => !e.timeOut && !e.dockDoor).length

  const queue = todo.map((e) => {
    const action = dockAction(e, handlers)
    const stage = currentStage(e)
    const phase = dockPhase(e)
    return {
      e,
      place: `Dock ${e.dockDoor}`,
      note: nextWords(e),
      bad: phase === 'trailerFail' || phase === 'failed',
      timer: stage && <TimerPill stage={stage.key} since={stage.since} now={now} />,
      action: { label: action.short, run: action.run, bad: action.bad },
    }
  })

  const cardAction = card && !card.timeOut && card.dockDoor ? dockAction(card, handlers) : null
  const actions = card && (
    <>
      {cardAction && (
        <button type="button" onClick={cardAction.run} className={(cardAction.bad ? ui.btn + ' border-danger text-danger' : ui.btnPrimary) + ' flex-1'}>
          {cardAction.label}
        </button>
      )}
      {card.loadingInspection && dockPhase(card) !== 'failed' && (
        <button type="button" onClick={() => open(card, 'load')} className={ui.btn}>
          View inspection
        </button>
      )}
      <button type="button" onClick={() => onEdit(card)} className={ui.btn}>
        View entry
      </button>
    </>
  )

  let panel
  if (formEntry) {
    panel = (
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-display text-[20px] leading-tight font-semibold">{form.part === 'trailer' ? 'Trailer Check' : 'Loading Inspection'}</h3>
          <button type="button" onClick={() => setForm(null)} aria-label="Back to the truck card" className={ui.btnSmall}>
            ← Back
          </button>
        </div>
        <InspectionForm
          key={`${form.id}:${form.part}`}
          entry={formEntry}
          part={form.part}
          inspector={inspector}
          onSave={(id, inspection) => {
            onSaveInspection(id, inspection)
            setForm(null)
          }}
          onSaveTrailerCheck={(id, check) => {
            onSaveTrailerCheck(id, { ...check, inspector: check.inspector || inspector })
            setForm(null)
          }}
          onCancel={() => setForm(null)}
        />
      </div>
    )
  } else if (card) {
    panel = (
      <TruckCard
        e={card}
        now={now}
        place={placeOf(card)}
        notice={!card.dockDoor && !card.timeOut && <p className="text-[13px] text-muted">Shipping assigns its dock; it shows up in the strip once it’s at one.</p>}
        actions={actions}
        onClose={() => setPicked(null)}
      />
    )
  } else {
    panel = (
      <PanelHome title="At the Docks" hint="Each truck’s steps and timer. Tap one for its card.">
        <TimerLegend />
        {work.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">
            No docks in use. Shipping assigns docks to waiting trucks.
          </p>
        ) : (
          <div className="grid gap-2">
            {work.map((e) => (
              <DockWorkCard key={e.id} e={e} now={now} selected={false} onOpen={open} onLoading={onLoading} onRelease={setReleasing} />
            ))}
          </div>
        )}
      </PanelHome>
    )
  }

  return (
    <>
      <Hub
        label="Dock & Loading"
        views={VIEWS}
        view={view}
        onView={setView}
        wide={Boolean(formEntry)}
        focusKey={form ? `${form.id}:${form.part}` : picked}
        onEscape={() => (form ? setForm(null) : setPicked(null))}
        tools={<OnDuty role="inspector" name={inspector} onChange={onSetInspector} id="field-inspector-on-duty" />}
        kpis={
          <>
            <Kpi label="At docks" value={atDock.length} />
            <Kpi label="Need the inspector" value={needInspector} tone={needInspector ? 'warn' : 'good'} note={needInspector ? 'Check, inspect or release' : 'All caught up'} />
            <Kpi label="Loading now" value={loading} />
            <Kpi label="Coming (no dock yet)" value={incoming} />
          </>
        }
        queue={<Queue title="To do" items={queue} empty="Nothing for the dock right now." selectedId={picked} onSelect={(id) => (setForm(null), setPicked(id))} />}
        main={
          view === 'docks' ? (
            <div className="h-full overflow-y-auto rounded-xl">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2.5">
                {work.map((e) => (
                  <DockWorkCard key={e.id} e={e} now={now} selected={e.id === picked} onOpen={open} onLoading={onLoading} onRelease={setReleasing} />
                ))}
              </div>
              {work.length === 0 && <p className="rounded-xl bg-panel p-6 text-center text-muted shadow-card">No docks in use.</p>}
            </div>
          ) : (
            <MapPane
              entries={entries}
              now={now}
              picked={picked}
              onPick={(id) => (setForm(null), setPicked(id))}
              focus={(e) => !e.timeOut && e.dockDoor && dockAction(e, handlers)?.short}
              hint={formEntry ? null : 'Tap a tagged truck for its next step'}
            />
          )
        }
        panel={panel}
      />
      <ReleaseDialog
        entry={releasing}
        by={inspector}
        onRelease={(id, data) => {
          onRelease(id, data)
          setReleasing(null)
        }}
        onClose={() => setReleasing(null)}
      />
    </>
  )
}

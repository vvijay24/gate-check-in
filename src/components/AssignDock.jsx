import { useState } from 'react'
import * as ui from '../ui'
import { DOCKS } from '../yard'

export const dockKey = (dock) => String(dock ?? '').trim().toUpperCase()

// Docks in use right now, keyed by normalized dock #: on-site trucks that have a dock.
export const occupiedDocks = (entries) =>
  new Map(entries.filter((e) => !e.timeOut && e.dockDoor).map((e) => [dockKey(e.dockDoor), e]))

// "Assign Dock" button that opens an inline Dock picker. Docks in use are listed but can't be picked,
// with the trailer holding them, so the guard sees the choice before saving instead of an error after.
// `extra` renders beside the button while the picker is closed.
export default function AssignDock({ entry, occupied, onAssignDock, extra, compact }) {
  const [assigning, setAssigning] = useState(false)
  const [dock, setDock] = useState('')
  const [error, setError] = useState('')
  const free = DOCKS.filter((d) => !occupied.has(dockKey(d)))

  const close = () => {
    setAssigning(false)
    setDock('')
    setError('')
  }

  const save = (ev) => {
    ev.preventDefault()
    const key = dockKey(dock)
    if (!key) return setError('Pick a dock')
    // Another screen may have taken the dock since the list was drawn.
    const busy = occupied.get(key)
    if (busy) return setError(`Dock ${dock} is in use by trailer ${busy.trailerNumber}. Check it out first.`)
    onAssignDock(entry.id, dock)
    close()
  }

  if (!assigning) {
    return (
      <div className={'flex flex-wrap items-center gap-3' + (compact ? '' : ' mt-2')}>
        <button type="button" onClick={() => setAssigning(true)} disabled={!free.length} className={ui.btnSmallPrimary}>
          Assign Dock
        </button>
        {!free.length && <span className="text-[13px] font-semibold text-muted">All docks in use</span>}
        {extra}
      </div>
    )
  }

  return (
    <form onSubmit={save} className={'flex flex-wrap items-end gap-2' + (compact ? '' : ' mt-2')} noValidate>
      <div className={compact ? 'w-40' : 'w-48'}>
        <label htmlFor={`dock-${entry.id}`} className={ui.label + ' mb-1'}>
          Dock
        </label>
        <select
          id={`dock-${entry.id}`}
          value={dock}
          onChange={(ev) => {
            setDock(ev.target.value)
            setError('')
          }}
          autoFocus
          className={ui.input + ' cursor-pointer' + (error ? ui.inputError : '')}
        >
          <option value="">{free.length ? 'Pick a free dock' : 'None free'}</option>
          {DOCKS.map((d) => {
            const busy = occupied.get(dockKey(d))
            return (
              <option key={d} value={d} disabled={Boolean(busy)}>
                {busy ? `Dock ${d} — in use · ${busy.trailerNumber}` : `Dock ${d}`}
              </option>
            )
          })}
        </select>
      </div>
      <button type="submit" className={ui.btnSmallPrimary + ' min-h-[52px]'}>
        Save
      </button>
      <button type="button" onClick={close} className={ui.btnSmall + ' min-h-[52px]'}>
        Cancel
      </button>
      {error && <p className={ui.errorText + ' w-full'}>{error}</p>}
    </form>
  )
}

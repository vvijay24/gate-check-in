import { useState } from 'react'
import * as ui from '../ui'

export const dockKey = (dock) => String(dock ?? '').trim().toUpperCase()

// Docks in use right now, keyed by normalized dock #: on-site trucks that have a dock.
export const occupiedDocks = (entries) =>
  new Map(entries.filter((e) => !e.timeOut && e.dockDoor).map((e) => [dockKey(e.dockDoor), e]))

// "Assign Dock" button that opens an inline Dock # form. Refuses a dock another truck is using.
// `extra` renders beside the button while the form is closed.
export default function AssignDock({ entry, occupied, onAssignDock, extra, compact }) {
  const [assigning, setAssigning] = useState(false)
  const [dock, setDock] = useState('')
  const [error, setError] = useState('')

  const close = () => {
    setAssigning(false)
    setDock('')
    setError('')
  }

  const save = (ev) => {
    ev.preventDefault()
    const key = dockKey(dock)
    if (!key) return setError('Enter a dock #')
    const busy = occupied.get(key)
    if (busy) return setError(`Dock ${dock.trim()} is in use by trailer ${busy.trailerNumber}. Check it out first.`)
    onAssignDock(entry.id, dock.trim())
    close()
  }

  if (!assigning) {
    return (
      <div className={'flex flex-wrap items-center gap-3' + (compact ? '' : ' mt-2')}>
        <button type="button" onClick={() => setAssigning(true)} className={ui.btnSmallPrimary}>
          Assign Dock
        </button>
        {extra}
      </div>
    )
  }

  return (
    <form onSubmit={save} className={'flex flex-wrap items-end gap-2' + (compact ? '' : ' mt-2')} noValidate>
      <div className="w-28">
        <label htmlFor={`dock-${entry.id}`} className={ui.label + ' mb-1'}>
          Dock #
        </label>
        <input
          id={`dock-${entry.id}`}
          value={dock}
          onChange={(ev) => {
            setDock(ev.target.value)
            setError('')
          }}
          inputMode="numeric"
          autoFocus
          className={ui.input + (error ? ui.inputError : '')}
        />
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

import { useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'

// "Guard on duty · Maria Lopez · Change" in the Gate's title row, like the inspector on Loading &
// Inspection. Set once per shift; every check-in and check-out is logged under this name. The button has
// the id the gate forms' error list jumps to.
export default function GuardOnDuty({ guard, onChange }) {
  const dialog = useRef(null)
  const [name, setName] = useState(guard)
  const open = () => {
    setName(guard)
    dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()
  const save = (ev) => {
    ev.preventDefault()
    const v = name.trim()
    if (!v) return
    onChange(v)
    close()
  }

  return (
    <>
      <span className="inline-flex min-h-12 items-center gap-3 rounded-2xl border border-hair bg-panel py-1 pr-1.5 pl-3.5 shadow-card">
        <Icon name="people" size={18} className="text-muted" />
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">Guard on duty</span>
          {guard ? <b>{guard}</b> : <b className="text-danger">Not set</b>}
        </span>
        <button id="field-guardOnDuty" type="button" onClick={open} className={ui.btnGhost + ' scroll-mt-[calc(var(--header-h,114px)+24px)]'}>
          {guard ? 'Change' : 'Set name'}
        </button>
      </span>
      <dialog
        ref={dialog}
        aria-labelledby="guard-title"
        onClick={(ev) => ev.target === dialog.current && close()}
        className={'w-[95vw] max-w-[440px] ' + ui.dialog}
      >
        <form onSubmit={save} className="grid gap-4 p-5">
          <h2 id="guard-title" className="flex items-center gap-3 font-display text-[20px] leading-tight font-bold">
            <Icon name="people" size={24} className="text-signal" />
            Guard on duty
          </h2>
          <label className="grid gap-1.5">
            <span className={ui.label}>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" className={ui.input} />
            <span className="text-[13px] text-muted">Every check-in and check-out on this device is logged under this name until it's changed.</span>
          </label>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={close} className={ui.btn}>
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()} className={ui.btnPrimary}>
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

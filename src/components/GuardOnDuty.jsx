import { useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'

// "On duty: Maria Lopez · Change" in the header on the Gate tab. Set once per shift; every check-in
// and check-out is logged under this name. The button has the id the gate forms' error list jumps to.
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
      <span className="on-chrome flex items-center gap-2 text-[15px] text-rail-text">
        <Icon name="people" size={18} />
        {guard ? (
          <>
            On duty: <b className="text-white">{guard}</b>
          </>
        ) : (
          <span className="font-semibold text-rail-alert">No guard on duty set</span>
        )}
        <button
          id="field-guardOnDuty"
          type="button"
          onClick={open}
          className="min-h-10 cursor-pointer rounded-[10px] border border-white/15 bg-white/10 px-3 font-semibold text-white transition-colors duration-150 hover:bg-white/20"
        >
          {guard ? 'Change' : 'Set guard on duty'}
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

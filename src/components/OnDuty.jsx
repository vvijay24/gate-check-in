import { useRef, useState } from 'react'
import * as ui from '../ui'

// Who is on duty on this device: the guard on the Gate, the inspector on Dock & Loading. Set once
// per shift; everything they save is logged under this name. Kept in this browser.
const KEYS = { guard: 'guard-on-duty', inspector: 'inspector-on-duty' }

export function loadOnDuty(role) {
  try {
    return localStorage.getItem(KEYS[role]) ?? ''
  } catch {
    return ''
  }
}
export function saveOnDuty(role, name) {
  try {
    localStorage.setItem(KEYS[role], name)
  } catch {
    // Kept in memory for this visit.
  }
}

const WORDS = {
  guard: { short: 'Guard', title: 'Guard on duty', none: 'No guard on duty', note: 'Every check-in and check-out on this device is logged under this name until it’s changed.' },
  inspector: {
    short: 'Inspector',
    title: 'Inspector on duty',
    none: 'No inspector on duty',
    note: 'Trailer checks, inspections and releases to the gate on this device are logged under this name until it’s changed.',
  },
}

// `tone`: 'chrome' sits in the dark header; 'page' on a light panel. `id` is what an error list jumps
// to (the Change / Set button).
export default function OnDuty({ role, name, onChange, tone = 'page', id }) {
  const dialog = useRef(null)
  const [draft, setDraft] = useState(name)
  const w = WORDS[role]
  const open = () => {
    setDraft(name)
    dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()
  const save = (ev) => {
    ev.preventDefault()
    const v = draft.trim()
    if (!v) return
    onChange(v)
    close()
  }
  const chrome = tone === 'chrome'
  return (
    <>
      <span
        className={
          'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1 text-[13px] ' +
          (chrome ? 'border-white/10 bg-white/[0.04] text-rail-text' : 'border-line bg-panel text-muted shadow-card')
        }
      >
        <span className={'eyebrow hidden whitespace-nowrap ' + (chrome ? '2xl:inline' : 'sm:inline')}>{w.title}</span>
        {chrome && name && <span className="eyebrow whitespace-nowrap 2xl:hidden">{w.short}</span>}
        {name ? (
          <b className={'truncate font-semibold ' + (chrome ? 'max-w-40 text-white' : 'text-ink')}>{name}</b>
        ) : (
          <b className={'font-semibold whitespace-nowrap ' + (chrome ? 'text-rail-alert' : 'text-danger')}>{w.none}</b>
        )}
        <button
          id={id}
          type="button"
          onClick={open}
          className={
            'min-h-8 shrink-0 cursor-pointer rounded px-2 font-semibold underline ' + (chrome ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-field')
          }
        >
          {name ? 'Change' : 'Set'}
        </button>
      </span>
      <dialog
        ref={dialog}
        aria-labelledby={`${role}-duty-title`}
        onClick={(ev) => ev.target === dialog.current && close()}
        className="m-auto w-[95vw] max-w-[440px] rounded-xl bg-panel p-0 text-ink shadow-raised backdrop:bg-black/60"
      >
        <form onSubmit={save} className="grid gap-4 p-5">
          <h2 id={`${role}-duty-title`} className="font-display text-[20px] leading-tight font-semibold">
            {w.title}
          </h2>
          <label className="grid gap-1.5">
            <span className={ui.label}>Your name</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus autoComplete="name" className={ui.input} />
            <span className="text-[13px] text-muted">{w.note}</span>
          </label>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={close} className={ui.btn}>
              Cancel
            </button>
            <button type="submit" disabled={!draft.trim()} className={ui.btnPrimary}>
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

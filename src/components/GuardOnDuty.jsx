import { useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'

// The guard on duty: set once a day on this device (it clears at midnight), and every check-in and
// check-out is logged under that name. Until it's set, the Gate shows `GuardStart` instead of the form.

// Guards who logged entries on this device, most recent first, as one-tap choices.
export function recentGuards(entries, max = 6) {
  const last = new Map()
  for (const e of entries) {
    for (const [name, at] of [
      [e.guardOnDuty, e.createdAt],
      [e.guardOut, e.checkedOutAt ?? e.updatedAt ?? e.createdAt],
    ]) {
      const n = String(name ?? '').trim()
      if (n && (at ?? 0) >= (last.get(n) ?? -1)) last.set(n, at ?? 0)
    }
  }
  return [...last].sort((a, b) => b[1] - a[1]).slice(0, max).map(([n]) => n)
}

// Recent names as big buttons (one tap saves), or type a new one.
function GuardPicker({ recent, initial = '', submitLabel, onSave, children }) {
  const [name, setName] = useState(initial)
  const save = (ev) => {
    ev.preventDefault()
    const v = name.trim()
    if (v) onSave(v)
  }
  return (
    <form onSubmit={save} className="grid gap-4">
      {recent.length > 0 && (
        <div role="group" aria-label="Recent guards" className="flex flex-wrap gap-2">
          {recent.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onSave(n)}
              className="inline-flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-line bg-panel px-4 font-display text-[17px] font-bold text-ink transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-signal-bright hover:bg-signal-tint active:translate-y-px"
            >
              <Icon name="people" size={18} className="text-signal" />
              {n}
            </button>
          ))}
        </div>
      )}
      <label className="grid gap-1.5">
        <span className={ui.label}>{recent.length ? 'Or type your name' : 'Your name'}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={ui.input} />
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        {children}
        <button type="submit" disabled={!name.trim()} className={ui.btnPrimary}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

// Shown in place of the Check In / Check Out form while no guard is on duty.
export function GuardStart({ recent, onChange }) {
  return (
    <section aria-labelledby="guard-start-title" className={ui.card + ' animate-pop'}>
      <div className="flex items-center gap-3.5 rounded-t-2xl border-b border-hair bg-signal-tint px-5 py-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warn text-warn-ink shadow-card" aria-hidden="true">
          <Icon name="people" size={22} />
        </span>
        <div className="min-w-0">
          <h2 id="guard-start-title" className="font-display text-[20px] leading-tight font-bold">
            Who's on duty at the gate?
          </h2>
          <p className="text-[14px] text-muted">Every check-in and check-out today is logged under this name. It's asked again tomorrow.</p>
        </div>
      </div>
      <div className="px-5 pt-4 pb-5">
        <GuardPicker recent={recent} submitLabel="Start shift" onSave={onChange} />
      </div>
    </section>
  )
}

// "Guard on duty · Maria Lopez · Change" in the Gate's title row, like the inspector on Loading &
// Inspection. The button has the id the gate forms' error list jumps to.
export default function GuardOnDuty({ guard, recent = [], onChange }) {
  const dialog = useRef(null)
  // Remounts the picker each time it opens, so it starts from the current name.
  const [opened, setOpened] = useState(0)
  const open = () => {
    setOpened((n) => n + 1)
    dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()

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
        className={'w-[95vw] max-w-[480px] ' + ui.dialog}
      >
        <div className="grid gap-4 p-5">
          <h2 id="guard-title" className="flex items-center gap-3 font-display text-[20px] leading-tight font-bold">
            <Icon name="people" size={24} className="text-signal" />
            Guard on duty
          </h2>
          <p className="-mt-2 text-[13px] text-muted">Every check-in and check-out on this device is logged under this name for the rest of today.</p>
          <GuardPicker
            key={opened}
            recent={recent.filter((n) => n !== guard)}
            initial={guard}
            submitLabel="Save"
            onSave={(v) => {
              onChange(v)
              close()
            }}
          >
            <button type="button" onClick={close} className={ui.btn}>
              Cancel
            </button>
          </GuardPicker>
        </div>
      </dialog>
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as ui from '../ui'
import { duration } from '../time'
import { Icon, IconChip } from '../icons'

// The inspector's sign-off before a truck that passed its inspection may leave: confirm the order and
// seal and tick the paperwork. Opened from Loading & Inspection only; `inspector` (the inspector on duty)
// signs the release. Opens as a pop-up while `entry` is set.
const BY_KEY = 'release-by'

const lastReleasedBy = () => {
  try {
    return localStorage.getItem(BY_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function ReleaseDialog({ entry, inspector, onRelease, onClose }) {
  const dialog = useRef(null)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})

  // Open with fresh values each time a truck is chosen; close when cleared.
  useEffect(() => {
    if (entry) {
      setForm({
        orderNo: entry.pickupNumber ?? '',
        seal: entry.loadingInspection?.sealApplied || entry.outgoingSeals || '',
        paperwork: false,
        releasedBy: inspector || lastReleasedBy(),
        note: '',
      })
      setErrors({})
      if (!dialog.current?.open) dialog.current?.showModal()
    } else if (dialog.current?.open) {
      dialog.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest)
  }

  const submit = (ev) => {
    ev.preventDefault()
    const errs = {}
    if (!form.paperwork) errs.paperwork = 'Confirm the paperwork was handed to the driver'
    if (!form.releasedBy.trim()) errs.releasedBy = 'Required'
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.getElementById(`release-${Object.keys(errs)[0]}`)?.focus()
      return
    }
    try {
      localStorage.setItem(BY_KEY, form.releasedBy.trim())
    } catch {
      // Remembering the name is only a convenience.
    }
    onRelease(entry.id, { ...form, releasedBy: form.releasedBy.trim(), note: form.note.trim() })
  }

  const passedAgo = entry?.loadingInspection?.inspectedAt ? duration(Date.now() - entry.loadingInspection.inspectedAt) : null

  return (
    <dialog
      ref={dialog}
      aria-labelledby="release-title"
      onClose={onClose}
      onClick={(ev) => ev.target === dialog.current && onClose()}
      className={'w-[95vw] max-w-[560px] ' + ui.dialog}
    >
      {/* Padding sits on this wrapper so a click inside the pop-up never reaches the dialog itself. */}
      {entry && form && (
        <form onSubmit={submit} noValidate>
          <div className="flex items-center gap-3 bg-signal-tint px-5 py-4">
            <IconChip name="inspected" />
            <div className="min-w-0 flex-1">
              <h2 id="release-title" className="font-display text-[22px] leading-tight font-bold">
                Release to gate
              </h2>
              <p className="text-[15px] text-muted">
                Dock {entry.dockDoor} · Trailer {entry.trailerNumber} · {entry.truckName}
                {entry.customerPickupFor && ` · For ${entry.customerPickupFor}`}
                {passedAgo && ` · Inspection passed ${passedAgo} ago`}
              </p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={ui.label}>Order No</span>
                <input id="release-orderNo" value={form.orderNo} onChange={(e) => set('orderNo', e.target.value)} className={ui.input} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={ui.label}>Seal # on the trailer</span>
                <input id="release-seal" value={form.seal} onChange={(e) => set('seal', e.target.value)} className={ui.input} />
              </label>
            </div>

            <div>
              <label
                className={
                  'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border-[1.5px] bg-field px-4 font-semibold transition-[border-color,background-color,box-shadow] duration-150 hover:border-signal-bright has-[:checked]:border-signal has-[:checked]:bg-panel has-[:checked]:shadow-raised ' +
                  (errors.paperwork ? 'border-danger' : 'border-line')
                }
              >
                <input
                  id="release-paperwork"
                  type="checkbox"
                  checked={form.paperwork}
                  onChange={(e) => set('paperwork', e.target.checked)}
                  aria-invalid={errors.paperwork ? true : undefined}
                  aria-describedby={errors.paperwork ? 'release-paperwork-error' : undefined}
                  className="h-6 w-6 shrink-0 cursor-pointer"
                />
                BOL / shipping papers handed to the driver
                <span className={ui.required}>*</span>
              </label>
              {errors.paperwork && (
                <p id="release-paperwork-error" className={ui.errorText + ' mt-1'}>
                  {errors.paperwork}
                </p>
              )}
            </div>

            {inspector ? (
              <p className="flex items-center gap-2 rounded-xl bg-signal-tint px-4 py-3 text-[15px]">
                <Icon name="people" size={18} className="text-muted" />
                Released by <b>{inspector}</b>
                <span className="text-muted">· inspector on duty</span>
              </p>
            ) : (
            <label className="flex flex-col gap-1">
              <span className={ui.label}>
                Released by<span className={ui.required}>*</span>
              </span>
              <input
                id="release-releasedBy"
                value={form.releasedBy}
                onChange={(e) => set('releasedBy', e.target.value)}
                aria-invalid={errors.releasedBy ? true : undefined}
                className={ui.input + (errors.releasedBy ? ui.inputError : '')}
              />
              {errors.releasedBy && <span className={ui.errorText}>{errors.releasedBy}</span>}
            </label>
            )}

            <label className="flex flex-col gap-1">
              <span className={ui.label}>Note for the gate (optional)</span>
              <textarea
                id="release-note"
                rows={2}
                value={form.note}
                onChange={(e) => set('note', e.target.value)}
                placeholder="e.g. Driver to collect a copy of the BOL at the window"
                className={ui.input + ' min-h-[64px] resize-y'}
              />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-hair px-5 py-4">
            <button type="button" onClick={onClose} className={ui.btn}>
              Cancel
            </button>
            <button type="submit" className={ui.btnPrimary}>
              <Icon name="checkOut" size={24} />
              Release to gate
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}

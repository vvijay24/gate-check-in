import { useEffect, useRef, useState } from 'react'
import * as ui from '../ui'
import { duration } from '../time'
import { Icon, IconChip } from '../icons'
import { isDrop } from '../metrics'
import { inYard } from '../handoff'

// The inspector's sign-off before a truck that passed its inspection may leave: confirm the order and
// seal and tick the paperwork. Opened from Loading & Inspection only; `inspector` (the inspector on duty)
// signs the release. Opens as a pop-up while `entry` is set.
// A dropped trailer has no driver waiting: it's released to the yard instead, to a parking spot (spots
// taken by other loaded trailers in `entries` can't be picked), and waits there for a driver to hook it.
const BY_KEY = 'release-by'
// Parking spots in the yard lane for loaded trailers waiting for a hook.
export const YARD_SPOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

const lastReleasedBy = () => {
  try {
    return localStorage.getItem(BY_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function ReleaseDialog({ entry, entries = [], inspector, onRelease, onClose }) {
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
        spot: '',
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
    if (!form.paperwork) errs.paperwork = toYard ? 'Confirm the paperwork is with the trailer' : 'Confirm the paperwork was handed to the driver'
    if (toYard && !form.spot) errs.spot = 'Pick the spot the trailer is parked in'
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
    onRelease(entry.id, { ...form, releasedBy: form.releasedBy.trim(), note: form.note.trim(), toYard, spot: toYard ? form.spot : undefined })
  }

  const toYard = Boolean(entry && isDrop(entry))
  const taken = new Set(entries.filter((e) => e.id !== entry?.id && !e.timeOut && inYard(e)).map((e) => e.release.spot))
  const title = toYard ? 'Release to yard' : 'Release to gate'
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
                {title}
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
                {toYard ? 'BOL / shipping papers left with the trailer' : 'BOL / shipping papers handed to the driver'}
                <span className={ui.required}>*</span>
              </label>
              {errors.paperwork && (
                <p id="release-paperwork-error" className={ui.errorText + ' mt-1'}>
                  {errors.paperwork}
                </p>
              )}
            </div>

            {toYard && (
              <div>
                <span id="release-spot-label" className={ui.label}>
                  Parked in the yard · spot<span className={ui.required}>*</span>
                </span>
                <div role="group" aria-labelledby="release-spot-label" className="mt-1.5 grid grid-cols-5 gap-2">
                  {YARD_SPOTS.map((s, i) => (
                    <button
                      key={s}
                      id={i === 0 ? 'release-spot' : undefined}
                      type="button"
                      aria-pressed={form.spot === s}
                      disabled={taken.has(s)}
                      onClick={() => set('spot', s)}
                      title={taken.has(s) ? 'Another loaded trailer is parked here' : undefined}
                      className={ui.seg(form.spot === s, Boolean(errors.spot)) + ' font-display text-[16px] font-bold disabled:cursor-not-allowed disabled:opacity-40'}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className={'mt-1 text-[13px] ' + (errors.spot ? ui.errorText : 'text-muted')}>
                  {errors.spot ?? 'The dock is free again. The trailer shows on the Gate as ready to leave, for a driver to hook it.'}
                </p>
              </div>
            )}

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
                placeholder={toYard ? 'e.g. Reefer running at 34 °F, fuel ¾' : 'e.g. Driver to collect a copy of the BOL at the window'}
                className={ui.input + ' min-h-[64px] resize-y'}
              />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-hair px-5 py-4">
            <button type="button" onClick={onClose} className={ui.btn}>
              Cancel
            </button>
            <button type="submit" className={ui.btnPrimary}>
              <Icon name={toYard ? 'yard' : 'checkOut'} size={24} />
              {title}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon, IconChip } from '../icons'
import { VISIT_PURPOSES, isRequired } from '../formConfig'
import { FIELD_LABELS, cleanForSave, dayLabel, timeLabel, validate } from '../gateForm'
import { EARLY_GRACE_MIN, LATE_GRACE_MIN, clockTime, minutesLate } from '../time'
import { visitMemory } from '../visitMemory'
import { Chips, FieldBox, PRESS, Seg, Stepper } from './gate/parts'

// One visit at a glance, opened from the Shipping board's "View entry": what the guard entered at check-in
// and what has happened at the dock so far, read-only. "Edit entry" turns the check-in details into fields
// in the same pop-up, so Shipping corrects them without going to the Gate. Arrival, the guard and the dock
// record stay read-only. Opens while `entry` is set; `onSave(id, changes)` saves a correction.

// What Shipping may change, in on-screen order.
const EDITABLE = [
  'visitPurpose',
  'appointmentTime',
  'trailerNumber',
  'truckName',
  'truckerNameIn',
  'driverPhone',
  'pickupNumber',
  'customerPickupFor',
  'incomingSeals',
  'sealIntact',
  'reefer',
  'tempSet',
  'tempActual',
  'fuelIn',
  'emptyPallets',
  'shipmentContents',
]
const FUEL = [
  { value: 'Empty', danger: true },
  { value: '1/4', label: '¼' },
  { value: '1/2', label: '½' },
  { value: '3/4', label: '¾' },
  { value: 'Full' },
]
const FUEL_LABEL = { '1/4': '¼', '1/2': '½', '3/4': '¾' }
const PURPOSE_ON = {
  Delivery: 'border-delivery bg-delivery-soft text-delivery',
  Pickup: 'border-pickup bg-pickup-soft text-pickup',
  'Drop Trailer': 'border-drop bg-drop-soft text-drop',
}
const filled = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '')
const pick = (e) => Object.fromEntries(EDITABLE.map((k) => [k, e[k] ?? (k === 'visitPurpose' ? [] : '')]))

function Pill({ tone, icon, children }) {
  const cls = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn text-warn-ink', bad: 'bg-danger-soft text-danger' }[tone]
  return (
    <span className={ui.tag + ' ' + cls}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

function apptPill(e) {
  const late = minutesLate(e)
  if (late == null) return null
  if (late > LATE_GRACE_MIN) return <Pill tone="bad">{late} min late</Pill>
  if (late < -EARLY_GRACE_MIN) return <Pill tone="warn">{-late} min early</Pill>
  return <Pill tone="ok">On time</Pill>
}

// A titled group of label / value rows.
function Group({ icon, title, rows }) {
  const shown = rows.filter(Boolean)
  return (
    <section aria-label={title} className="rounded-xl border border-hair bg-field px-4 py-3">
      <h3 className="mb-1.5 flex items-center gap-2 font-display text-[16px] font-bold">
        <Icon name={icon} size={18} className="text-signal" />
        {title}
      </h3>
      <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        {shown.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words">{filled(value) ? value : '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Details({ e }) {
  const reefer = e.reefer === 'Yes'
  const pickup = (e.visitPurpose ?? []).includes('Pickup')
  const tempGap = reefer && filled(e.tempSet) && filled(e.tempActual) ? Math.abs(parseFloat(e.tempActual) - parseFloat(e.tempSet)) : 0
  const tc = e.trailerCheck
  const insp = e.loadingInspection
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Group
        icon="checkIn"
        title="Check in"
        rows={[
          ['Arrived', `${timeLabel(e.timeIn) || '—'} · ${dayLabel(e.dateIn) || '—'}`],
          ['Guard', e.guardOnDuty],
          ['Purpose', (e.visitPurpose ?? []).join(' + ')],
          [
            'Appointment',
            e.appointmentTime ? (
              <span className="flex flex-wrap items-center gap-2">
                {timeLabel(e.appointmentTime)} {apptPill(e)}
              </span>
            ) : (
              'No appointment'
            ),
          ],
        ]}
      />
      <Group
        icon="truck"
        title="Vehicle"
        rows={[
          ['Trailer #', <b key="t">{e.trailerNumber || '—'}</b>],
          ['Carrier', e.truckName],
          ['Driver', e.truckerNameIn],
          ['Driver phone', e.driverPhone],
          pickup && ['Order No', e.pickupNumber],
          pickup && ['Customer', e.customerPickupFor],
        ]}
      />
      <Group
        icon={reefer ? 'reefer' : 'seal'}
        title="Trailer"
        rows={[
          [
            'Seal #',
            <span key="s" className="flex flex-wrap items-center gap-2">
              {e.incomingSeals || '—'}
              {e.sealIntact === 'No' ? (
                <Pill tone="bad" icon="warning">
                  Not intact
                </Pill>
              ) : e.sealIntact === 'Yes' ? (
                <span className="text-muted">intact</span>
              ) : null}
            </span>,
          ],
          ['Reefer', reefer ? 'Yes' : e.reefer === 'No' ? 'No, dry van' : ''],
          reefer && [
            'Set / actual',
            <span key="r" className="flex flex-wrap items-center gap-2">
              {e.tempSet || '?'}° / {e.tempActual || '?'}°F
              {tempGap > 3 && (
                <Pill tone="bad" icon="warning">
                  {tempGap.toFixed(1)}° off
                </Pill>
              )}
            </span>,
          ],
          reefer && ['Reefer fuel', FUEL_LABEL[e.fuelIn] ?? e.fuelIn],
          filled(e.emptyPallets) && e.emptyPallets !== '0' && ['Empty pallets', e.emptyPallets],
          ['Note', e.shipmentContents],
        ]}
      />
      <Group
        icon="dock"
        title="At the dock so far"
        rows={[
          ['Dock', e.dockDoor ? `Dock ${e.dockDoor}${e.dockAssignedAt ? ` · since ${clockTime(e.dockAssignedAt)}` : ''}` : 'No dock yet'],
          [
            'Trailer check',
            tc ? (
              tc.result === 'Pass' ? (
                `Passed · ${clockTime(tc.savedAt)}${tc.technician ? ` by ${tc.technician}` : ''}`
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <Pill tone="bad" icon="failed">
                    Failed · {(tc.issues ?? [])[0] ?? 're-check'}
                  </Pill>
                  {tc.technician && <span className="text-muted">by {tc.technician}</span>}
                </span>
              )
            ) : (
              'Not yet'
            ),
          ],
          ['Loading', e.loadStartedAt ? `${clockTime(e.loadStartedAt)} – ${e.loadFinishedAt ? clockTime(e.loadFinishedAt) : 'still loading'}` : 'Not started'],
          [
            'Inspection',
            insp ? (
              insp.result === 'Pass' ? (
                `Passed · ${clockTime(insp.inspectedAt ?? insp.savedAt)}${insp.inspector ? ` by ${insp.inspector}` : ''}`
              ) : (
                <Pill tone="bad" icon="failed">
                  Failed · {(insp.issues ?? [])[0] ?? 're-check'}
                </Pill>
              )
            ) : (
              'Not yet'
            ),
          ],
          ['Release', e.release?.releasedAt ? `Released ${clockTime(e.release.releasedAt)} by ${e.release.releasedBy}` : 'Not yet'],
        ]}
      />
    </div>
  )
}

function EditForm({ entry, entries, form, set, errors }) {
  const memory = useMemo(() => visitMemory(entries, entry.id), [entries, entry.id])
  const purposes = form.visitPurpose ?? []
  const hasPickup = purposes.includes('Pickup')
  const reefer = form.reefer === 'Yes'
  const err = (n) => errors[n]
  const text = (n) => ({ id: `field-${n}`, value: form[n] ?? '', onChange: (e) => set({ [n]: e.target.value }), className: ui.input + (err(n) ? ui.inputError : '') })
  const required = (n) => isRequired(n, { ...entry, ...form }, 'in')
  const togglePurpose = (p) =>
    set({ visitPurpose: purposes.includes(p) ? purposes.filter((x) => x !== p) : VISIT_PURPOSES.filter((x) => x === p || purposes.includes(x)) })

  return (
    <div className="grid gap-4">
      <FieldBox name="visitPurpose" label="Purpose" required group error={err('visitPurpose')}>
        <div role="group" aria-labelledby="field-visitPurpose-label" className="grid grid-cols-3 gap-2">
          {VISIT_PURPOSES.map((p, i) => {
            const on = purposes.includes(p)
            return (
              <button
                key={p}
                id={i === 0 ? 'field-visitPurpose' : undefined}
                type="button"
                aria-pressed={on}
                onClick={() => togglePurpose(p)}
                className={
                  PRESS +
                  'min-h-14 rounded-xl px-2 font-display text-[16px] font-bold ' +
                  (on ? PURPOSE_ON[p] + ' shadow-raised' : (err('visitPurpose') ? 'border-danger' : 'border-line') + ' bg-field text-ink hover:border-signal-bright')
                }
              >
                {p === 'Drop Trailer' ? 'Drop' : p}
              </button>
            )
          })}
        </div>
      </FieldBox>
      <FieldBox name="appointmentTime" label="Appointment time" required={required('appointmentTime')} error={err('appointmentTime')}>
        <input type="time" {...text('appointmentTime')} className={text('appointmentTime').className + ' max-w-[220px]'} />
      </FieldBox>

      <FieldBox name="trailerNumber" label="Trailer #" required error={err('trailerNumber')}>
        <input {...text('trailerNumber')} autoComplete="off" />
      </FieldBox>
      <FieldBox name="truckName" label="Carrier" required error={err('truckName')}>
        <Chips label="Recent carriers" items={memory.carriers} value={form.truckName} onPick={(truckName) => set({ truckName })} />
        <input {...text('truckName')} placeholder="Or type it" />
      </FieldBox>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBox name="driverPhone" label="Driver phone" required error={err('driverPhone')} hint="10 digits">
          <input type="tel" inputMode="tel" autoComplete="off" {...text('driverPhone')} />
        </FieldBox>
        <FieldBox name="truckerNameIn" label="Driver name" required error={err('truckerNameIn')}>
          <input {...text('truckerNameIn')} />
        </FieldBox>
      </div>
      {hasPickup && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBox name="pickupNumber" label="Order No" required error={err('pickupNumber')}>
            <input {...text('pickupNumber')} />
          </FieldBox>
          <FieldBox name="customerPickupFor" label="Customer" required error={err('customerPickupFor')}>
            <Chips label="Recent customers" items={memory.customers} value={form.customerPickupFor} onPick={(customerPickupFor) => set({ customerPickupFor })} />
            <input {...text('customerPickupFor')} placeholder="Or type it" />
          </FieldBox>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBox name="incomingSeals" label="Seal #" required error={err('incomingSeals')}>
          <input {...text('incomingSeals')} inputMode="numeric" autoComplete="off" />
        </FieldBox>
        <FieldBox name="sealIntact" label="Seal intact?" required group error={err('sealIntact')}>
          <Seg name="sealIntact" value={form.sealIntact} onChange={(sealIntact) => set({ sealIntact })} error={err('sealIntact')} options={[{ value: 'Yes' }, { value: 'No', danger: true }]} />
        </FieldBox>
      </div>
      <FieldBox name="reefer" label="Reefer?" required group error={err('reefer')}>
        <Seg name="reefer" value={form.reefer} onChange={(v) => set({ reefer: v })} error={err('reefer')} options={[{ value: 'Yes' }, { value: 'No', label: 'No, dry van' }]} />
      </FieldBox>
      {reefer && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox name="tempSet" label="Set point °F" required error={err('tempSet')}>
              <Stepper name="tempSet" label="set point °F" value={form.tempSet} onChange={(tempSet) => set({ tempSet })} error={err('tempSet')} />
            </FieldBox>
            <FieldBox name="tempActual" label="Actual °F" required error={err('tempActual')}>
              <Stepper name="tempActual" label="actual temp °F" value={form.tempActual} onChange={(tempActual) => set({ tempActual })} error={err('tempActual')} />
            </FieldBox>
          </div>
          <FieldBox name="fuelIn" label="Reefer fuel" required group error={err('fuelIn')}>
            <Seg name="fuelIn" value={form.fuelIn} onChange={(fuelIn) => set({ fuelIn })} error={err('fuelIn')} options={FUEL} />
          </FieldBox>
        </>
      )}
      <FieldBox name="emptyPallets" label="Empty pallets" className="max-w-[320px]">
        <Stepper name="emptyPallets" label="empty pallets" value={form.emptyPallets} min={0} inputMode="numeric" onChange={(emptyPallets) => set({ emptyPallets })} />
      </FieldBox>
      <FieldBox name="shipmentContents" label="Note">
        <textarea {...text('shipmentContents')} rows={2} className={text('shipmentContents').className + ' min-h-[72px] resize-y'} />
      </FieldBox>
    </div>
  )
}

export default function EntryDialog({ entry, entries, onSave, onClose }) {
  const dialog = useRef(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})

  // Open on the details each time a truck is chosen; close when cleared.
  useEffect(() => {
    if (entry) {
      setEditing(false)
      setErrors({})
      if (!dialog.current?.open) dialog.current?.showModal()
    } else if (dialog.current?.open) {
      dialog.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id])

  const startEdit = () => {
    setForm(pick(entry))
    setErrors({})
    setEditing(true)
  }
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => !(k in patch))))
  }
  const save = (ev) => {
    ev.preventDefault()
    const all = validate({ ...entry, ...form }, 'in')
    const errs = Object.fromEntries(Object.entries(all).filter(([k]) => EDITABLE.includes(k)))
    setErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) return document.getElementById(`field-${first}`)?.focus()
    // Only what changed is saved; a save with no changes just goes back to the details.
    const clean = cleanForSave({ ...entry, ...form })
    const changes = Object.fromEntries(EDITABLE.filter((k) => JSON.stringify(clean[k] ?? '') !== JSON.stringify(entry[k] ?? '')).map((k) => [k, clean[k]]))
    if (Object.keys(changes).length) onSave(entry.id, changes)
    else setEditing(false)
  }

  const sub = entry && [
    `Checked in ${timeLabel(entry.timeIn) || '—'}${entry.guardOnDuty ? ` by ${entry.guardOnDuty}` : ''}`,
    entry.editedAt && `Edited${entry.editedBy ? ` by ${entry.editedBy}` : ''} · ${clockTime(entry.editedAt)}`,
  ]

  return (
    <dialog
      ref={dialog}
      aria-labelledby="entry-dialog-title"
      onClose={onClose}
      onClick={(ev) => ev.target === dialog.current && onClose()}
      className={'w-[95vw] max-w-[760px] ' + ui.dialog}
    >
      {/* Padding sits on this wrapper so a click inside the pop-up never reaches the dialog itself. */}
      {entry && (
        <form onSubmit={save} noValidate>
          <div className="flex items-center gap-3 bg-signal-tint px-5 py-4">
            <IconChip name={editing ? 'edit' : 'log'} />
            <div className="min-w-0 flex-1">
              <h2 id="entry-dialog-title" className="font-display text-[22px] leading-tight font-bold break-words">
                {editing ? 'Edit entry · ' : ''}Trailer {entry.trailerNumber || '—'} · {entry.truckName || '—'}
              </h2>
              <p className="text-[15px] text-muted">{sub.filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={ui.btnGhost + ' self-start'}>
              <Icon name="close" />
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-5">
            {editing ? (
              <>
                {Object.keys(errors).length > 0 && (
                  <p role="alert" className="mb-4 flex animate-pop items-start gap-2 rounded-xl bg-danger-soft px-4 py-2.5 font-semibold text-danger">
                    <Icon name="warning" className="mt-0.5" />
                    Fix: {Object.keys(errors).map((k) => FIELD_LABELS[k] ?? k).join(', ')}
                  </p>
                )}
                <EditForm entry={entry} entries={entries} form={form} set={set} errors={errors} />
                <p className="mt-4 text-[13px] text-muted">Arrival, the guard and the dock record can't be changed here.</p>
              </>
            ) : (
              <Details e={entry} />
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-hair px-5 py-4">
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(false)} className={ui.btn}>
                  Cancel
                </button>
                <button type="submit" className={ui.btnPrimary}>
                  <Icon name="done" />
                  Save changes
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} className={ui.btn}>
                  Close
                </button>
                <button type="button" onClick={startEdit} className={ui.btnPrimary}>
                  <Icon name="edit" />
                  Edit entry
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </dialog>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import { isRequired } from '../formConfig'
import { arrivalMs, clockTime, departureMs, duration } from '../time'
import { checkOutBlock, expectedSeal, inYard, isReleased } from '../handoff'

// Where the truck or trailer is: its dock, or the yard (with its spot for a loaded drop trailer).
const placeOf = (e) => (inYard(e) ? `In the yard${e.release.spot ? ` · spot ${e.release.spot}` : ''}` : e.dockDoor ? `Dock ${e.dockDoor}` : 'In the yard')
import { DETENTION_ICON, DETENTION_TAG, detentionState } from '../detention'
import { PHONE_PROPS, checkOutStart, isPhone, phoneInput, timeLabel, validate, withPhones } from '../gateForm'
import { CompactGate, FieldBox, LinkButton, More, Note, PANEL_BODY, PANEL_FOOT, Recap, Seg, StepBar, panelBtn, panelGo } from './gate/parts'

// Gate Check Out in one panel, the same size and look as Check In's: (1) the truck leaving — picked from
// the list of trucks on site, which scrolls inside its box — with what's already known, (2) the driver
// going out, (3) the seal and reefer fuel with a short recap, then Check Out → "Confirm Check Out?" in the
// panel's foot. Back / Next move between the steps. Without `initial` only the truck list shows; picking
// a truck calls `onPick`, which opens this page for it. A truck that already left opens for editing its
// departure. A truck that can't leave yet stays on step 1 with Next greyed out.

const FUEL = [
  { value: 'Empty', danger: true },
  { value: '1/4', label: '¼' },
  { value: '1/2', label: '½' },
  { value: '3/4', label: '¾' },
  { value: 'Full' },
]
const FUEL_LABEL = { '1/4': '¼', '1/2': '½', '3/4': '¾' }
const STRIPE = { Pickup: 'bg-pickup', 'Drop Trailer': 'bg-drop' }
const PURPOSE_TAG = { Pickup: 'bg-pickup-soft text-pickup', 'Drop Trailer': 'bg-drop-soft text-drop' }
const filled = (v) => String(v ?? '').trim() !== ''
// Short form of why a truck can't leave yet.
const blockedShort = (e) =>
  e.loadingInspection?.result === 'Fail' ? 'Inspection failed · re-check' : !e.loadingInspection ? 'Not inspected yet' : 'Waiting for the inspector to release'

function Pills({ e, now }) {
  const det = detentionState(e, now)
  const blocked = checkOutBlock(e)
  return (
    <span className="flex flex-wrap gap-1.5">
      {blocked ? (
        <span className={ui.tag + ' bg-danger-soft text-danger'}>
          <Icon name="blocked" size={14} />
          {blockedShort(e)}
        </span>
      ) : (
        isReleased(e) && (
          <span className={ui.tag + ' bg-ok-soft text-ok'}>
            <Icon name="done" size={14} />
            Ready to leave
          </span>
        )
      )}
      {det && (
        <span className={ui.tag + ' ' + DETENTION_TAG[det.level]}>
          <Icon name={DETENTION_ICON[det.level]} size={14} />
          {det.text}
        </span>
      )}
    </span>
  )
}

// One truck in the list: one row, tap to open it. It lifts a little on hover.
function TruckRow({ e, now, onPick }) {
  const purposes = e.visitPurpose ?? []
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(e)}
        className="group grid w-full cursor-pointer grid-cols-[6px_1fr_auto] items-center overflow-hidden rounded-xl border border-hair bg-panel text-left shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-signal-bright hover:shadow-raised active:translate-y-0"
      >
        <span className="flex h-full flex-col">
          {(purposes.length ? purposes : ['']).map((p) => (
            <span key={p} className={'flex-1 ' + (STRIPE[p] ?? 'bg-line')} />
          ))}
        </span>
        <span className="grid min-w-0 gap-1 px-3.5 py-2">
          <b className="font-display text-[16px] leading-tight break-words">
            {e.trailerNumber} · {e.truckName}
          </b>
          <span className="text-[14px] text-muted">
            {[placeOf(e), inYard(e) ? 'loaded, waiting for a driver' : e.truckerNameIn, `here ${duration(now - arrivalMs(e))}`].filter(Boolean).join(' · ')}
          </span>
          <Pills e={e} now={now} />
        </span>
        <span aria-hidden="true" className="px-4 text-muted transition-[color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-signal">
          <Icon name="chevron" size={18} />
        </span>
      </button>
    </li>
  )
}

// Step 1 without a truck picked: search, then the trucks on site (ready ones first) in one box that
// scrolls inside, so the panel keeps its height however many trucks there are.
function TruckList({ entries, now, onPick, onSite, ready }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = entries
    .filter((e) => !e.timeOut)
    .filter((e) => !q || [e.trailerNumber, e.truckName, e.truckerNameIn, e.pickupNumber, e.dockDoor].join(' ').toLowerCase().includes(q))
  // Released longest-ago first; then trucks that can leave, then those that can't, longest here first.
  const rank = (e) => (isReleased(e) && !checkOutBlock(e) ? 0 : checkOutBlock(e) ? 2 : 1)
  const sorted = [...shown].sort(
    (a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.release.releasedAt - b.release.releasedAt : arrivalMs(a) - arrivalMs(b)),
  )

  const submit = (ev) => {
    ev.preventDefault()
    if (sorted.length === 1) onPick(sorted[0])
  }

  return (
    <>
      <form role="search" onSubmit={submit}>
        <label htmlFor="checkout-search" className="sr-only">
          Find a truck on site
        </label>
        <input
          id="checkout-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Trailer, carrier or driver"
          autoComplete="off"
          className={ui.input.replace('min-h-[52px]', 'min-h-12').replace('text-[17px]', 'text-[16px]')}
        />
      </form>
      <p className="-mb-1 text-[14px] font-semibold text-muted">
        {onSite} on site · {ready} ready to leave{q && ` · ${sorted.length} match`}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-hair bg-field p-2 max-sm:max-h-[420px]">
        {sorted.length === 0 ? (
          <p className="flex items-start gap-2 p-2 text-[15px] text-muted">
            <Icon name="info" size={18} className="mt-0.5" />
            {q ? 'No trucks on site match that search. Try part of the trailer # or the carrier.' : 'No trucks on site. Checked-in trucks appear here.'}
          </p>
        ) : (
          <ul className="grid gap-2" aria-label="Trucks on site">
            {sorted.map((e) => (
              <TruckRow key={e.id} e={e} now={now} onPick={onPick} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

// The three steps, as named in the bar on top of the panel, and the answers each one asks for.
const OUT_STEPS = [{ label: 'Check Out' }, { label: 'Driver' }, { label: 'Seal' }]
const OUT_FIELDS = [[], ['truckerNameOut', 'driverPhoneOut'], ['sealConfirmed', 'sealNote', 'outgoingSeals', 'fuelOut']]
const outStepOf = (name) => Math.max(0, OUT_FIELDS.findIndex((names) => names.includes(name)))
const body = 'flex flex-col gap-3 px-5 pt-4 pb-5 sm:h-[384px]'

export default function CheckOutPage({ entries, initial, guard, onPick, onSave, onCancel }) {
  const [now, setNow] = useState(Date.now)
  // Keeps "here 2h 10m" and detention current while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <CompactGate>
      {initial ? (
        <CheckOutForm entry={initial} guard={guard} now={now} onSave={onSave} onCancel={onCancel} />
      ) : (
        <TruckPicker entries={entries} now={now} onPick={onPick} />
      )}
    </CompactGate>
  )
}

// Step 1 before a truck is picked: the search and the trucks on site in one box that scrolls inside.
function TruckPicker({ entries, now, onPick }) {
  const onSite = entries.filter((e) => !e.timeOut)
  const ready = onSite.filter((e) => isReleased(e) && !checkOutBlock(e)).length
  return (
    <div className="grid gap-4">
      <section aria-labelledby="out-step-title" className={ui.card + ' overflow-hidden'}>
        <StepBar label="Check Out steps" steps={OUT_STEPS} step={0} onStep={() => {}} tones={['now', 'todo', 'todo']} disabled />
        <h2 id="out-step-title" className="sr-only">
          Check Out, step 1 of 3: pick the truck leaving
        </h2>
        <div className={body}>
          <TruckList entries={entries} now={now} onPick={onPick} onSite={onSite.length} ready={ready} />
        </div>
        <div className={PANEL_FOOT}>
          <p className="flex items-center gap-1.5 text-[14px] text-muted">
            <Icon name="info" size={16} />
            Tap the truck that's leaving
          </p>
          <button type="button" disabled className={panelBtn(ui.btnPrimary) + ' ml-auto'}>
            Next
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </section>
    </div>
  )
}

function CheckOutForm({ entry, guard, now, onSave, onCancel }) {
  // Re-opening a truck that already left edits its departure rather than checking it out again.
  const editing = Boolean(entry.timeOut)
  // A truck that was at a dock can only leave once its inspection passed and the inspector released it.
  const blocked = editing ? '' : checkOutBlock(entry)
  // The seal the guard should find (from the release or the inspection); asked on a new check-out only.
  const sealToCheck = editing ? '' : expectedSeal(entry)
  const baseline = useRef(null)
  // When the guard opened this check-out, to time it (not shown to the guard; the Overview reports it).
  const openedAt = useRef(Date.now())
  const [form, setForm] = useState(() => (baseline.current = checkOutStart(entry)))
  const [errors, setErrors] = useState({})
  const [confirming, setConfirming] = useState(false)
  // The step on screen (0–2): Back / Next at the foot, Check Out on the last step.
  const [step, setStep] = useState(0)
  const bodyRef = useRef(null)
  const hasDriverIn = filled(entry.truckerNameIn)
  const [driver, setDriver] = useState(() =>
    hasDriverIn && String(form.truckerNameOut ?? '').trim() === entry.truckerNameIn.trim() ? 'same' : 'diff',
  )

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => !(k in patch))))
    setConfirming(false)
  }
  const text = (name) => ({ id: `field-${name}`, name, value: form[name] ?? '', onChange: (e) => set({ [name]: e.target.value }) })
  const err = (name) => errors[name]
  // Check Out's compact sizes, the same as Check In's: 48px boxes, 16px text.
  const input = ui.input.replace('min-h-[52px]', 'min-h-12').replace('text-[17px]', 'text-[16px]')
  const inputCls = (name, extra = '') => input + (err(name) ? ui.inputError : '') + ' ' + extra
  const required = (name) => isRequired(name, form, 'out')
  const reefer = entry.reefer === 'Yes'
  const pickup = (entry.visitPurpose ?? []).includes('Pickup')

  const chooseDriver = (v) => {
    setDriver(v)
    set(
      v === 'same'
        ? { truckerNameOut: entry.truckerNameIn, driverPhoneOut: entry.driverPhone ?? '' }
        : { truckerNameOut: '', driverPhoneOut: '' },
    )
  }

  // The same driver keeps their check-in phone; ask for one when it's a different driver, the check-in
  // has no valid number on file, or the departure has a different one (an older entry saved without it).
  const askPhone = driver === 'diff' || !isPhone(entry.driverPhone) || form.driverPhoneOut !== entry.driverPhone

  // Required answers by step, for the marks in the step bar.
  const vehicle = ['truckerNameOut', 'driverPhoneOut'].filter(required)
  const sealReefer = [
    ...(sealToCheck ? ['sealConfirmed'] : []),
    ...(form.sealConfirmed === 'No' ? ['sealNote'] : []),
    ...['outgoingSeals', 'fuelOut'].filter(required),
  ]
  const left = [vehicle, sealReefer].map((names) => names.filter((n) => !filled(form[n])))
  // The seal step counts as started once the guard answers something there.
  const sealStarted = ['sealConfirmed', 'sealNote', 'fuelOut', 'greenSeal', 'lockLoads', 'padLocks'].some((n) => filled(form[n]))
  const bads = OUT_STEPS.map((_, i) => Object.keys(errors).filter((n) => n !== 'guardOnDuty' && outStepOf(n) === i).length)
  const tones = blocked ? ['error', 'todo', 'todo'] : [
    step === 0 ? 'now' : 'done',
    bads[1] ? 'error' : step === 1 ? 'now' : left[0].length === 0 ? 'done' : 'started',
    bads[2] ? 'error' : step === 2 ? 'now' : left[1].length === 0 && sealStarted ? 'done' : sealStarted ? 'started' : 'todo',
  ]

  const goStep = (i) => {
    if (blocked && i > 0) return
    setStep(i)
    setConfirming(false)
    bodyRef.current?.scrollTo({ top: 0 })
  }

  const submit = (ev) => {
    ev.preventDefault()
    if (blocked) return
    // Enter on Truck or Driver moves on a step; Check Out is only on the last one.
    if (step < 2) return goStep(step + 1)
    const data = { ...form, guardOut: editing ? form.guardOut || guard : guard }
    const errs = validate(data, 'out')
    // The guard's name comes from the header, so its error is shown in the panel's foot.
    if (errs.guardOut) {
      errs.guardOnDuty = errs.guardOut
      delete errs.guardOut
    }
    if (sealToCheck && !form.sealConfirmed) errs.sealConfirmed = 'Required'
    if (sealToCheck && form.sealConfirmed === 'No' && !filled(form.sealNote)) errs.sealNote = 'Describe the seal found on the trailer'
    setErrors(errs)
    const first = Object.keys(errs).find((n) => n !== 'guardOnDuty')
    if (first) {
      // Each missing answer is marked red at its field; open its step and put the cursor there.
      setStep(outStepOf(first))
      requestAnimationFrame(() => {
        const el = document.getElementById(`field-${first}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      })
      return
    }
    if (errs.guardOnDuty) return
    // A new check-out asks once more against accidental taps; editing a departure saves straight away.
    if (editing) onSave(withPhones(data))
    else setConfirming(true)
  }
  const save = () => onSave({ ...withPhones(form), guardOut: guard, checkOutStartedAt: openedAt.current, checkedOutAt: Date.now() })

  const handleRevert = () => {
    if (JSON.stringify(form) !== JSON.stringify(baseline.current) && !window.confirm('Undo your changes to this check-out?')) return
    setForm(checkOutStart(entry))
    setErrors({})
  }

  const fuelIn = FUEL_LABEL[entry.fuelIn] ?? entry.fuelIn

  const by = editing ? form.guardOut || guard : guard
  const det = editing ? null : detentionState(entry, now)
  const facts = [
    (entry.visitPurpose ?? []).join(' + '),
    placeOf(entry),
    `${editing ? 'stayed' : 'here'} ${duration((editing ? departureMs(entry) : now) - arrivalMs(entry))}`,
    entry.pickupNumber && `order ${entry.pickupNumber}`,
    entry.release?.releasedAt && `released ${clockTime(entry.release.releasedAt)} by ${entry.release.releasedBy}`,
  ].filter(Boolean)

  // The panel's foot: Back / Next / Check Out, or the last "are you sure?" before the truck leaves.
  const foot = confirming ? (
    <div className={PANEL_FOOT + ' animate-fade bg-signal-tint'}>
      <span role="alertdialog" aria-labelledby="confirm-checkout-title" className="mr-auto min-w-0 text-[14px] text-ink">
        <b id="confirm-checkout-title" className="block font-display text-[16px] leading-tight">
          Confirm Check Out?
        </b>
        {entry.trailerNumber} · leaving at {timeLabel(form.timeOut)}
      </span>
      <button type="button" onClick={() => setConfirming(false)} className={panelBtn(ui.btn)}>
        Go back
      </button>
      <button type="button" onClick={save} autoFocus className={panelGo(true)}>
        <Icon name="checkOut" size={20} />
        Yes, check out
      </button>
    </div>
  ) : (
    <div className={PANEL_FOOT}>
      {step > 0 && (
        <button type="button" onClick={() => goStep(step - 1)} className={panelBtn(ui.btn)}>
          <Icon name="chevron" size={18} className="rotate-180" />
          Back
        </button>
      )}
      {blocked && (
        <b className="flex min-w-0 items-center gap-1.5 text-[14px] text-danger">
          <Icon name="blocked" size={16} />
          Can't leave yet
        </b>
      )}
      {errors.guardOnDuty && <b className="min-w-0 text-[14px] text-danger">Set the guard on duty at the top of the page</b>}
      {step < 2 ? (
        <button type="button" onClick={() => goStep(step + 1)} disabled={Boolean(blocked)} className={panelBtn(ui.btnPrimary) + ' ml-auto'}>
          Next
          <Icon name="chevron" size={18} />
        </button>
      ) : (
        <button type="submit" className={panelGo(true) + ' ml-auto'}>
          <Icon name={editing ? 'done' : 'checkOut'} size={20} />
          {editing ? 'Save Changes' : 'Check Out'}
        </button>
      )}
    </div>
  )

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {/* One panel, the same height as Check In's: the step bar, the step (scrolling inside when it runs
          longer), and Back / Next / Check Out at the foot. */}
      <section aria-labelledby="out-step-title" className={ui.card + ' overflow-hidden'}>
        <StepBar label="Check Out steps" steps={OUT_STEPS} step={step} onStep={goStep} tones={tones} bads={bads} disabled={Boolean(blocked)} />
        <h2 id="out-step-title" className="sr-only">
          {OUT_STEPS[step].label}, step {step + 1} of 3
        </h2>

        <div ref={bodyRef} className={PANEL_BODY}>
          {/* 1 · The truck leaving: what's already known, with a way back to the list */}
          {step === 0 && (
            <>
              <div className="grid gap-1.5 rounded-xl border border-hair bg-field px-4 py-3">
                <span className="text-[13px] font-semibold tracking-wide text-muted uppercase">{editing ? 'Checked out' : 'Truck leaving'}</span>
                <b className="font-display text-[20px] leading-tight break-words">
                  {entry.trailerNumber} · {entry.truckName}
                </b>
                <span className="text-[15px] text-muted">{facts.join(' · ')}</span>
                {(entry.truckerNameIn || det || (!blocked && isReleased(entry))) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {!blocked && isReleased(entry) && !editing && (
                      <span className={ui.tag + ' bg-ok-soft text-ok'}>
                        <Icon name="done" size={14} />
                        Ready to leave
                      </span>
                    )}
                    {det && (
                      <span className={ui.tag + ' ' + DETENTION_TAG[det.level]}>
                        <Icon name={DETENTION_ICON[det.level]} size={14} />
                        {det.text}
                      </span>
                    )}
                    {entry.truckerNameIn && <span className="text-[14px] text-muted">Came in with {entry.truckerNameIn}</span>}
                  </span>
                )}
              </div>
              {entry.release?.note && (
                <Note tone="warn" icon="info">
                  Gate note from the inspector: {entry.release.note}
                </Note>
              )}
              {blocked && <Note icon="blocked">Can't leave yet: {blocked} Ask the driver to wait and tell Shipping.</Note>}
              <span className="-ml-3">
                <LinkButton icon={editing ? 'close' : 'search'} onClick={onCancel}>
                  {editing ? 'Back to the list' : 'Pick a different truck'}
                </LinkButton>
              </span>
            </>
          )}

          {/* 2 · The driver going out */}
          {step === 1 && (
            <>
              {hasDriverIn && (
                <FieldBox name="driverChoice" label="Who is driving out?" group>
                  <Seg
                    name="driverChoice"
                    value={driver}
                    onChange={chooseDriver}
                    options={[
                      { value: 'same', label: `Same driver · ${entry.truckerNameIn}` },
                      { value: 'diff', label: 'Different driver' },
                    ]}
                  />
                </FieldBox>
              )}
              {(driver === 'diff' || askPhone) && (
                <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                  {askPhone && (
                    <FieldBox name="driverPhoneOut" label="Driver phone" required={required('driverPhoneOut')} error={err('driverPhoneOut')}>
                      <input
                        {...text('driverPhoneOut')}
                        {...PHONE_PROPS}
                        onChange={(e) => set({ driverPhoneOut: phoneInput(e.target.value) })}
                        className={inputCls('driverPhoneOut', 'font-display font-semibold tracking-wide')}
                      />
                    </FieldBox>
                  )}
                  {driver === 'diff' && (
                    <FieldBox name="truckerNameOut" label="Driver name going out" required={required('truckerNameOut')} error={err('truckerNameOut')}>
                      <input {...text('truckerNameOut')} className={inputCls('truckerNameOut')} />
                    </FieldBox>
                  )}
                </div>
              )}
              {driver === 'same' && !askPhone && (
                <Note tone="ok" icon="done">
                  {entry.truckerNameIn} is taking it out · {entry.driverPhone}
                </Note>
              )}
            </>
          )}

          {/* 3 · Seal (and reefer), then a short recap */}
          {step === 2 && (
            <>
              {sealToCheck && (
                <FieldBox
                  name="sealConfirmed"
                  label={
                    <>
                      Seal matches <b className="text-[16px] text-ink">{sealToCheck}</b>?
                    </>
                  }
                  required
                  group
                  error={err('sealConfirmed')}
                >
                  <Seg
                    name="sealConfirmed"
                    value={form.sealConfirmed}
                    onChange={(sealConfirmed) => set({ sealConfirmed })}
                    error={err('sealConfirmed')}
                    options={[{ value: 'Yes' }, { value: 'No', danger: true }]}
                  />
                </FieldBox>
              )}
              {form.sealConfirmed === 'No' && (
                <>
                  <FieldBox name="sealNote" label="Seal found on the trailer" required error={err('sealNote')}>
                    <input {...text('sealNote')} placeholder="Number on the seal, or what's wrong" className={inputCls('sealNote')} />
                  </FieldBox>
                  <Note>Seal doesn't match: tell Shipping before the truck leaves</Note>
                </>
              )}
              {(pickup || reefer) && (
                <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                  {pickup && (
                    <FieldBox
                      name="outgoingSeals"
                      label="Outgoing seal #"
                      required={required('outgoingSeals')}
                      error={err('outgoingSeals')}
                      hint={entry.release?.seal && form.outgoingSeals === entry.release.seal ? 'From the release' : undefined}
                    >
                      <input {...text('outgoingSeals')} inputMode="numeric" autoComplete="off" className={inputCls('outgoingSeals', 'font-display font-semibold tracking-wide')} />
                    </FieldBox>
                  )}
                  {reefer && (
                    <FieldBox
                      name="fuelOut"
                      label="Reefer fuel going out"
                      required
                      group
                      error={err('fuelOut')}
                      after={fuelIn && <span className="text-[13px] text-muted">came in at {fuelIn}</span>}
                      className={pickup ? '' : 'sm:col-span-2'}
                    >
                      <Seg name="fuelOut" value={form.fuelOut} onChange={(fuelOut) => set({ fuelOut })} error={err('fuelOut')} options={FUEL} />
                    </FieldBox>
                  )}
                </div>
              )}
              {!sealToCheck && !pickup && !reefer && <p className="text-[15px] text-muted">No seal was recorded and it's not a reefer: nothing to check here.</p>}
              <More
                label={pickup ? 'green seal, lock loads, pad locks' : 'outgoing seal, green seal, lock loads, pad locks'}
                open={filled(form.greenSeal) || filled(form.lockLoads) || filled(form.padLocks) || (!pickup && filled(form.outgoingSeals))}
              >
                {!pickup && (
                  <FieldBox name="outgoingSeals" label="Outgoing seal #">
                    <input {...text('outgoingSeals')} inputMode="numeric" className={inputCls('outgoingSeals')} />
                  </FieldBox>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <FieldBox name="greenSeal" label="Green seal #">
                    <input {...text('greenSeal')} inputMode="numeric" className={inputCls('greenSeal')} />
                  </FieldBox>
                  <FieldBox name="lockLoads" label="Lock loads">
                    <input {...text('lockLoads')} className={inputCls('lockLoads')} />
                  </FieldBox>
                  <FieldBox name="padLocks" label="Pad locks">
                    <input {...text('padLocks')} className={inputCls('padLocks')} />
                  </FieldBox>
                </div>
              </More>
              <Recap
                lines={[
                  [
                    <b key="t">{entry.trailerNumber}</b>,
                    entry.truckName,
                    form.truckerNameOut && `driver ${form.truckerNameOut}${driver === 'same' ? ' (same)' : ''}`,
                    `leaving at ${timeLabel(form.timeOut)}`,
                  ],
                  [
                    sealToCheck &&
                      (form.sealConfirmed === 'Yes' ? (
                        `Seal matches ${sealToCheck}`
                      ) : form.sealConfirmed === 'No' ? (
                        <b key="s" className="text-danger">
                          Seal does NOT match
                        </b>
                      ) : (
                        'Seal not checked yet'
                      )),
                    form.outgoingSeals && `out seal ${form.outgoingSeals}`,
                    reefer && `fuel ${FUEL_LABEL[form.fuelOut] ?? (form.fuelOut || '?')}${fuelIn ? ` (in ${fuelIn})` : ''}`,
                  ],
                ]}
              />
            </>
          )}
        </div>
        {foot}
      </section>

      <div className="no-print flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[15px] text-muted">
        <span className="mr-2 flex items-center gap-1.5">
          <Icon name="people" size={16} />
          Checked out by <b className={by ? 'text-ink' : 'text-danger'}>{by || 'no guard set (top of the page)'}</b>
        </span>
        {editing && (
          <LinkButton icon="undo" onClick={handleRevert}>
            Revert
          </LinkButton>
        )}
        <LinkButton icon="print" onClick={() => window.print()}>
          Print
        </LinkButton>
      </div>
    </form>
  )
}

import { useEffect, useMemo, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import { clockTime, dayKey } from '../time'
import { LOAD_CHECKS, TRAILER_CHECKS } from '../inspectionChecks'
import { BottomBar, Chips, More, Note, Stepper, goButton } from './gate/parts'

// The poultry loading inspection, in two short checklists at the moment each is done:
// - Before loading (Loading section): the empty trailer, reefer and pre-cool. Saved on `entry.trailerCheck`;
//   it has to pass before "Loading started".
// - After loading (Inspection section): product temperatures, pallets, load checks, then Pass / Fail.
//   Saved on `entry.loadingInspection` with the trailer answers merged in, so Shipping, the Gate, the
//   Entry Log export and the Overview read one complete inspection as before.
// Known values (times, seal, set point, the inspector on duty) are filled in, not asked. Every truck's
// answers are kept on this device as a draft until saved, so walking away loses nothing.

// Typical cold-chain limits for frozen product; confirm them against the plant's HACCP plan.
export const LIMIT = { product: 0, precool: 10 }

const PRODUCT_TEMPS = [
  { name: 'tempFront', label: 'Front' },
  { name: 'tempMiddle', label: 'Middle' },
  { name: 'tempRear', label: 'Rear' },
]

const filled = (v) => String(v ?? '').trim() !== ''
const pad = (n) => String(n).padStart(2, '0')
const hhmm = (ms) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Problems that fail the trailer check / the load, as readable lines.
export function trailerIssues(f) {
  const issues = TRAILER_CHECKS.filter((c) => f[c.name] === 'No').map((c) => `${c.label}: No`)
  if (f.reeferRunning === 'No') issues.push('Reefer not running in continuous mode')
  if (filled(f.precoolTemp) && Number(f.precoolTemp) > LIMIT.precool) issues.push(`Trailer pre-cool ${f.precoolTemp}°F is above ${LIMIT.precool}°F`)
  return issues
}
export function loadIssues(f) {
  const issues = LOAD_CHECKS.filter((c) => f[c.name] === 'No').map((c) => `${c.label}: No`)
  for (const t of PRODUCT_TEMPS) {
    const v = f[t.name]
    if (filled(v) && Number(v) > LIMIT.product) issues.push(`Product temp ${t.label.toLowerCase()} ${v}°F is above ${LIMIT.product}°F`)
  }
  return issues
}
export const inspectionIssues = (f) => [...trailerIssues(f), ...loadIssues(f)]

// Drafts per truck and checklist, kept in this browser until saved.
const DRAFTS = 'inspection-drafts'
const readDrafts = () => {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS)) ?? {}
  } catch {
    return {}
  }
}
const writeDraft = (key, form) => {
  try {
    const all = readDrafts()
    if (form) all[key] = form
    else delete all[key]
    localStorage.setItem(DRAFTS, JSON.stringify(all))
  } catch {
    // A full storage only loses the draft, never a saved inspection.
  }
}
export const hasDraft = (id, part) => !!readDrafts()[`${id}:${part}`]

// A numbered step inside a checklist: grey number, green tick once its answers are in.
const SCROLL_MT = 'scroll-mt-[calc(var(--header-h,114px)+24px)]'
function Step({ n, id, title, done, hint, action, children }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className={'grid grid-cols-[36px_minmax(0,1fr)] gap-x-3.5 border-b border-hair py-5 last:border-b-0 ' + SCROLL_MT}>
      <span
        className={
          'grid size-8 place-items-center rounded-full text-[15px] font-bold transition-colors duration-200 ' + (done ? 'bg-ok text-signal-ink' : 'bg-signal-soft text-ink')
        }
        aria-hidden="true"
      >
        {done ? <Icon name="done" size={18} /> : n}
      </span>
      <div className="grid min-w-0 gap-3">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <h4 id={`${id}-title`} className="font-display text-[17px] leading-tight font-bold">
            {title}
            {done && <span className="sr-only"> (done)</span>}
          </h4>
          {action}
        </div>
        {hint && <p className="-mt-2 text-[14px] text-muted">{hint}</p>}
        {children}
      </div>
    </section>
  )
}

// Yes / No for one check, in a row; the row turns red on No.
function CheckRow({ name, label, value, onChange }) {
  return (
    <div
      className={
        'flex min-h-[60px] items-center justify-between gap-3 rounded-xl border py-2 pr-2 pl-4 transition-colors duration-150 ' +
        (value === 'No' ? 'border-transparent bg-danger-soft' : value === 'Yes' ? 'border-hair bg-ok-soft/50' : 'border-hair bg-field')
      }
    >
      <span id={`field-${name}-label`} className="font-medium">
        {label}
      </span>
      <span role="group" aria-labelledby={`field-${name}-label`} className="flex shrink-0 gap-1 rounded-[11px] border border-line bg-panel p-[3px]">
        {['Yes', 'No'].map((v) => (
          <button
            key={v}
            id={v === 'Yes' ? `field-${name}` : undefined}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={
              'h-10 w-[60px] cursor-pointer rounded-lg text-[15px] font-bold transition-colors duration-150 ' +
              (value === v ? (v === 'No' ? 'bg-danger text-signal-ink' : 'bg-signal text-signal-ink') : 'text-muted hover:text-ink')
            }
          >
            {v}
          </button>
        ))}
      </span>
    </div>
  )
}

function Checks({ list, form, set }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {list.map((c) => (
        <CheckRow key={c.name} name={c.name} label={c.label} value={form[c.name]} onChange={(v) => set(c.name, v)} />
      ))}
    </div>
  )
}

// "All good (n)": answers Yes to every unanswered check in the group; a No already given stays.
function AllGood({ list, form, setMany }) {
  const open = list.filter((c) => !form[c.name]).map((c) => c.name)
  return (
    <button type="button" disabled={!open.length} onClick={() => setMany(Object.fromEntries(open.map((n) => [n, 'Yes'])))} className={ui.btnSmallPrimary}>
      <Icon name="done" size={18} />
      {open.length ? `All good (${open.length})` : 'All answered'}
    </button>
  )
}

// A temperature or count box: label, − value +, and a line under it (the limit, or the problem in red).
function Measure({ name, label, value, onChange, start, limit, hint, step = 1, min }) {
  const bad = limit != null && filled(value) && Number(value) > limit
  return (
    <div className={'grid gap-2 rounded-xl border p-3 transition-colors duration-150 ' + (bad ? 'border-transparent bg-danger-soft' : 'border-hair bg-field')}>
      <span className="text-[14px] font-semibold">{label}</span>
      <Stepper name={name} label={label} value={value} onChange={onChange} start={start} step={step} min={min} />
      <span className={'text-[13px] ' + (bad ? 'font-bold text-danger' : 'text-muted')}>{bad ? `Above the ${limit}°F limit` : hint}</span>
    </div>
  )
}

function Known({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 py-5 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-signal-tint px-3.5 py-2.5">
          <span className="block text-[12px] font-semibold text-muted">{label}</span>
          <b className="text-[15px]">{value || '—'}</b>
        </div>
      ))}
    </div>
  )
}

// Shared by both checklists: the sheet around the steps, the draft, and the bottom bar.
function useChecklist(entry, part, initial) {
  const key = `${entry.id}:${part}`
  const [form, setForm] = useState(() => ({ ...initial, ...(readDrafts()[key] ?? {}) }))
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (touched) writeDraft(key, form)
  }, [key, form, touched])
  const set = (name, value) => {
    setTouched(true)
    setForm((f) => ({ ...f, [name]: value }))
  }
  const setMany = (patch) => {
    setTouched(true)
    setForm((f) => ({ ...f, ...patch }))
  }
  return { form, set, setMany, clearDraft: () => writeDraft(key, null) }
}

function Sheet({ title, entry, onClose, children }) {
  return (
    <div className="mt-5 animate-pop overflow-hidden rounded-2xl border border-hair bg-panel shadow-raised">
      <div className="on-chrome flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-[var(--p-hero-2)] to-[var(--p-hero)] px-5 py-4 text-white">
        <div className="min-w-0">
          <h3 className="font-display text-[20px] leading-tight font-bold">
            {title} · Dock {entry.dockDoor}
          </h3>
          <p className="text-[14px] text-rail-text">
            {[entry.trailerNumber && `Trailer ${entry.trailerNumber}`, entry.truckName, entry.pickupNumber && `Order No ${entry.pickupNumber}`, entry.customerPickupFor && `for ${entry.customerPickupFor}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-white/20 bg-white/10 px-3.5 font-semibold text-white transition-colors duration-150 hover:bg-white/20">
          <Icon name="close" size={18} />
          Close · keeps a draft
        </button>
      </div>
      {children}
    </div>
  )
}

// What the bottom bar says: what's missing (each jumps to its step), or the result once complete.
function Bar({ missing, issues, ready, label, okText, onSave }) {
  const fail = issues.length > 0
  const message = ready ? (
    <span className={'flex items-start gap-2 ' + (fail ? 'text-danger' : 'text-ok')}>
      <Icon name={fail ? 'failed' : 'done'} className="mt-0.5" />
      <span>
        <b>{fail ? `${issues.length} problem${issues.length > 1 ? 's' : ''}` : 'All checks passed'}</b>
        <span className="block text-[14px] text-muted">{fail ? issues.join(' · ') : okText}</span>
      </span>
    </span>
  ) : undefined
  return (
    <BottomBar missing={missing} message={message}>
      {!ready && fail && (
        <span className="basis-full text-[14px] font-semibold text-danger sm:order-first sm:basis-auto">
          <Icon name="failed" size={16} className="mr-1 inline align-[-3px]" />
          {issues.join(' · ')}
        </span>
      )}
      <button type="button" disabled={!ready} onClick={onSave} className={goButton(ready && !fail) + ' max-sm:w-full'}>
        <Icon name={fail ? 'inspect' : 'inspected'} size={24} />
        {label}
      </button>
    </BottomBar>
  )
}

// Technicians who checked or inspected trailers on this device, most recent first.
export function recentTechnicians(entries = [], max = 6) {
  const last = new Map()
  for (const e of entries) {
    for (const c of [e.trailerCheck, e.loadingInspection]) {
      const n = String(c?.technician ?? '').trim()
      if (n && (c.savedAt ?? 0) >= (last.get(n) ?? -1)) last.set(n, c.savedAt ?? 0)
    }
  }
  return [...last].sort((a, b) => b[1] - a[1]).slice(0, max).map(([n]) => n)
}

// Who did the work on the trailer (required on both checklists): recent names to tap, or type one.
function TechnicianStep({ n, form, set, recent, hint }) {
  return (
    <Step n={n} id="step-tech" title="Technician" done={filled(form.technician)} hint={hint}>
      <Chips label="Recent technicians" items={recent} value={form.technician} onPick={(v) => set('technician', v)} />
      <input
        id="field-technician"
        value={form.technician ?? ''}
        onChange={(e) => set('technician', e.target.value)}
        aria-labelledby="step-tech-title"
        placeholder={recent.length ? 'Or type a name' : 'Technician name'}
        autoComplete="off"
        className={ui.input + ' max-w-[420px]'}
      />
    </Step>
  )
}

const trailerSteps = ({ form, set, setMany, entry, n0 = 1 }) => {
  const checksDone = TRAILER_CHECKS.every((c) => form[c.name])
  const reeferDone = filled(form.precoolTemp) && filled(form.setPoint) && !!form.reeferRunning
  const missing = [...(checksDone ? [] : [['Trailer condition', 'step-trailer']]), ...(reeferDone ? [] : [['Reefer and pre-cool', 'step-reefer']])]
  const steps = (
    <>
      <Step
        n={n0}
        id="step-trailer"
        title="Trailer condition"
        done={checksDone}
        hint="Look inside the empty trailer. Tap All good, then No on anything that isn't."
        action={<AllGood list={TRAILER_CHECKS} form={form} setMany={setMany} />}
      >
        <Checks list={TRAILER_CHECKS} form={form} set={set} />
      </Step>
      <Step n={n0 + 1} id="step-reefer" title="Reefer and pre-cool" done={reeferDone} hint={`Frozen poultry: trailer pre-cooled to ${LIMIT.precool}°F or below, reefer on continuous.`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Measure name="precoolTemp" label="Trailer pre-cool °F" value={form.precoolTemp} onChange={(v) => set('precoolTemp', v)} start={-5} limit={LIMIT.precool} hint={`Limit ${LIMIT.precool}°F`} />
          <Measure name="setPoint" label="Reefer set point °F" value={form.setPoint} onChange={(v) => set('setPoint', v)} start={-10} hint={entry.tempSet ? 'From check-in' : 'As shown on the reefer'} />
          <div className={'grid content-start gap-2 rounded-xl border p-3 ' + (form.reeferRunning === 'No' ? 'border-transparent bg-danger-soft' : 'border-hair bg-field')}>
            <span id="field-reeferRunning-label" className="text-[14px] font-semibold">
              Reefer on continuous
            </span>
            <span role="group" aria-labelledby="field-reeferRunning-label" className="flex gap-2">
              {['Yes', 'No'].map((v) => (
                <button
                  key={v}
                  id={v === 'Yes' ? 'field-reeferRunning' : undefined}
                  type="button"
                  aria-pressed={form.reeferRunning === v}
                  onClick={() => set('reeferRunning', v)}
                  className={
                    'min-h-[58px] flex-1 cursor-pointer rounded-xl border-[1.5px] font-display text-[17px] font-bold transition-colors duration-150 ' +
                    (form.reeferRunning === v
                      ? v === 'No'
                        ? 'border-danger bg-danger text-signal-ink'
                        : 'border-signal bg-signal text-signal-ink'
                      : 'border-line bg-panel text-ink hover:border-signal-bright')
                  }
                >
                  {v}
                </button>
              ))}
            </span>
            <span className={'text-[13px] ' + (form.reeferRunning === 'No' ? 'font-bold text-danger' : 'text-muted')}>
              {form.reeferRunning === 'No' ? 'Must run on continuous' : 'Must be Yes'}
            </span>
          </div>
        </div>
      </Step>
    </>
  )
  return { steps, missing, issues: trailerIssues(form) }
}

const trailerBlank = (entry) => ({
  ...Object.fromEntries(TRAILER_CHECKS.map((c) => [c.name, ''])),
  precoolTemp: '',
  setPoint: entry.tempSet || '',
  reeferRunning: '',
  technician: '',
})

// Before loading: the technician, then the empty trailer. Pass lets the dock start loading; Fail tells Shipping.
export function TrailerCheckSheet({ entry, entries, inspector, onSave, onClose }) {
  const { form, set, setMany, clearDraft } = useChecklist(entry, 'trailer', trailerBlank(entry))
  const recent = useMemo(() => recentTechnicians(entries), [entries])
  const { steps, missing, issues } = trailerSteps({ form, set, setMany, entry, n0: 2 })
  const allMissing = [
    ...(filled(form.technician) ? [] : [['Technician', 'step-tech']]),
    ...missing,
    ...(inspector ? [] : [['Inspector on duty', 'inspector-on-duty']]),
  ]
  const ready = allMissing.length === 0
  const save = () => {
    clearDraft()
    onSave(entry.id, { ...form, technician: form.technician.trim(), inspector, result: issues.length ? 'Fail' : 'Pass', issues, savedAt: Date.now() })
  }
  return (
    <Sheet title="Before loading" entry={entry} onClose={onClose}>
      <div className="max-w-[960px] px-5">
        <TechnicianStep n={1} form={form} set={set} recent={recent} hint="Who is checking this trailer and loading it." />
        {steps}
      </div>
      <div className="px-3 pb-3">
        <Bar
          missing={allMissing}
          issues={issues}
          ready={ready}
          label={issues.length ? 'Save · trailer not OK' : 'Save · ready to load'}
          okText="Next: press Loading started on the dock card."
          onSave={save}
        />
      </div>
    </Sheet>
  )
}

// After loading: product temperatures, pallets and load checks, then Pass / Fail. A visit loaded before
// the trailer check existed answers the trailer steps here too.
export function LoadCheckSheet({ entry, entries, inspector, onSave, onClose }) {
  const tc = entry.trailerCheck
  const prior = entry.loadingInspection
  const initial = useMemo(
    () => ({
      ...(tc ? {} : trailerBlank(entry)),
      ...Object.fromEntries(LOAD_CHECKS.map((c) => [c.name, ''])),
      ...Object.fromEntries(PRODUCT_TEMPS.map((t) => [t.name, ''])),
      palletsLoaded: prior?.palletsLoaded ?? '',
      sealApplied: prior?.sealApplied || entry.outgoingSeals || '',
      caseCount: prior?.caseCount ?? '',
      totalWeight: prior?.totalWeight ?? '',
      // The technician from Before loading carries over; change it if someone else loaded the trailer.
      technician: prior?.technician || tc?.technician || '',
      notes: prior?.notes ?? '',
      correctiveAction: '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry.id],
  )
  const { form, set, setMany, clearDraft } = useChecklist(entry, 'load', initial)
  const recent = useMemo(() => recentTechnicians(entries), [entries])
  const techDone = filled(form.technician)
  const trailer = tc ? null : trailerSteps({ form, set, setMany, entry, n0: 2 })
  const n0 = trailer ? 4 : 2
  const tempsDone = PRODUCT_TEMPS.every((t) => filled(form[t.name]))
  const palletsDone = filled(form.palletsLoaded)
  const checksDone = LOAD_CHECKS.every((c) => form[c.name])
  const sealDone = filled(form.sealApplied)
  const issues = [...(trailer?.issues ?? []), ...loadIssues(form)]
  const fail = issues.length > 0
  const fixDone = filled(form.correctiveAction)
  const missing = [
    ...(techDone ? [] : [['Technician', 'step-tech']]),
    ...(trailer?.missing ?? []),
    ...(tempsDone ? [] : [['Product temperatures', 'step-temps']]),
    ...(palletsDone ? [] : [['Pallets', 'step-pallets']]),
    ...(checksDone ? [] : [['Load checks', 'step-load']]),
    ...(sealDone ? [] : [['Seal #', 'step-seal']]),
    ...(fail && !fixDone ? [['What was done about it', 'step-fix']] : []),
    ...(inspector ? [] : [['Inspector on duty', 'inspector-on-duty']]),
  ]
  const ready = missing.length === 0
  const recheck = prior?.result === 'Fail'

  const save = () => {
    const now = Date.now()
    clearDraft()
    // One complete inspection: the trailer answers, this checklist, and the times the app recorded.
    onSave(entry.id, {
      ...(tc ? Object.fromEntries(Object.entries(tc).filter(([k]) => !['result', 'issues', 'savedAt', 'inspector'].includes(k))) : {}),
      ...form,
      technician: form.technician.trim(),
      inspectionDate: dayKey(new Date(now)),
      inspectionTime: hhmm(now),
      loadStart: entry.loadStartedAt ? hhmm(entry.loadStartedAt) : '',
      loadFinish: entry.loadFinishedAt ? hhmm(entry.loadFinishedAt) : '',
      inspector,
      trailerCheckedAt: tc?.savedAt,
      result: fail ? 'Fail' : 'Pass',
      issues,
      inspectedAt: now,
      savedAt: now,
    })
  }

  return (
    <Sheet title={recheck ? 'Re-check load' : 'Inspect load'} entry={entry} onClose={onClose}>
      <div className="max-w-[960px] px-5">
        <Known
          items={[
            ['Trailer check', tc ? `${tc.result === 'Pass' ? 'Passed' : 'Failed'} · ${clockTime(tc.savedAt)}` : 'Not done before loading'],
            ['Loaded', entry.loadStartedAt && entry.loadFinishedAt ? `${clockTime(entry.loadStartedAt)} – ${clockTime(entry.loadFinishedAt)}` : '—'],
            ['Seal # (from check-in)', entry.outgoingSeals],
            ['Signed by', inspector || 'Set inspector on duty'],
          ]}
        />
        <p className="-mt-2 text-[13px] text-muted">Filled in for you. The inspection time is recorded when you save.</p>
        {recheck && (
          <div className="pt-4">
            <Note tone="warn">Failed last time: {(prior.issues ?? []).join(' · ') || 'see the saved inspection'}. Check it again.</Note>
          </div>
        )}
        {trailer && (
          <div className="pt-4">
            <Note tone="warn" icon="info">
              This trailer wasn't checked before loading, so its trailer checks are asked here.
            </Note>
          </div>
        )}
        <TechnicianStep
          n={1}
          form={form}
          set={set}
          recent={recent}
          hint={tc?.technician ? 'From the check before loading. Change it if someone else loaded the trailer.' : 'Who loaded this trailer.'}
        />
        {trailer?.steps}
        <Step n={n0} id="step-temps" title="Product temperatures" done={tempsDone} hint={`Probe front, middle and rear. Frozen product: ${LIMIT.product}°F or below.`}>
          <div className="grid gap-3 sm:grid-cols-3">
            {PRODUCT_TEMPS.map((t) => (
              <Measure key={t.name} name={t.name} label={`${t.label} °F`} value={form[t.name]} onChange={(v) => set(t.name, v)} start={-5} limit={LIMIT.product} hint={`Limit ${LIMIT.product}°F`} />
            ))}
          </div>
        </Step>
        <Step n={n0 + 1} id="step-pallets" title="Pallets loaded" done={palletsDone}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Measure name="palletsLoaded" label="Pallets on the trailer" value={form.palletsLoaded} onChange={(v) => set('palletsLoaded', v)} start={22} min={0} hint="Count them as you close up" />
          </div>
        </Step>
        <Step n={n0 + 2} id="step-load" title="Load checks" done={checksDone} action={<AllGood list={LOAD_CHECKS} form={form} setMany={setMany} />}>
          <Checks list={LOAD_CHECKS} form={form} set={set} />
        </Step>
        <Step n={n0 + 3} id="step-seal" title="Seal applied" done={sealDone} hint={entry.outgoingSeals ? 'From check-in. Change it only if a different seal went on.' : 'The seal number you put on the doors.'}>
          <input
            id="field-sealApplied"
            value={form.sealApplied}
            onChange={(e) => set('sealApplied', e.target.value)}
            aria-labelledby="step-seal-title"
            autoComplete="off"
            className={ui.input + ' max-w-[320px]'}
          />
        </Step>
        {fail && (
          <Step n={n0 + 4} id="step-fix" title="What was done about it" done={fixDone} hint="Needed because the load failed. Shipping sees this note.">
            <textarea
              id="field-correctiveAction"
              value={form.correctiveAction}
              onChange={(e) => set('correctiveAction', e.target.value)}
              aria-labelledby="step-fix-title"
              rows={3}
              placeholder="e.g. Pulled the rear pallets back to the freezer and re-probed"
              className={ui.input + ' min-h-[96px] text-[16px]'}
            />
          </Step>
        )}
        <div className="pb-5">
          <More label="case count, weight, notes" open={[form.caseCount, form.totalWeight, form.notes].some(filled)}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['caseCount', 'Case count', 'numeric'],
                ['totalWeight', 'Total weight (lbs)', 'numeric'],
              ].map(([name, label, mode]) => (
                <label key={name} className="grid gap-1.5">
                  <span className={ui.label}>{label}</span>
                  <input id={`field-${name}`} value={form[name]} inputMode={mode} onChange={(e) => set(name, e.target.value)} className={ui.input} />
                </label>
              ))}
              <label className="grid gap-1.5 sm:col-span-2">
                <span className={ui.label}>Notes</span>
                <textarea id="field-notes" value={form.notes} rows={2} onChange={(e) => set('notes', e.target.value)} className={ui.input + ' text-[16px]'} />
              </label>
            </div>
          </More>
        </div>
      </div>
      <div className="px-3 pb-3">
        <Bar missing={missing} issues={issues} ready={ready} label={fail ? 'Save · Fail' : 'Save · Pass'} okText="Next: Release to gate on the dock card." onSave={save} />
      </div>
    </Sheet>
  )
}

// A saved, passed inspection at a glance (View on a passed truck).
export function InspectionSummary({ entry, onClose, onRecheck }) {
  const i = entry.loadingInspection
  const temps = PRODUCT_TEMPS.map((t) => (filled(i[t.name]) ? `${i[t.name]}°F` : '—')).join(' / ')
  return (
    <Sheet title="Inspection" entry={entry} onClose={onClose}>
      <div className="max-w-[960px] px-5 pb-5">
        <Known
          items={[
            ['Result', i.result === 'Pass' ? 'Passed' : 'Failed'],
            ['Trailer check', entry.trailerCheck ? clockTime(entry.trailerCheck.savedAt) : '—'],
            ['Product temps', temps],
            ['Pallets', i.palletsLoaded],
            ['Pre-cool', filled(i.precoolTemp) ? `${i.precoolTemp}°F` : '—'],
            ['Seal', i.sealApplied],
            ['Inspected by', i.inspector],
            ['Saved', clockTime(i.savedAt ?? i.inspectedAt)],
          ]}
        />
        <button type="button" onClick={onRecheck} className={ui.btnSmall}>
          <Icon name="inspect" size={18} />
          Inspect again
        </button>
        <p className="mt-2 text-[13px] text-muted">Inspecting again replaces this inspection, and the truck has to be released again.</p>
      </div>
    </Sheet>
  )
}

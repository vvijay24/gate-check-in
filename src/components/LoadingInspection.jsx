import { useEffect, useMemo, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'
import { clockTime, dayKey } from '../time'
import { LOAD_CHECKS, TRAILER_CHECKS } from '../inspectionChecks'
import { Chips, More, Note, Stepper, goButton } from './gate/parts'
import { palletLine, productLine } from '../loadSheet'

// The poultry loading inspection, in two short checklists at the moment each is done:
// - Before loading (Loading section): the empty trailer, reefer and pre-cool. Saved on `entry.trailerCheck`;
//   it has to pass before "Loading started".
// - After loading (Inspection section): product temperatures, pallets, load checks, then Pass / Fail.
//   Saved on `entry.loadingInspection` with the trailer answers merged in, so Shipping, the Gate, the
//   Entry Log export and the Overview read one complete inspection as before.
// Each checklist fills the screen and goes one page at a time (Paged), ending on "Check it over".
// Known values (times, seal, set point, the person signed in) are filled in, not asked. Every truck's
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
              'h-11 w-[60px] cursor-pointer rounded-lg text-[15px] font-bold transition-colors duration-150 ' +
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
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-signal-tint px-3.5 py-2.5">
          <span className="block text-[12px] font-semibold text-muted">{label}</span>
          <b className="text-[15px]">{value || '—'}</b>
        </div>
      ))}
    </div>
  )
}

// "Check it over": every answer in a grid, problems in red. `items`: [label, value, bad].
function Review({ items }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value, bad]) => (
        <div key={label} className={'flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5 ' + (bad ? 'bg-danger-soft' : 'bg-field')}>
          <dt className="text-[14px] text-muted">{label}</dt>
          <dd className={'text-right text-[15px] font-bold ' + (bad ? 'text-danger' : filled(value) ? '' : 'text-muted')}>{filled(value) ? value : 'Not answered'}</dd>
        </div>
      ))}
    </dl>
  )
}

// Shared by both checklists: the form and its draft.
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

// The checklist's frame: fills the page while open, with the truck in the header and Close.
function Sheet({ title, entry, onClose, children }) {
  return (
    <div id="dock-sheet" className="animate-pop scroll-mt-[calc(var(--header-h,114px)+16px)] rounded-2xl border border-hair bg-panel shadow-raised">
      <div className="on-chrome flex flex-wrap items-center justify-between gap-3 rounded-t-2xl bg-gradient-to-br from-[var(--p-hero-2)] to-[var(--p-hero)] px-5 py-4 text-white">
        <div className="min-w-0">
          <h2 className="font-display text-[22px] leading-tight font-bold">
            {title}, Dock {entry.dockDoor}
          </h2>
          <p className="text-[14px] text-rail-text">
            {[entry.trailerNumber && `Trailer ${entry.trailerNumber}`, entry.truckName, entry.pickupNumber && `Order no. ${entry.pickupNumber}`, entry.customerPickupFor && `for ${entry.customerPickupFor}`]
              .filter(Boolean)
              .join(', ')}
          </p>
          <p className="text-[14px] font-semibold text-white">
            {palletLine(entry)}
            {productLine(entry) && ` · ${productLine(entry)}`}
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

// One page at a time. `pages`: [{ id, title, done, hint, action, body }]. Step pills along the top (a
// number, or a green tick when done; tap one to jump), the page, and a sticky bar: Back, "Page 2 of 5",
// Next. On the last page the bar shows what's still needed (each jumps to its page) or the result and Save.
function Paged({ pages, missing, issues, saveLabel, okText, onSave }) {
  const [at, setAt] = useState(0)
  const top = useRef(null)
  const page = pages[Math.min(at, pages.length - 1)]
  const last = at === pages.length - 1
  const go = (i) => {
    setAt(i)
    requestAnimationFrame(() => {
      const el = top.current
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  const jump = (id) => go(Math.max(0, pages.findIndex((p) => p.id === id)))
  const ready = missing.length === 0
  const fail = issues.length > 0
  const big = 'min-h-[60px] text-[18px]'
  return (
    <div ref={top} className="scroll-mt-[calc(var(--header-h,114px)+16px)]">
      <nav aria-label="Checklist pages" className="flex gap-2 overflow-x-auto border-b border-hair px-5 py-3">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-current={i === at ? 'step' : undefined}
            onClick={() => go(i)}
            className={
              'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 pr-4 text-[14px] font-semibold transition-colors duration-150 ' +
              (i === at ? 'border-signal bg-signal text-signal-ink' : 'border-line bg-panel text-ink hover:border-signal-bright')
            }
          >
            <span className={'grid size-6 place-items-center rounded-full text-[13px] font-bold ' + (p.done ? 'bg-ok text-white' : i === at ? 'bg-white/20' : 'bg-signal-soft')} aria-hidden="true">
              {p.done ? <Icon name="check" size={14} /> : i + 1}
            </span>
            {p.title}
            {p.done && <span className="sr-only"> (done)</span>}
          </button>
        ))}
      </nav>
      <section key={page.id} aria-labelledby={`page-${page.id}-title`} className="grid min-h-[340px] max-w-[1000px] animate-fade content-start gap-4 px-5 py-5">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          <h3 id={`page-${page.id}-title`} className="font-display text-[20px] leading-tight font-bold">
            {page.title}
          </h3>
          {page.action}
        </div>
        {page.hint && <p className="-mt-2 text-[15px] text-muted">{page.hint}</p>}
        {page.body}
      </section>
      <div className="no-print sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-hair bg-panel px-5 py-3 shadow-[0_-8px_20px_rgba(15,30,58,0.08)]">
        <button type="button" onClick={() => go(at - 1)} disabled={at === 0} className={ui.btn + ' ' + big}>
          <Icon name="chevron" size={20} className="rotate-180" />
          Back
        </button>
        <span className="text-[15px] font-semibold text-muted tabular-nums">
          Page {at + 1} of {pages.length}
        </span>
        {!last ? (
          <button type="button" onClick={() => go(at + 1)} className={ui.btnPrimary + ' ' + big + ' ml-auto min-w-[160px]'}>
            Next
            <Icon name="chevron" size={20} />
          </button>
        ) : (
          <>
            <div className="min-w-0 flex-1 text-[15px]">
              {!ready ? (
                <p className="flex flex-wrap items-center gap-x-1 gap-y-1">
                  <b className="mr-1">Still needed:</b>
                  {missing.map(([label, id]) => (
                    <button key={label} type="button" onClick={() => jump(id)} className={ui.btnGhost + ' px-2 underline underline-offset-2'}>
                      {label}
                    </button>
                  ))}
                </p>
              ) : (
                <p className={'flex items-start gap-2 ' + (fail ? 'text-danger' : 'text-ok')}>
                  <Icon name={fail ? 'failed' : 'done'} className="mt-0.5" />
                  <span>
                    <b>{fail ? `${issues.length} problem${issues.length > 1 ? 's' : ''}: ` : 'All checks passed. '}</b>
                    <span className={fail ? '' : 'text-muted'}>{fail ? issues.join(', ') : okText}</span>
                  </span>
                </p>
              )}
            </div>
            <button type="button" disabled={!ready} onClick={onSave} className={goButton(ready && !fail) + ' max-sm:w-full'}>
              <Icon name={fail ? 'inspect' : 'inspected'} size={24} />
              {saveLabel}
            </button>
          </>
        )}
      </div>
    </div>
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
const techPage = ({ form, set, recent, hint, extra }) => ({
  id: 'tech',
  title: 'Technician',
  done: filled(form.technician),
  hint,
  body: (
    <>
      <Chips label="Recent technicians" items={recent} value={form.technician} onPick={(v) => set('technician', v)} />
      <input
        id="field-technician"
        value={form.technician ?? ''}
        onChange={(e) => set('technician', e.target.value)}
        aria-labelledby="page-tech-title"
        placeholder={recent.length ? 'Or type a name' : 'Technician name'}
        autoComplete="off"
        className={ui.input + ' max-w-[420px]'}
      />
      {extra}
    </>
  ),
})

// The empty trailer and its reefer, as two pages, with what's missing, the problems and the review lines.
export const trailerSteps = ({ form, set, setMany, entry }) => {
  const checksDone = TRAILER_CHECKS.every((c) => form[c.name])
  const reeferDone = filled(form.precoolTemp) && filled(form.setPoint) && !!form.reeferRunning
  const missing = [...(checksDone ? [] : [['Trailer condition', 'trailer']]), ...(reeferDone ? [] : [['Reefer and pre-cool', 'reefer']])]
  const pages = [
    {
      id: 'trailer',
      title: 'Trailer',
      done: checksDone,
      hint: "Look inside the empty trailer. Tap All good, then No on anything that isn't.",
      action: <AllGood list={TRAILER_CHECKS} form={form} setMany={setMany} />,
      body: <Checks list={TRAILER_CHECKS} form={form} set={set} />,
    },
    {
      id: 'reefer',
      title: 'Reefer',
      done: reeferDone,
      hint: `Frozen poultry: trailer pre-cooled to ${LIMIT.precool}°F or below, reefer on continuous.`,
      body: (
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
      ),
    },
  ]
  const review = [
    ...TRAILER_CHECKS.map((c) => [c.label, form[c.name], form[c.name] === 'No']),
    ['Trailer pre-cool', filled(form.precoolTemp) ? `${form.precoolTemp}°F` : '', filled(form.precoolTemp) && Number(form.precoolTemp) > LIMIT.precool],
    ['Reefer set point', filled(form.setPoint) ? `${form.setPoint}°F` : '', false],
    ['Reefer on continuous', form.reeferRunning, form.reeferRunning === 'No'],
  ]
  return { pages, missing, issues: trailerIssues(form), review }
}

const trailerBlank = (entry, technician = '') => ({
  ...Object.fromEntries(TRAILER_CHECKS.map((c) => [c.name, ''])),
  precoolTemp: '',
  setPoint: entry.tempSet || '',
  reeferRunning: '',
  technician,
})

// Before loading: the technician, the empty trailer and the reefer, then Check it over. Pass lets the dock
// start loading; Fail tells Shipping. `inspector`: the person signed in on this tablet, who signs it.
export function TrailerCheckSheet({ entry, entries, inspector, defaultTech = '', onSave, onClose }) {
  const { form, set, setMany, clearDraft } = useChecklist(entry, 'trailer', trailerBlank(entry, defaultTech))
  const recent = useMemo(() => recentTechnicians(entries), [entries])
  const trailer = trailerSteps({ form, set, setMany, entry })
  const missing = [...(filled(form.technician) ? [] : [['Technician', 'tech']]), ...trailer.missing]
  const issues = trailer.issues
  const pages = [
    techPage({ form, set, recent, hint: 'Who is checking this trailer and loading it.' }),
    ...trailer.pages,
    { id: 'review', title: 'Check it over', done: missing.length === 0, hint: 'Every answer on one page. Anything in red fails the trailer check.', body: <Review items={[['Technician', form.technician, false], ...trailer.review]} /> },
  ]
  const save = () => {
    clearDraft()
    onSave(entry.id, { ...form, technician: form.technician.trim(), inspector, result: issues.length ? 'Fail' : 'Pass', issues, savedAt: Date.now() })
  }
  return (
    <Sheet title="Before loading" entry={entry} onClose={onClose}>
      <Paged
        pages={pages}
        missing={missing}
        issues={issues}
        saveLabel={issues.length ? 'Save · trailer not OK' : 'Save · ready to load'}
        okText="Next: Loading started on the board."
        onSave={save}
      />
    </Sheet>
  )
}

// After loading: the technician, product temperatures, load checks, pallets and seal, then Check it over
// and Pass / Fail. A visit loaded before the trailer check existed answers the trailer pages here too.
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
  const trailer = tc ? null : trailerSteps({ form, set, setMany, entry })
  const tempsDone = PRODUCT_TEMPS.every((t) => filled(form[t.name]))
  const palletsDone = filled(form.palletsLoaded)
  const checksDone = LOAD_CHECKS.every((c) => form[c.name])
  const sealDone = filled(form.sealApplied)
  const issues = [...(trailer?.issues ?? []), ...loadIssues(form)]
  const fail = issues.length > 0
  const fixDone = filled(form.correctiveAction)
  const missing = [
    ...(filled(form.technician) ? [] : [['Technician', 'tech']]),
    ...(trailer?.missing ?? []),
    ...(tempsDone ? [] : [['Product temperatures', 'temps']]),
    ...(checksDone ? [] : [['Load checks', 'checks']]),
    ...(fail && !fixDone ? [['What was done about it', 'checks']] : []),
    ...(palletsDone ? [] : [['Pallets', 'pallets']]),
    ...(sealDone ? [] : [['Seal no.', 'pallets']]),
  ]
  const recheck = prior?.result === 'Fail'
  const tempBad = (v) => filled(v) && Number(v) > LIMIT.product

  const pages = [
    techPage({
      form,
      set,
      recent,
      hint: tc?.technician ? 'From the check before loading. Change it if someone else loaded the trailer.' : 'Who loaded this trailer.',
      extra: (
        <div className="grid gap-3 pt-2">
          <Known
            items={[
              ['Trailer check', tc ? `${tc.result === 'Pass' ? 'Passed' : 'Failed'}, ${clockTime(tc.savedAt)}` : 'Not done before loading'],
              ['Loaded', entry.loadStartedAt && entry.loadFinishedAt ? `${clockTime(entry.loadStartedAt)} to ${clockTime(entry.loadFinishedAt)}` : '—'],
              ['Seal no. from check-in', entry.outgoingSeals],
              ['Signed by', inspector],
            ]}
          />
          <p className="text-[13px] text-muted">Filled in for you. The inspection time is recorded when you save.</p>
          {recheck && <Note tone="warn">Failed last time: {(prior.issues ?? []).join(', ') || 'see the saved inspection'}. Check it again.</Note>}
          {trailer && (
            <Note tone="warn" icon="info">
              This trailer wasn't checked before loading, so its trailer checks are asked here too.
            </Note>
          )}
        </div>
      ),
    }),
    ...(trailer?.pages ?? []),
    {
      id: 'temps',
      title: 'Temperatures',
      done: tempsDone,
      hint: `Probe front, middle and rear. Frozen product: ${LIMIT.product}°F or below.`,
      body: (
        <div className="grid gap-3 sm:grid-cols-3">
          {PRODUCT_TEMPS.map((t) => (
            <Measure key={t.name} name={t.name} label={`${t.label} °F`} value={form[t.name]} onChange={(v) => set(t.name, v)} start={-5} limit={LIMIT.product} hint={`Limit ${LIMIT.product}°F`} />
          ))}
        </div>
      ),
    },
    {
      id: 'checks',
      title: 'Load checks',
      done: checksDone && (!fail || fixDone),
      hint: "Tap All good, then No on anything that isn't.",
      action: <AllGood list={LOAD_CHECKS} form={form} setMany={setMany} />,
      body: (
        <>
          <Checks list={LOAD_CHECKS} form={form} set={set} />
          {fail && (
            <label className="grid gap-1.5 pt-2">
              <span className="font-display text-[17px] font-bold">What was done about it</span>
              <span className="text-[14px] text-muted">Needed because the load failed: {issues.join(', ')}. Shipping sees this note.</span>
              <textarea
                id="field-correctiveAction"
                value={form.correctiveAction}
                onChange={(e) => set('correctiveAction', e.target.value)}
                rows={3}
                placeholder="For example: pulled the rear pallets back to the freezer and probed again"
                className={ui.input + ' min-h-[96px] text-[16px]'}
              />
            </label>
          )}
        </>
      ),
    },
    {
      id: 'pallets',
      title: 'Pallets & seal',
      done: palletsDone && sealDone,
      hint: entry.outgoingSeals ? 'The seal is from check-in. Change it only if a different seal went on.' : 'Count the pallets as you close up, then the seal number you put on the doors.',
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          <Measure name="palletsLoaded" label="Pallets on the trailer" value={form.palletsLoaded} onChange={(v) => set('palletsLoaded', v)} start={22} min={0} hint="Count them as you close up" />
          <label className="grid content-start gap-2 rounded-xl border border-hair bg-field p-3">
            <span className="text-[14px] font-semibold">Seal no. applied</span>
            <input id="field-sealApplied" value={form.sealApplied} onChange={(e) => set('sealApplied', e.target.value)} autoComplete="off" className={ui.input} />
          </label>
        </div>
      ),
    },
    {
      id: 'review',
      title: 'Check it over',
      done: missing.length === 0,
      hint: 'Every answer on one page. Anything in red fails the load.',
      body: (
        <>
          <Review
            items={[
              ['Technician', form.technician, false],
              ...(trailer?.review ?? []),
              ...PRODUCT_TEMPS.map((t) => [`${t.label} temperature`, filled(form[t.name]) ? `${form[t.name]}°F` : '', tempBad(form[t.name])]),
              ...LOAD_CHECKS.map((c) => [c.label, form[c.name], form[c.name] === 'No']),
              ['Pallets', filled(form.palletsLoaded) ? `${form.palletsLoaded} pallets` : '', false],
              ['Seal no.', form.sealApplied, false],
              ...(fail ? [['What was done about it', form.correctiveAction, !fixDone]] : []),
            ]}
          />
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
        </>
      ),
    },
  ]

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
      <Paged pages={pages} missing={missing} issues={issues} saveLabel={fail ? 'Save · Fail' : 'Save · Pass'} okText="Next: release it from the board." onSave={save} />
    </Sheet>
  )
}

// A saved inspection at a glance (View inspection on a passed truck).
export function InspectionSummary({ entry, onClose, onRecheck }) {
  const i = entry.loadingInspection
  const temps = PRODUCT_TEMPS.map((t) => (filled(i[t.name]) ? `${i[t.name]}°F` : '—')).join(', ')
  return (
    <Sheet title="Inspection" entry={entry} onClose={onClose}>
      <div className="grid max-w-[1000px] gap-3 px-5 py-5">
        <Known
          items={[
            ['Result', i.result === 'Pass' ? 'Passed' : 'Failed'],
            ['Trailer check', entry.trailerCheck ? clockTime(entry.trailerCheck.savedAt) : '—'],
            ['Product temperatures', temps],
            ['Pallets', i.palletsLoaded],
            ['Pre-cool', filled(i.precoolTemp) ? `${i.precoolTemp}°F` : '—'],
            ['Seal no.', i.sealApplied],
            ['Inspected by', i.inspector],
            ['Saved', clockTime(i.savedAt ?? i.inspectedAt)],
          ]}
        />
        <button type="button" onClick={onRecheck} className={ui.btnSmall + ' w-fit'}>
          <Icon name="inspect" size={18} />
          Inspect again
        </button>
        <p className="text-[13px] text-muted">Inspecting again replaces this inspection, and the truck has to be released again.</p>
      </div>
    </Sheet>
  )
}

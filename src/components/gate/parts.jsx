import * as ui from '../../ui'
import { Icon } from '../../icons'
import { arrivalMs, clockTime } from '../../time'
import { today } from '../../gateForm'
import { checkOutBlock, isReleased } from '../../handoff'
import GuardOnDuty from '../GuardOnDuty'

// Building blocks of the Gate's Check In and Check Out pages, kept simple for a guard working with a
// tablet in one hand: the page title with the gate at a glance, a thin top line (switch, where and when,
// one progress bar), one column of steps with an icon-chip header, optional fields tucked under "More",
// a short recap, and a bottom bar that always holds the main button. Only what the guard taps moves
// (a short press or pop). Every control a guard answers has the id `field-<name>`, so the error list can
// jump to it.

// A headline number like Shipping's: it only takes colour when it needs action. With `onClick` it's a
// button (Ready to leave opens Check Out).
function GateTile({ icon, label, value, note, tone, onClick }) {
  const ic = { bad: 'bg-danger-soft text-danger', warn: 'bg-warn text-warn-ink', good: 'bg-ok-soft text-ok' }[tone] ?? 'bg-signal-tint text-signal'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick && { type: 'button', onClick })}
      className={
        'grid grid-cols-[40px_1fr] items-center gap-x-3 gap-y-0.5 rounded-[18px] border border-hair bg-panel px-4 py-3 text-left shadow-card ' +
        (onClick ? 'cursor-pointer transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised active:translate-y-0' : '')
      }
    >
      <span className={'row-span-2 grid size-10 place-items-center rounded-[12px] ' + ic}>
        <Icon name={icon} size={20} />
      </span>
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="font-display text-[28px] leading-none font-bold tabular-nums">{value}</span>
      <span className="col-span-2 mt-1.5 flex items-center gap-1 border-t border-hair pt-1.5 text-[13px] text-muted">
        {note}
        {onClick && <Icon name="chevron" size={14} className="ml-auto" />}
      </span>
    </Tag>
  )
}

// The Gate's title row, like the other tabs: title, one line on what's waiting, the guard on duty, and
// four tiles for the gate at a glance. `onReady` opens Check Out.
export function GateHeader({ entries, guard, onGuardChange, onReady }) {
  const onSite = entries.filter((e) => !e.timeOut)
  const ready = onSite.filter((e) => isReleased(e) && !checkOutBlock(e)).length
  // Trucks at a dock still waiting on their inspection or the inspector's release.
  const held = onSite.filter((e) => e.dockDoor && checkOutBlock(e)).length
  const atDocks = onSite.filter((e) => e.dockDoor).length
  const arrived = entries.filter((e) => e.dateIn === today())
  const lastIn = arrived.length ? Math.max(...arrived.map(arrivalMs).filter(Number.isFinite)) : NaN
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-bold">Gate</h1>
          <p className="text-muted" aria-live="polite">
            {ready ? (
              <b className="text-ok">
                {ready} truck{ready === 1 ? '' : 's'} ready to leave
              </b>
            ) : (
              'No one waiting to leave'
            )}
            {' · '}Check in at Gate 1, check out at Gate 2
          </p>
        </div>
        <GuardOnDuty guard={guard} onChange={onGuardChange} />
      </div>
      <div className="no-print grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GateTile icon="truck" label="On site" value={onSite.length} note={`${atDocks} at docks · ${onSite.length - atDocks} in the yard`} />
        <GateTile
          icon="checkOut"
          label="Ready to leave"
          value={ready}
          note={ready ? 'Open Check Out' : 'none released yet'}
          tone={ready ? 'good' : undefined}
          onClick={onReady}
        />
        <GateTile icon="checkIn" label="Arrived today" value={arrived.length} note={Number.isFinite(lastIn) ? `last at ${clockTime(lastIn)}` : 'none yet'} />
        <GateTile icon="blocked" label="Can't leave yet" value={held} note={held ? 'waiting on inspection' : 'nothing held'} tone={held ? 'warn' : undefined} />
      </div>
    </div>
  )
}

// Clears the sticky header and top line when a step or field is scrolled into view.
const SCROLL_MT = 'scroll-mt-[calc(var(--header-h,114px)+120px)]'

export const scrollToStep = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

// Progress in three clear steps: red while under a third is filled in, amber until every required
// answer is in, green when ready. The count beside the bar says the same without colour.
export function stageOf(filled, total, blocked) {
  if (blocked) return { bar: 'bg-danger', word: "Can't leave yet", text: 'text-danger' }
  if (total > 0 && filled === total) return { bar: 'bg-ok', word: 'ready', text: 'text-ok' }
  if (total > 0 && filled / total >= 1 / 3) return { bar: 'bg-warn-edge', word: 'done', text: 'text-ink' }
  return { bar: 'bg-danger', word: 'done', text: 'text-ink' }
}

// The thin line under the header: the Check In / Check Out switch, where and when (`where`), and one
// progress bar with "7 of 10". Sticky, so the guard always sees how far along they are.
export function GateTopLine({ switcher, where, progress }) {
  const stage = progress && stageOf(progress.filled, progress.total, progress.blocked)
  const pct = progress?.total ? Math.round((progress.filled / progress.total) * 100) : 0
  return (
    <div className="sticky top-[var(--header-h,114px)] z-[5] -mx-4 grid gap-2 border-b border-hair bg-panel px-4 py-2.5 shadow-card sm:mx-0 sm:rounded-2xl sm:border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {switcher}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted">{where}</div>
      </div>
      {progress && (
        <div className="flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-signal-soft"
            role="progressbar"
            aria-label="Required answers filled in"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.filled}
            aria-valuetext={progress.blocked ? stage.word : `${progress.filled} of ${progress.total} ${stage.word}`}
          >
            <div className={'h-full rounded-full transition-[width,background-color] duration-300 ease-out ' + stage.bar} style={{ width: `${progress.blocked ? 100 : pct}%` }} />
          </div>
          <span className="shrink-0 text-[14px] whitespace-nowrap text-muted" aria-hidden="true">
            {progress.blocked ? (
              <b className={stage.text}>{stage.word}</b>
            ) : (
              <>
                <b className={stage.text}>
                  {progress.filled} of {progress.total}
                </b>{' '}
                {stage.word}
              </>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

// One step: a card with a tinted header strip — icon chip, "Step 2 of 3", the title and a one-line hint.
// The chip is white until something is answered (`started`), amber while partly done, green with a tick
// once its required answers are in (`ok`); it pops briefly when that changes.
export function GateStep({ n, of, id, icon, title, hint, ok, started, children }) {
  const tone = ok ? 'done' : started ? 'started' : 'todo'
  return (
    <section aria-labelledby={id} className={ui.card}>
      <div className="flex items-center gap-3.5 rounded-t-2xl border-b border-hair bg-signal-tint px-5 py-3.5">
        <span
          key={tone}
          aria-hidden="true"
          className={
            'grid size-11 shrink-0 animate-pop place-items-center rounded-xl ' +
            { done: 'bg-ok text-signal-ink shadow-card', started: 'bg-warn text-warn-ink shadow-card', todo: 'bg-panel text-signal shadow-card' }[tone]
          }
        >
          <Icon name={tone === 'done' ? 'done' : icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold tracking-wide text-muted uppercase" aria-hidden="true">
            Step {n}
            {of ? ` of ${of}` : ''}
            {tone === 'done' && <span className="text-ok"> · Done</span>}
          </span>
          <h2 id={id} className={'font-display text-[20px] leading-tight font-bold ' + SCROLL_MT}>
            {title}
            {tone === 'started' && <span className="sr-only"> (in progress)</span>}
            {tone === 'done' && <span className="sr-only"> (done)</span>}
          </h2>
          {hint && <p className="text-[14px] text-muted">{hint}</p>}
        </div>
      </div>
      <div className="grid gap-4 px-5 pt-4 pb-5">{children}</div>
    </section>
  )
}

// Optional fields, tucked away at the end of a step until tapped. Opens by itself if something in it
// is already filled in.
export function More({ label, open, children }) {
  return (
    <details open={open} className="group border-t border-hair pt-2">
      <summary className="-mx-2 flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-[10px] px-2 font-semibold text-signal transition-colors duration-150 hover:bg-signal-tint [&::-webkit-details-marker]:hidden">
        <Icon name="chevron" size={18} className="transition-transform duration-150 group-open:rotate-90" />
        More (optional): {label}
      </summary>
      <div className="grid animate-fade gap-4 pt-2">{children}</div>
    </details>
  )
}

// Label, the control, a hint and the error. `group`: the control is a set of buttons, so the label
// names the group instead of pointing at one input.
export function FieldBox({ name, label, required, hint, error, group, after, className = '', children }) {
  const Label = group ? 'span' : 'label'
  return (
    <div className={'flex min-w-0 flex-col gap-1.5 ' + className}>
      <span className="flex flex-wrap items-center gap-2">
        <Label id={`field-${name}-label`} htmlFor={group ? undefined : `field-${name}`} className="text-[16px] font-semibold text-muted">
          {label}
          {required && <span className={ui.required}>*</span>}
        </Label>
        {after}
      </span>
      {children}
      {hint && <p className="text-[14px] text-muted">{hint}</p>}
      {error && (
        <p id={`field-${name}-error`} className={ui.errorText}>
          {error}
        </p>
      )}
    </div>
  )
}

// Shared feel of every tap-to-answer button: thin border, short colour change, a 1px press.
export const PRESS =
  'cursor-pointer border-[1.5px] transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:translate-y-px '

// Big buttons for one answer. `options`: [{ value, label, danger, disabled }] — the picked answer is
// solid slate, or solid red for a problem answer (a broken seal, an empty tank).
export function Seg({ name, options, value, onChange, error }) {
  return (
    <div role="group" aria-labelledby={`field-${name}-label`} aria-describedby={error ? `field-${name}-error` : undefined} className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            id={i === 0 ? `field-${name}` : undefined}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={
              PRESS +
              'min-h-[58px] min-w-16 flex-1 rounded-xl px-3 font-display text-[17px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ' +
              (on
                ? o.danger
                  ? 'border-danger bg-danger text-signal-ink shadow-raised'
                  : 'border-signal bg-signal text-signal-ink shadow-raised'
                : (error ? 'border-danger' : 'border-line') + ' bg-field text-ink hover:border-signal-bright hover:bg-panel')
            }
          >
            {o.label ?? o.value}
          </button>
        )
      })}
    </div>
  )
}

// Tap-to-fill buttons (recent carriers, customers, appointment times). The one matching `value` is picked.
export function Chips({ label, items, value, onPick }) {
  if (!items.length) return null
  const picked = String(value ?? '').trim().toLowerCase()
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((it) => {
        const v = typeof it === 'string' ? it : it.value
        const on = picked === String(v).toLowerCase()
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(v)}
            className={
              PRESS +
              'inline-flex min-h-12 items-center rounded-xl px-4 text-[15px] font-semibold ' +
              (on ? 'border-signal bg-signal text-signal-ink shadow-raised' : 'border-line bg-panel text-ink hover:border-signal-bright hover:bg-signal-tint')
            }
          >
            {typeof it === 'string' ? it : it.label}
          </button>
        )
      })}
    </div>
  )
}

// − value + for temperatures and counts; the value can also be typed. `start`: what the first tap on an
// empty box sets (e.g. −5 for frozen product), so nobody has to type a minus sign.
export function Stepper({ name, label, value, onChange, step = 1, min, start, inputMode = 'decimal', error }) {
  const bump = (d) => {
    if (start != null && String(value ?? '').trim() === '') return onChange(String(start))
    const n = (parseFloat(value) || 0) + d
    onChange(String(min != null ? Math.max(min, n) : n))
  }
  const btn = 'w-16 shrink-0 cursor-pointer bg-panel text-[22px] font-bold text-ink transition-colors duration-150 hover:bg-signal-tint active:bg-signal-soft'
  return (
    <div className={'flex overflow-hidden rounded-xl border-[1.5px] bg-field ' + (error ? 'border-danger' : 'border-line')}>
      <button type="button" onClick={() => bump(-step)} aria-label={`Lower ${label}`} className={btn}>
        −
      </button>
      <input
        id={`field-${name}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className="min-h-[58px] min-w-0 flex-1 bg-transparent text-center font-display text-[22px] font-bold focus:outline-none"
      />
      <button type="button" onClick={() => bump(step)} aria-label={`Raise ${label}`} className={btn}>
        +
      </button>
    </div>
  )
}

// A pill with an icon and words; `tone`: ok | warn | danger | info.
export function Badge({ tone = 'info', icon, children }) {
  const cls = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn text-warn-ink', danger: 'bg-danger-soft text-danger', info: 'bg-signal-soft text-ink' }[tone]
  return (
    <span className={ui.tag + ' text-[14px] ' + cls}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </span>
  )
}

// A full-width message inside a step: `bad` for a problem to tell Shipping about, `warn` for a heads-up,
// `ok` for a confirmation.
export function Note({ tone = 'bad', icon = 'warning', children }) {
  const cls = { bad: 'bg-danger-soft text-danger', warn: 'bg-warn text-warn-ink', ok: 'bg-ok-soft text-ok' }[tone]
  return (
    <p role={tone === 'bad' ? 'alert' : undefined} className={'flex animate-fade items-start gap-2 rounded-xl px-4 py-2.5 font-semibold ' + cls}>
      <Icon name={icon} className="mt-0.5" />
      <span>{children}</span>
    </p>
  )
}

// A short recap above the bottom bar: a few lines, each filled in as the guard goes ("Not yet" until then).
export function Recap({ lines }) {
  return (
    <section aria-label="Check it over" className={ui.card + ' px-5 py-4'}>
      <h2 className="mb-1.5 flex items-center gap-2.5 font-display text-[18px] font-bold">
        <span className="grid size-9 place-items-center rounded-[10px] bg-signal-tint text-signal">
          <Icon name="log" size={18} />
        </span>
        Check it over
      </h2>
      {lines.map((parts, i) => {
        const shown = parts.filter(Boolean)
        return (
          <p key={i} className="border-t border-hair py-1.5 text-[15px] first-of-type:border-t-0">
            {shown.length ? (
              shown.reduce((acc, p, j) => (j ? [...acc, ' · ', p] : [p]), [])
            ) : (
              <span className="text-muted italic">Not yet</span>
            )}
          </p>
        )
      })}
    </section>
  )
}

// The main button: slate while something is missing, solid green when everything required is in.
const SLATE = 'border-signal bg-signal text-signal-ink shadow-raised hover:border-signal-hover hover:bg-signal-hover'
export const goButton = (ready) =>
  (ready ? ui.btnPrimary.replace(SLATE, 'border-ok bg-ok text-signal-ink shadow-raised hover:brightness-110') : ui.btnPrimary) + ' min-h-[60px] min-w-[220px] text-[19px]'

// The small actions under the recap (Edit, Clear, Print, Cancel): a ghost button with an icon.
export function LinkButton({ icon, onClick, children, ...rest }) {
  return (
    <button type="button" onClick={onClick} className={ui.btnGhost} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

// The bar pinned to the bottom of the screen: what's still needed (each name jumps to its step) and the
// main button, always in the same place. `missing`: [[label, stepId], …]. `tint` for a confirm step.
export function BottomBar({ missing = [], message, tint, children }) {
  return (
    <div
      className={
        'no-print sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-hair px-5 py-3 shadow-[0_-8px_20px_rgba(15,30,58,0.08)] sm:mx-0 sm:rounded-2xl sm:border ' +
        (tint ? 'bg-signal-tint' : 'bg-panel')
      }
    >
      <div className="min-w-[200px] flex-1 text-[16px] text-muted" aria-live="polite">
        {message ??
          (missing.length ? (
            <>
              Still needed:{' '}
              {missing.map(([label, step], i) => (
                <span key={label}>
                  {i > 0 && ', '}
                  <button type="button" onClick={() => scrollToStep(step)} className="cursor-pointer font-bold text-danger underline">
                    {label}
                  </button>
                </span>
              ))}
            </>
          ) : (
            <b className="text-ok">All done</b>
          ))}
      </div>
      {children}
    </div>
  )
}

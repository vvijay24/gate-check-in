import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useInsightsNav } from './nav'
import { Spark } from './viz'

// Panels used across Insights: a titled card, a headline-figure tile, a strip of tiles and a meter.
// The words that explain a panel sit behind a small ⓘ beside its title, so the numbers lead.

// ⓘ beside a title: hover or focus shows `children`; a click keeps it open (Escape or a click
// elsewhere closes it), so a link or button inside can be reached. The pop-up is drawn on the page
// body so a panel's clipped edges never cut it off.
export function Info({ label, children, tone = 'muted' }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [at, setAt] = useState(null)
  const btn = useRef(null)
  const pop = useRef(null)
  const closeTimer = useRef(0)
  const id = 'info' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const open = hover || pinned
  const enter = () => {
    clearTimeout(closeTimer.current)
    setHover(true)
  }
  const leave = () => {
    closeTimer.current = setTimeout(() => setHover(false), 140)
  }
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const w = Math.min(300, window.innerWidth - 16)
    setAt({ left: Math.max(8, Math.min(r.left - 12, window.innerWidth - w - 8)), top: r.bottom + 6, width: w })
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        setPinned(false)
        setHover(false)
      }
    }
    const onDown = (ev) => {
      if (!btn.current?.contains(ev.target) && !pop.current?.contains(ev.target)) {
        setPinned(false)
        setHover(false)
      }
    }
    const onScroll = () => setHover(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label ? `About ${label}` : 'More about this'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setPinned((v) => !v)}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        className={
          'no-print ml-1 inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full align-[-3px] transition-colors hover:text-ink ' +
          (pinned ? 'text-signal' : tone === 'rail' ? 'text-rail-muted' : 'text-muted/70')
        }
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <rect x="7.3" y="7" width="1.4" height="4.4" rx="0.7" fill="currentColor" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        </svg>
      </button>
      {open &&
        at &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="note"
            onMouseEnter={enter}
            onMouseLeave={leave}
            className="fixed z-50 rounded-lg bg-chrome px-3.5 py-2.5 text-left text-[13px] leading-relaxed font-normal tracking-normal text-white normal-case shadow-lg [&_a]:text-white [&_a]:underline [&_b]:font-semibold [&_button]:text-white"
            style={{ left: at.left, top: at.top, width: at.width }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}

// A small green "all clear" chip, shown in place of an empty list.
export function ClearChip({ children }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-ok-soft px-2.5 text-[12.5px] font-semibold text-ok">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  )
}

// A panel with a header row (title with its ⓘ, and `legend` / `action` or controls on the right)
// over its body. `sub` explains the panel and sits behind the ⓘ (`showSub` keeps it on show, for
// a message that is the panel's whole point). `clear`: the list it would show is empty and that is
// good news, so the panel collapses to its title and a green chip saying so.
export function Card({ title, sub, showSub, badge, legend, action, clear, children, className = '' }) {
  if (clear) {
    return (
      <section className={'flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-panel px-5 py-3 shadow-card ' + className}>
        <h3 className="text-[14.5px] leading-snug font-semibold tracking-[-0.005em]">
          {title}
          {sub && <Info label={typeof title === 'string' ? title : undefined}>{sub}</Info>}
        </h3>
        <ClearChip>{clear}</ClearChip>
      </section>
    )
  }
  return (
    <section className={'min-w-0 rounded-xl bg-panel shadow-card ' + className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-[14.5px] leading-snug font-semibold tracking-[-0.005em]">
            {title}
            {sub && !showSub && <Info label={typeof title === 'string' ? title : undefined}>{sub}</Info>}
            {badge}
          </h3>
          {sub && showSub && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{sub}</p>}
        </div>
        {(legend || action) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {legend}
            {action}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

// A small text button for a card header (Change targets and the like).
export function CardAction({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="min-h-8 cursor-pointer text-[12.5px] font-semibold text-muted underline hover:text-ink">
      {children}
    </button>
  )
}

// Numbers (money, %, durations) show in the mono face so they line up; names stay in the text face.
const isWordy = (v) => typeof v === 'string' && /[A-Za-z]{3,}/.test(v)

// `size`: 'lead' is the section's main figure (fills its row's height); 'compact' sits in a strip;
// omitted is the regular tile. `tone` (good / warn / alert) colors a thin top edge. `note` explains
// the figure: shown when the tile needs attention (warn / alert), otherwise behind the label's ⓘ.
// `spark` ({ values, label }) adds a small trend line, one value per day of the range.
// `to` ({ section, status, label }) makes the whole tile open that section (the ⓘ still works).
export function Tile({ label, value, note, tone, trend, size, spark, to }) {
  const { go } = useInsightsNav()
  const bar = { alert: 'bg-danger', warn: 'bg-warn', good: 'bg-ok' }[tone]
  const box = { lead: 'flex h-full flex-col px-6 py-5 ' + (spark ? 'justify-between' : 'justify-center'), compact: 'flex flex-col px-4 py-3.5' }[size] ?? 'px-4 py-3.5'
  const number = { lead: 'mt-2 text-[40px]', compact: 'mt-1.5 text-[24px]' }[size] ?? 'mt-1.5 text-[28px]'
  const loud = tone === 'alert' || tone === 'warn'
  return (
    <div className={'group/tile relative min-w-0 overflow-hidden rounded-xl bg-panel shadow-card ' + (to ? 'transition-colors hover:bg-field ' : '') + box}>
      {bar && <i aria-hidden="true" className={'absolute inset-x-0 top-0 h-[3px] ' + bar} />}
      {to && (
        <button
          type="button"
          onClick={() => go(to.section, { status: to.status })}
          aria-label={`${typeof label === 'string' ? label : ''}: ${to.label}`}
          title={to.label}
          className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal"
        />
      )}
      {to && (
        <span aria-hidden="true" className="pointer-events-none absolute top-3 right-3 text-[14px] text-muted opacity-0 transition-opacity group-hover/tile:opacity-100">
          →
        </span>
      )}
      <div className="eyebrow pointer-events-none relative flex min-w-0 items-center text-muted [&_button]:pointer-events-auto">
        <span className="truncate">{label}</span>
        {note && !loud && <Info label={typeof label === 'string' ? label : undefined}>{note}</Info>}
      </div>
      <div className={'pointer-events-none relative ' + number + ' leading-none font-semibold ' + (isWordy(value) ? 'truncate tracking-[-0.01em]' : 'figure')}>{value}</div>
      {note && loud && (
        <div className={'pointer-events-none relative mt-2 text-[12.5px] leading-snug ' + (tone === 'alert' ? 'font-semibold text-danger' : 'text-warn-line')}>{note}</div>
      )}
      {trend && <div className={'pointer-events-none relative ' + (loud ? '' : 'mt-2')}>{trend}</div>}
      {spark && size !== 'lead' && <div className="min-h-2 flex-1" />}
      {spark && (
        <Spark
          values={spark.values}
          label={spark.label}
          color={tone === 'alert' ? 'var(--color-danger)' : undefined}
          className={'pointer-events-none relative ' + (size === 'lead' ? 'mt-4 h-16 w-full' : 'mt-1 h-8 w-full')}
        />
      )}
    </div>
  )
}

// Tiles joined into one panel with hairline dividers, like an instrument strip. `cols` are the
// grid-cols classes per breakpoint.
export function Strip({ cols = 'grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5', children }) {
  return (
    <div
      className={
        'grid overflow-hidden rounded-xl bg-panel shadow-card ' +
        '[&>*]:rounded-none [&>*]:shadow-[inset_-1px_-1px_0_var(--color-line)] ' +
        cols
      }
    >
      {children}
    </div>
  )
}

export function Meter({ value, max = 1, className = 'bg-ink' }) {
  const w = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
      <div className={'h-full rounded-full ' + className} style={{ width: `${w}%` }} />
    </div>
  )
}

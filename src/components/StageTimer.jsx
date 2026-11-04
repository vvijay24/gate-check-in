import { Icon } from '../icons'
import { duration } from '../time'
import { STAGES, toneOf } from '../stages'

// A stage timer: a pill with the time so far (green → amber → red against the stage's target), and a
// thin bar with the target window striped on it plus words that say the same without colour
// ("8m left of 30 min", "11m over the 30-min limit"). `since` is when the stage started (ms).

const PILL = { ok: 'bg-ok-soft text-ok', window: 'bg-warn text-warn-ink', late: 'bg-danger-soft text-danger' }
const FILL = { ok: 'bg-ok', window: 'bg-warn-edge', late: 'bg-danger' }
const STATE = { ok: 'on track', window: 'inside the target window', late: 'past the limit' }

const minutesSince = (since, now) => (Number.isFinite(since) ? Math.max(0, (now - since) / 60000) : null)

export function TimerPill({ stage, since, now, label }) {
  const s = STAGES[stage]
  const m = minutesSince(since, now)
  if (m == null) return null
  const tone = toneOf(m, s)
  return (
    <span
      role="timer"
      aria-label={`${label ?? s.label}: ${duration(m * 60000)}, ${STATE[tone]}`}
      className={'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1 text-[13px] font-bold whitespace-nowrap ' + PILL[tone]}
    >
      <Icon name="waiting" size={15} />
      <span className="font-display text-[17px] leading-none">{duration(m * 60000)}</span>
    </span>
  )
}

// `scale`: minutes the bar spans (defaults to 1.5 × the limit).
export function TimerLine({ stage, since, now, scale }) {
  const s = STAGES[stage]
  const m = minutesSince(since, now)
  if (m == null) return null
  const tone = toneOf(m, s)
  const span = scale ?? s.max * 1.5
  return (
    <div className="grid gap-1.5" aria-hidden="true">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-signal-soft">
        <span
          className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(15,30,58,0.16)_0_3px,transparent_3px_6px)]"
          style={{ left: `${(s.min / span) * 100}%`, width: `${((s.max - s.min) / span) * 100}%` }}
        />
        <span className={'absolute inset-y-0 left-0 rounded-full ' + FILL[tone]} style={{ width: `${Math.min(100, (m / span) * 100)}%` }} />
      </div>
      <span className="text-[13px] text-muted">
        {tone === 'late' ? (
          <span className="text-danger">
            <b>{duration((m - s.max) * 60000)} over</b> the {s.max}-min limit
          </span>
        ) : (
          <>
            <b className="text-ink">{duration((s.max - m) * 60000)} left</b> of {s.max} min
          </>
        )}
      </span>
    </div>
  )
}

// The colour key shown once per page.
export function TimerLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted" aria-label="Timer colours">
      <span className="flex items-center gap-1.5">
        <i className="inline-block size-2.5 rounded-full bg-ok" />
        On track
      </span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block size-2.5 rounded-full bg-warn-edge" />
        Inside target
      </span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block size-2.5 rounded-full bg-danger" />
        Late
      </span>
    </span>
  )
}

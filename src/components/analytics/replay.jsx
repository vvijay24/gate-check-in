import { useEffect, useMemo, useState } from 'react'
import * as ui from '../../ui'
import { clockTime, dayKey, shortDate } from '../../time'
import { dayMetrics, yardMetrics } from '../../metrics'
import { detentionState } from '../../detention'
import YardMap from '../YardMap'
import { Card } from './ui'

// Yard Replay (Overview): any day in the range on the isometric yard map. Drag the time slider or
// press Play to watch trucks arrive, wait in a bay, back into a dock and leave; the light follows the
// clock from night through dawn, day and dusk.

const SPEEDS = [
  { id: 10, label: '10 min/s' },
  { id: 40, label: '40 min/s' },
]
const DAY_MIN = 24 * 60
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`

// The days from `from` to `to`, newest first.
function daysBetween(from, to) {
  const out = []
  const d = new Date(`${to}T00:00`)
  const first = new Date(`${from}T00:00`)
  while (d >= first && out.length < 400) {
    out.push(dayKey(d))
    d.setDate(d.getDate() - 1)
  }
  return out
}

export const REPLAY_SUMMARY = (r) => ({
  key: `${r.dayCount} day${r.dayCount === 1 ? '' : 's'} to replay`,
  takeaway: (
    <>
      Pick a day and press <b>Play</b> to watch the yard: trucks arrive through Gate 1, wait in a bay, back
      into a dock and leave through Gate 2. Drag the slider to jump to any moment.
    </>
  ),
})

export function ReplaySection({ entries, range }) {
  const today = dayKey(new Date())
  const days = useMemo(() => daysBetween(range.from, range.to), [range.from, range.to])
  const [day, setDay] = useState(days[0])
  // Minutes after midnight on `day`; today can only replay up to now.
  const maxMin = day === today ? Math.floor((Date.now() - new Date(`${day}T00:00`).getTime()) / 60000) : DAY_MIN - 1
  const [minute, setMinute] = useState(() => Math.min(maxMin, 10 * 60))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS[0].id)

  // A new range keeps the chosen day if it's still in it.
  useEffect(() => {
    if (!days.includes(day)) setDay(days[0])
  }, [days, day])

  // Play: advance the clock `speed` minutes per second, stopping at the end of the day (or now).
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setMinute((m) => {
        const next = m + speed / 10
        if (next >= maxMin) {
          setPlaying(false)
          return maxMin
        }
        return next
      })
    }, 100)
    return () => clearInterval(t)
  }, [playing, speed, maxMin])

  const pickDay = (d) => {
    setDay(d)
    setPlaying(false)
    setMinute(6 * 60)
  }
  const play = () => {
    if (minute >= maxMin) setMinute(0)
    setPlaying((p) => !p)
  }

  const atMs = new Date(`${day}T00:00`).getTime() + Math.round(minute) * 60000
  // Recomputed every 5 replay minutes while playing, every step while dragging.
  const step = Math.round(minute / 5)
  const yard = useMemo(() => yardMetrics(entries, atMs, atMs), [entries, day, step]) // eslint-disable-line react-hooks/exhaustive-deps
  const gateCounts = useMemo(() => dayMetrics(entries, day, atMs).gateCounts, [entries, day, step]) // eslint-disable-line react-hooks/exhaustive-deps
  const onSite = yard.atDock.size + yard.bays.filter(Boolean).length + yard.overflow.length + yard.otherDocks.length
  const over = [...yard.atDock.values(), ...yard.bays.filter(Boolean)].filter((e) => detentionState(e, atMs)?.level === 'over').length

  const seg = (on) =>
    'min-h-11 cursor-pointer rounded-md border px-3 text-[14px] font-semibold ' + (on ? 'border-signal bg-signal text-signal-ink' : 'border-edge bg-panel text-ink hover:bg-field')
  const stats = [
    ['On site', onSite],
    ['At docks', yard.atDock.size],
    ['Waiting for a dock', yard.waiting.length],
    ['Past free time', over],
  ]

  return (
    <Card title="Yard Replay" sub="The yard on any day in the range, moment by moment. The light follows the clock.">
      <div className="space-y-4 px-5 pt-3 pb-5">
        <div className="no-print flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-semibold">
            <span className="text-muted">Day</span>
            <select
              value={day}
              onChange={(ev) => pickDay(ev.target.value)}
              className="min-h-11 cursor-pointer rounded-md border border-edge bg-panel px-2 font-semibold text-ink"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {shortDate(d)}
                  {d === today ? '' : ` (${new Date(`${d}T00:00`).toLocaleDateString([], { weekday: 'short' })})`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={play} aria-pressed={playing} className={ui.btnSmallPrimary + ' min-w-28'}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <div role="group" aria-label="Replay speed" className="flex gap-1">
            {SPEEDS.map((s) => (
              <button key={s.id} type="button" aria-pressed={speed === s.id} onClick={() => setSpeed(s.id)} className={seg(speed === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <span className="ml-auto font-display text-[24px] leading-none font-semibold tabular-nums" aria-live="off">
            {clockTime(atMs)}
          </span>
        </div>

        <div className="no-print">
          <input
            type="range"
            min={0}
            max={maxMin}
            step={1}
            value={Math.round(minute)}
            onChange={(ev) => {
              setPlaying(false)
              setMinute(Number(ev.target.value))
            }}
            aria-label="Time of day"
            aria-valuetext={`${shortDate(day)}, ${clockTime(atMs)}`}
            className="w-full cursor-pointer accent-[var(--color-signal-line)]"
          />
          <div className="flex justify-between text-[12px] text-muted" aria-hidden="true">
            {[0, 6, 12, 18].map((h) => (
              <span key={h}>{hourLabel(h)}</span>
            ))}
            <span>{day === today ? 'Now' : '12 AM'}</span>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <li key={label} className="rounded-lg border border-line bg-page px-3 py-2">
              <div className="text-[13px] font-semibold text-muted">{label}</div>
              <div className={'font-display text-[19px] leading-tight font-semibold' + (label === 'Past free time' && value ? ' text-danger' : '')}>{value}</div>
            </li>
          ))}
        </ul>

        <YardMap yard={yard} gateCounts={gateCounts} at={atMs} clock={atMs} live={false} animate={playing} pace={speed >= 40 ? 5 : 2.5} />
      </div>
    </Card>
  )
}

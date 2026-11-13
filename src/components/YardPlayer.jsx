import { useEffect, useMemo, useState } from 'react'
import { clockTime, dayKey, shortDate } from '../time'
import { dayMetrics, yardMetrics } from '../metrics'
import YardMap from './YardMap'

// The full-size 3D yard map with a player: Live by default (updates as the gate and docks record each
// step), Pause freezes it at that moment, and Replay plays back any of the last 30 days. Dragging the
// time slider jumps to that moment of the day (and switches to Replay); Back to live returns to now.
// Taps that open work (View entry, Check out, Inspect) only act on the live map.

const DAY_MIN = 24 * 60
const DAYS_BACK = 30
const SPEEDS = [
  { id: 2, label: '2 min/s' },
  { id: 10, label: '10 min/s' },
  { id: 40, label: '40 min/s' },
]
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
const startOf = (day) => new Date(`${day}T00:00`).getTime()

export default function YardPlayer({ entries, onEdit, onCheckOut, focus, onInspect }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const today = dayKey(new Date(now))
  const days = useMemo(() => {
    const out = []
    const d = new Date(`${today}T00:00`)
    for (let i = 0; i < DAYS_BACK; i++) {
      out.push(dayKey(d))
      d.setDate(d.getDate() - 1)
    }
    return out
  }, [today])

  // 'live' (now), 'paused' (frozen at `pausedAt`) or 'replay' (`day`, `minute` after midnight).
  const [mode, setMode] = useState('live')
  const [pausedAt, setPausedAt] = useState(null)
  const [day, setDay] = useState(today)
  const [minute, setMinute] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(10)
  const maxMin = day === today ? Math.floor((now - startOf(day)) / 60000) : DAY_MIN - 1

  // Play: advance the replay clock `speed` minutes per second, stopping at the end of the day (or now).
  useEffect(() => {
    if (mode !== 'replay' || !playing) return
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
  }, [mode, playing, speed, maxMin])

  const atMs = mode === 'live' ? Infinity : mode === 'paused' ? pausedAt : startOf(day) + Math.round(minute) * 60000
  const clock = mode === 'live' ? now : atMs
  // Recomputed every 5 replay minutes while playing, every step while dragging.
  const step = mode === 'replay' ? `${day}:${Math.round(minute / 5)}` : `${mode}:${pausedAt}:${now}`
  const yard = useMemo(() => yardMetrics(entries, atMs, clock), [entries, step]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownDay = mode === 'replay' ? day : dayKey(new Date(clock))
  const gateCounts = useMemo(() => dayMetrics(entries, shownDay, clock).gateCounts, [entries, step]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = mode === 'live'
  const goLive = () => {
    setMode('live')
    setPlaying(false)
  }
  const pause = () => {
    setPausedAt(Date.now())
    setMode('paused')
  }
  const startReplay = (d = day, m) => {
    setMode('replay')
    setDay(d)
    setMinute(m ?? (d === today ? Math.max(0, Math.floor((now - startOf(d)) / 60000) - 120) : 6 * 60))
    setPlaying(false)
  }
  const play = () => {
    if (minute >= maxMin) setMinute(0)
    setPlaying((p) => !p)
  }
  // The slider shows the moment on screen; dragging it replays that day from there.
  const sliderDay = mode === 'replay' ? day : today
  const sliderMax = sliderDay === today ? Math.floor((now - startOf(today)) / 60000) : DAY_MIN - 1
  const sliderValue = mode === 'replay' ? Math.round(minute) : Math.floor((Math.min(clock, now) - startOf(today)) / 60000)

  const seg = (on) =>
    'min-h-9 cursor-pointer rounded-md px-3 text-[13px] font-semibold transition-colors duration-150 ' + (on ? 'bg-signal text-signal-ink' : 'text-ink hover:bg-field')
  const btn = 'min-h-9 cursor-pointer rounded-md border border-line bg-panel px-3 text-[13px] font-semibold text-ink hover:bg-field'
  const main = 'min-h-9 min-w-24 cursor-pointer rounded-md bg-signal px-3 text-[13px] font-semibold text-signal-ink hover:brightness-110'

  const status = live ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-[12px] font-bold text-ok">
      <i className="inline-block size-1.5 rounded-full bg-ok" />
      Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-tint px-2.5 py-0.5 text-[12px] font-bold text-muted">
      {mode === 'paused' ? `Paused at ${clockTime(pausedAt)}` : `Replay · ${shortDate(day)}`}
    </span>
  )

  // Mode, play / pause, day and speed: laid over the map's top-right corner on wider screens (open sky
  // there), above the map on phones, where the map scrolls sideways.
  const controls = (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/90 p-1.5 shadow-lg backdrop-blur-md">
      <div role="group" aria-label="Map mode" className="flex gap-0.5 rounded-md border border-line p-0.5">
        <button type="button" aria-pressed={mode !== 'replay'} onClick={goLive} className={seg(mode !== 'replay')}>
          Live
        </button>
        <button type="button" aria-pressed={mode === 'replay'} onClick={() => mode !== 'replay' && startReplay(today)} className={seg(mode === 'replay')}>
          Replay
        </button>
      </div>
      {mode === 'replay' ? (
        <>
          <label className="flex items-center">
            <span className="sr-only">Day to replay</span>
            <select
              value={day}
              onChange={(ev) => startReplay(ev.target.value)}
              className="min-h-9 cursor-pointer rounded-md border border-line bg-panel px-2 text-[13px] font-semibold text-ink"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {shortDate(d)}
                  {d === today ? '' : ` (${new Date(`${d}T00:00`).toLocaleDateString([], { weekday: 'short' })})`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={play} aria-pressed={playing} className={main}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <div role="group" aria-label="Replay speed" className="flex gap-0.5 rounded-md border border-line p-0.5">
            {SPEEDS.map((s) => (
              <button key={s.id} type="button" aria-pressed={speed === s.id} onClick={() => setSpeed(s.id)} className={seg(speed === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : live ? (
        <button type="button" onClick={pause} className={main}>
          ❚❚ Pause
        </button>
      ) : (
        <button type="button" onClick={goLive} className={main}>
          ▶ Resume
        </button>
      )}
      {mode !== 'live' && (
        <button type="button" onClick={goLive} className={btn}>
          Back to live
        </button>
      )}
    </div>
  )

  return (
    <div className="grid gap-3">
      <div className="md:hidden">{controls}</div>
      <div className="no-print flex items-center gap-4">
        <span className="w-[5.5rem] shrink-0 font-display text-[20px] leading-none font-semibold tabular-nums" aria-live="off">
          {clockTime(clock)}
        </span>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, sliderMax)}
            step={1}
            value={Math.max(0, Math.min(sliderMax, sliderValue))}
            onChange={(ev) => {
              const m = Number(ev.target.value)
              if (mode !== 'replay') startReplay(today, m)
              else {
                setPlaying(false)
                setMinute(m)
              }
            }}
            aria-label="Time of day"
            aria-valuetext={`${shortDate(sliderDay)}, ${clockTime(clock)}`}
            className="w-full cursor-pointer accent-[var(--color-signal-line)]"
          />
          <div className="flex justify-between text-[12px] text-muted" aria-hidden="true">
            {[0, 6, 12, 18].map((h) => (
              <span key={h}>{hourLabel(h)}</span>
            ))}
            <span>{sliderDay === today ? 'Now' : '12 AM'}</span>
          </div>
        </div>
        <span className="shrink-0">{status}</span>
      </div>
      <YardMap
        yard={yard}
        gateCounts={gateCounts}
        at={atMs}
        clock={clock}
        live={live}
        animate={live || (mode === 'replay' && playing)}
        pace={live ? 1 : speed >= 40 ? 5 : 2.5}
        onEdit={live ? onEdit : undefined}
        onCheckOut={live ? onCheckOut : undefined}
        focus={focus}
        onInspect={live ? onInspect : undefined}
        overlay={<div className="hidden md:block">{controls}</div>}
      />
    </div>
  )
}

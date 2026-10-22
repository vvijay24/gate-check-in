// Time helpers shared by the dashboards. Form dates/times are local "YYYY-MM-DD" / "HH:MM" strings.
const pad = (n) => String(n).padStart(2, '0')

export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const toMs = (date, time) => (date ? new Date(`${date}T${time || '00:00'}`).getTime() : NaN)

export const arrivalMs = (e) => toMs(e.dateIn, e.timeIn)
export const departureMs = (e) => (e.timeOut ? toMs(e.dateOut || e.dateIn, e.timeOut) : NaN)

export const duration = (ms) => {
  if (!Number.isFinite(ms)) return '—'
  const m = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${m % 60}m` : `${m}m`
}

export const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

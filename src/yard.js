// Yard layout and alert thresholds shared by the dashboards.
import { DETENTION } from './turnaround/targets'

// The yard's dock doors, shown as tiles in Dock Status and on the yard map.
export const DOCKS = ['1', '2', '3', '4', '5', '6']

// Detention: free time and fee come from turnaround/targets.js (METRICS.md); the warning point before it.
export const DETENTION_FREE_MIN = DETENTION.freeMin
export const DETENTION_WARN_MIN = 90
export const DETENTION_RATE_PER_HOUR = DETENTION.ratePerHour

// Dropped trailers are flagged after STALE_WARN_H in the yard and marked high after STALE_HIGH_H.
export const STALE_WARN_H = 24
export const STALE_HIGH_H = 48

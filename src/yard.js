// Yard layout and alert thresholds shared by the dashboards.

// The yard's dock doors, shown as tiles in Dock Status and on the Overview map.
export const DOCKS = ['1', '2', '3', '4', '5', '6']

// Staging bays for trucks waiting for a door and dropped trailers.
export const STAGING_BAYS = 6
// Bay names as guards pick them on the Check In form.
export const BAY_NAMES = Array.from({ length: STAGING_BAYS }, (_, i) => `Bay ${i + 1}`)
// Yard capacity turns red above this percentage.
export const YARD_ALERT_PCT = 85

// Detention: free time from check-in, the warning point before it, and the estimated fee after it.
export const DETENTION_FREE_MIN = 120
export const DETENTION_WARN_MIN = 90
export const DETENTION_RATE_PER_HOUR = 75

// Dropped trailers are flagged after STALE_WARN_H in the yard and marked high after STALE_HIGH_H.
export const STALE_WARN_H = 24
export const STALE_HIGH_H = 48

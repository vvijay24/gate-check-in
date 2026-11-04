// Shared class strings for the Control Room design language: 1px edges, 6px corners, Plex Sans.
// Gate screens are used on tablets, so controls stay at least 44px tall.
export const input =
  'w-full min-h-12 rounded-lg border border-edge bg-panel px-3 py-2 text-[16px] text-ink shadow-[inset_0_1px_1px_rgb(15_23_42/0.04)] ' +
  'focus:border-signal focus:ring-3 focus:ring-signal/20 focus:outline-none'
export const inputError = ' border-danger'

export const label = 'block text-[13px] font-medium text-muted'
export const required = 'ml-1 text-danger'
export const errorText = 'text-[13px] font-semibold text-danger'

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold cursor-pointer transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50'
export const btn = btnBase + ' min-h-12 px-5 text-[15px] border-edge bg-panel text-ink hover:bg-field'
export const btnPrimary = btnBase + ' min-h-12 px-5 text-[15px] border-signal bg-signal text-signal-ink hover:bg-signal-line shadow-[0_1px_2px_rgb(15_23_42/0.12)]'
export const btnSmall = btnBase + ' min-h-10 px-3 text-[14px] border-edge bg-panel text-ink hover:bg-field'
export const btnSmallPrimary = btnBase + ' min-h-10 px-3 text-[14px] border-signal bg-signal text-signal-ink hover:bg-signal-line'

// Segmented choice (fuel level, etc.). `danger`: this choice is a problem answer (e.g. a failed
// check), so it shows red once picked.
export const seg = (on, bad = false, danger = false) =>
  'flex min-h-12 flex-1 min-w-16 cursor-pointer items-center justify-center rounded-lg border px-2.5 py-1.5 text-center text-[15px] font-medium ' +
  (on && danger
    ? 'border-danger bg-danger-soft text-danger font-semibold'
    : on
      ? 'border-signal bg-signal-soft text-signal-line font-semibold ring-1 ring-signal'
      : (bad ? 'border-danger' : 'border-edge') + ' bg-panel text-ink hover:bg-field')

export const PURPOSE_STYLES = {
  Delivery: { stripe: 'bg-delivery', tag: 'bg-delivery-soft text-delivery', check: 'accent-delivery has-[:checked]:border-delivery' },
  Pickup: { stripe: 'bg-pickup', tag: 'bg-pickup-soft text-pickup', check: 'accent-pickup has-[:checked]:border-pickup' },
  'Drop Trailer': { stripe: 'bg-drop', tag: 'bg-drop-soft text-drop', check: 'accent-drop has-[:checked]:border-drop' },
}

export const tag = 'inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold'

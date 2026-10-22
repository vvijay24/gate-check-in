// Shared class strings, matching guard-shack-log.html.
export const input =
  'w-full min-h-[52px] rounded-lg border-2 border-line bg-field px-3 py-2.5 text-[19px] text-ink ' +
  'focus:border-ink focus:outline-none'
export const inputError = ' border-danger'

export const label = 'block text-[15px] font-semibold text-muted'
export const required = 'ml-1 text-danger'
export const errorText = 'text-sm font-semibold text-danger'

const btnBase =
  'inline-flex items-center justify-center rounded-[10px] border-2 font-display font-bold cursor-pointer ' +
  'disabled:cursor-not-allowed disabled:opacity-50'
export const btn = btnBase + ' min-h-14 px-6 text-[22px] border-ink bg-panel text-ink'
export const btnPrimary = btnBase + ' min-h-14 px-6 text-[22px] border-signal bg-signal text-signal-ink'
export const btnSmall = btnBase + ' min-h-11 px-3.5 text-lg border-ink bg-panel text-ink'
export const btnSmallPrimary = btnBase + ' min-h-11 px-3.5 text-lg border-signal bg-signal text-signal-ink'

// Segmented choice (fuel level, etc.)
export const seg = (on, bad = false) =>
  'flex min-h-[52px] flex-1 min-w-16 cursor-pointer items-center justify-center rounded-[10px] border-2 px-2.5 py-1.5 text-center font-semibold ' +
  (on ? 'border-ink bg-ink text-panel' : (bad ? 'border-danger' : 'border-line') + ' bg-field text-ink')

export const PURPOSE_STYLES = {
  Delivery: { stripe: 'bg-delivery', tag: 'bg-delivery-soft text-delivery', check: 'accent-delivery has-[:checked]:border-delivery' },
  Pickup: { stripe: 'bg-pickup', tag: 'bg-pickup-soft text-pickup', check: 'accent-pickup has-[:checked]:border-pickup' },
  'Drop Trailer': { stripe: 'bg-drop', tag: 'bg-drop-soft text-drop', check: 'accent-drop has-[:checked]:border-drop' },
}

export const tag = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold'

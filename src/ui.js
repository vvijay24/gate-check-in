// Shared class strings. "Calm modern": white cards with a soft shadow on the pale page, slate for
// actions and selection, thin borders, short transitions (turned off for reduced motion in index.css).
export const input =
  'w-full min-h-[52px] rounded-lg border-[1.5px] border-line bg-field px-3 py-2.5 text-[17px] text-ink ' +
  'transition-[border-color,box-shadow] duration-150 focus:border-signal focus:shadow-[0_0_0_4px_rgba(30,47,79,0.15)] focus:outline-none'
export const inputError = ' border-danger'

export const label = 'block text-[15px] font-semibold text-muted'
export const required = 'ml-1 text-danger'
export const errorText = 'text-sm font-semibold text-danger'

// Three tiers: primary (one per area, slate), secondary (white, thin border), ghost (text only, for
// Show all / Clear filters / Close).
const btnBase =
  'inline-flex items-center justify-center gap-2 border-[1.5px] font-display font-bold cursor-pointer ' +
  'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:translate-y-px ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0'
const secondary = ' border-line bg-panel text-ink hover:border-signal-bright hover:bg-signal-tint'
const primary = ' border-signal bg-signal text-signal-ink shadow-raised hover:border-signal-hover hover:bg-signal-hover'
export const btn = btnBase + ' min-h-14 px-6 text-[18px] rounded-xl' + secondary
export const btnPrimary = btnBase + ' min-h-14 px-6 text-[18px] rounded-xl' + primary
export const btnSmall = btnBase + ' min-h-11 px-3.5 text-[15px] rounded-[10px]' + secondary
export const btnSmallPrimary = btnBase + ' min-h-11 px-3.5 text-[15px] rounded-[10px]' + primary
export const btnGhost =
  'inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 font-semibold text-signal cursor-pointer ' +
  'transition-colors duration-150 hover:bg-signal-tint'

// Surfaces. `card` for every panel; `cardHead` is its tinted title strip (use CardHead in
// components/CardHead.jsx); `tile` for headline numbers.
export const card = 'rounded-2xl border border-hair bg-panel shadow-card'
export const cardHead = 'flex items-center gap-3 bg-signal-tint px-5 py-4'
export const tile = 'rounded-2xl border border-hair bg-panel shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised'

// Tables: tinted header, roomy rows with a faint divider and a hover tint.
export const th = 'bg-field px-3.5 py-2.5 text-left text-[13px] font-semibold text-muted'
export const tr = 'border-t border-hair transition-colors duration-150 hover:bg-signal-tint'
export const td = 'px-3.5 py-3'

// Segmented choice (fuel level, etc.): a track with the picked option raised as a white chip.
// `bad`: the question is unanswered after a submit; `danger`: this choice is a problem answer (e.g. a
// failed check), so it shows red once picked.
export const seg = (on, bad = false, danger = false) =>
  'flex min-h-[52px] flex-1 min-w-16 cursor-pointer items-center justify-center gap-2 rounded-[10px] border-[1.5px] px-2.5 py-1.5 text-center font-semibold ' +
  'transition-[background-color,border-color,box-shadow,color] duration-150 ' +
  (on && danger
    ? 'border-danger bg-danger-soft text-danger'
    : on
      ? 'border-signal bg-panel text-ink shadow-raised'
      : (bad ? 'border-danger' : 'border-line') + ' bg-field text-ink hover:border-signal-bright')

export const PURPOSE_STYLES = {
  Pickup: { stripe: 'bg-pickup', tag: 'bg-pickup-soft text-pickup', check: 'accent-pickup has-[:checked]:border-pickup' },
  'Drop Trailer': { stripe: 'bg-drop', tag: 'bg-drop-soft text-drop', check: 'accent-drop has-[:checked]:border-drop' },
}

// Status pill; an icon from icons.jsx may sit before the word (size 14).
export const tag = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold'

// Native <dialog>: rounded, deep shadow, pops in; the backdrop dims and blurs.
export const dialog =
  'm-auto rounded-2xl border border-hair bg-panel p-0 text-ink shadow-overlay open:animate-pop backdrop:bg-[rgba(15,30,58,0.55)] backdrop:backdrop-blur-[3px]'

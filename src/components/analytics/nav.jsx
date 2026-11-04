import { createContext, useContext } from 'react'

// Opens a drill-down page from anywhere in Insights: { kind: 'carrier' | 'customer' | 'dock' | 'visit', id }.
export const InsightsNav = createContext({ open: () => {} })
export const useInsightsNav = () => useContext(InsightsNav)

const KIND_WORD = { carrier: 'carrier', customer: 'customer', dock: 'dock', visit: 'visit' }

// A name that opens its profile. Looks like text in a table until hovered or focused.
export function ProfileLink({ kind, id, children, className = '' }) {
  const { open } = useInsightsNav()
  if (id == null || id === '') return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      onClick={() => open({ kind, id: String(id) })}
      title={`Open this ${KIND_WORD[kind]}`}
      className={
        'cursor-pointer text-left font-bold decoration-signal-line decoration-2 underline-offset-[3px] hover:underline focus-visible:underline ' + className
      }
    >
      {children}
    </button>
  )
}

import { IconChip } from '../icons'

// The tinted title strip at the top of a card: icon chip, title, one-line subtitle, and anything
// passed as children on the right (a count, a toggle, a legend). The card itself needs
// `overflow-hidden` (or rounded corners on this strip) so the tint follows its corners.
export default function CardHead({ icon, title, sub, id, as: H = 'h2', size = 'text-[20px]', className = '', children }) {
  return (
    <div className={'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-2xl bg-signal-tint px-5 py-4 ' + className}>
      {icon && <IconChip name={icon} />}
      <div className="min-w-0 flex-1">
        <H id={id} className={'font-display leading-tight font-bold ' + size}>
          {title}
        </H>
        {sub && <div className="text-sm text-muted">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

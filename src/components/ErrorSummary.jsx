import { Icon } from '../icons'

// Lists every field that stopped the save, each a link that jumps to (and focuses) the field, which
// has the id `field-<name>`. `labels` names the fields; `className` adds spacing where it sits.
// `onJump(name)` runs first, e.g. to open the step a field is on (the Gate's one-panel Check In).
export default function ErrorSummary({ errors, action, summaryRef, labels = {}, className = '', onJump }) {
  const names = Object.keys(errors)
  if (!names.length) return null
  const jump = (ev, name) => {
    ev.preventDefault()
    onJump?.(name)
    // A frame later, so a step opened by onJump has rendered its field.
    requestAnimationFrame(() => {
      const el = document.getElementById(`field-${name}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
    })
  }
  return (
    <div ref={summaryRef} tabIndex={-1} role="alert" className={'animate-pop rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 ' + className}>
      <p className="flex items-center gap-2 font-display text-[18px] leading-tight font-bold text-danger">
        <Icon name="warning" />
        {names.length === 1 ? '1 thing needs' : `${names.length} things need`} fixing before {action}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {names.map((name) => (
          <li key={name}>
            <a href={`#field-${name}`} onClick={(ev) => jump(ev, name)} className="inline-block py-1 font-semibold text-danger underline">
              {labels[name] ?? name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

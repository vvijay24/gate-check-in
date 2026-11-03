import { useId, useState } from 'react'
import * as ui from '../ui'
import { paintOf } from './YardScene'

// Carrier field with suggestions from earlier visits, each with the carrier's paint swatch from the
// yard map, so the name typed here matches the truck drawn there. Typing filters the list; ↓ / ↑ move
// through it, Enter picks, Esc closes. Any new name can still be typed.
export default function CarrierInput({ name, label, value, onChange, required, error, carriers = [], wide, newRow }) {
  const id = `field-${name}`
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = value.trim().toLowerCase()
  const matches = carriers.filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 6)
  const showing = open && matches.length > 0
  const known = carriers.some((c) => c.toLowerCase() === q)

  const pick = (carrier) => {
    onChange({ target: { name, value: carrier } })
    setOpen(false)
    setActive(-1)
  }
  const onKeyDown = (ev) => {
    if (!showing) {
      if (ev.key === 'ArrowDown' && matches.length) {
        setOpen(true)
        setActive(0)
        ev.preventDefault()
      }
      return
    }
    if (ev.key === 'ArrowDown') {
      setActive((a) => (a + 1) % matches.length)
      ev.preventDefault()
    } else if (ev.key === 'ArrowUp') {
      setActive((a) => (a <= 0 ? matches.length - 1 : a - 1))
      ev.preventDefault()
    } else if (ev.key === 'Enter' && active >= 0) {
      pick(matches[active])
      ev.preventDefault()
    } else if (ev.key === 'Escape') {
      setOpen(false)
      ev.preventDefault()
    }
  }

  return (
    <div className={'relative flex min-w-0 flex-col gap-1' + (wide ? ' col-span-full' : '') + (newRow ? ' sm:col-start-1' : '')}>
      <label htmlFor={id} className={ui.label + ' flex items-center gap-1.5'}>
        {label}
        {required && <span className={ui.required + ' ml-0'}>*</span>}
        {known && (
          <span aria-hidden="true" className="ml-1 inline-block h-3 w-3 rounded-full ring-1 ring-line" style={{ background: paintOf(value).color }} />
        )}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(ev) => {
          onChange(ev)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={ui.input + (error ? ui.inputError : '')}
      />
      {showing && (
        <ul id={listId} role="listbox" aria-label="Carriers used before" className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg bg-panel py-1 shadow-raised">
          {matches.map((c, i) => (
            <li
              key={c}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input so the list doesn't close before the pick lands.
              onMouseDown={(ev) => {
                ev.preventDefault()
                pick(c)
              }}
              className={'flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-[17px] ' + (i === active ? 'bg-signal-soft' : 'hover:bg-field')}
            >
              <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full ring-1 ring-line" style={{ background: paintOf(c).color }} />
              {c}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className={ui.errorText}>
          {error}
        </p>
      )}
    </div>
  )
}

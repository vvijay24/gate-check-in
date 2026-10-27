import * as ui from '../ui'

// `disabledOptions` greys out individual choices (buttons or dropdown options) so they can't be picked;
// `optionNotes` adds a note to a choice, e.g. { 'Bay 2': 'In use · 12345' }.
export default function Field({
  name,
  label,
  type = 'text',
  value,
  onChange,
  required,
  error,
  min,
  step,
  wide,
  newRow,
  options,
  disabledOptions = [],
  optionNotes = {},
  placeholder,
  disabled,
  hint,
}) {
  const id = `field-${name}`
  const cls = ui.input + (error ? ui.inputError : '')

  let control
  if (type === 'textarea') {
    control = <textarea id={id} name={name} rows={3} value={value} onChange={onChange} className={cls + ' min-h-[72px] resize-y'} />
  } else if (type === 'select') {
    const allTaken = options.every((o) => disabledOptions.includes(o))
    control = (
      <select id={id} name={name} value={value} onChange={onChange} disabled={disabled} className={cls + ' cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'}>
        <option value="">{allTaken ? 'None free' : placeholder ?? 'Select…'}</option>
        {options.map((o) => (
          <option key={o} value={o} disabled={disabledOptions.includes(o)}>
            {optionNotes[o] ? `${o} — ${optionNotes[o]}` : o}
          </option>
        ))}
      </select>
    )
  } else if (type === 'choice') {
    control = (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.map((lvl, i) => (
          <label
            key={lvl}
            className={
              ui.seg(value === lvl, Boolean(error)) +
              ' has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-signal has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40'
            }
          >
            <input
              id={i === 0 ? id : undefined}
              type="radio"
              name={name}
              value={lvl}
              checked={value === lvl}
              onChange={onChange}
              disabled={disabledOptions.includes(lvl)}
              className="sr-only"
            />
            <span>
              {lvl}
              {optionNotes[lvl] && <span className="block text-[12px] font-normal">{optionNotes[lvl]}</span>}
            </span>
          </label>
        ))}
      </div>
    )
  } else {
    control = (
      <input
        id={id}
        name={name}
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cls + ' disabled:cursor-not-allowed disabled:opacity-50'}
      />
    )
  }

  return (
    <div className={'flex min-w-0 flex-col gap-1' + (wide ? ' col-span-full' : '') + (newRow ? ' sm:col-start-1' : '')}>
      <label id={`${id}-label`} htmlFor={type === 'choice' ? undefined : id} className={ui.label}>
        {label}
        {required && <span className={ui.required}>*</span>}
      </label>
      {control}
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && <p className={ui.errorText}>{error}</p>}
    </div>
  )
}

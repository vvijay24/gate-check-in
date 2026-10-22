import * as ui from '../ui'

export default function Field({ name, label, type = 'text', value, onChange, required, error, min, step, wide, newRow, options }) {
  const id = `field-${name}`
  const cls = ui.input + (error ? ui.inputError : '')

  let control
  if (type === 'textarea') {
    control = <textarea id={id} name={name} rows={3} value={value} onChange={onChange} className={cls + ' min-h-[72px] resize-y'} />
  } else if (type === 'choice') {
    control = (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.map((lvl, i) => (
          <label key={lvl} className={ui.seg(value === lvl, Boolean(error)) + ' has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-signal'}>
            <input
              id={i === 0 ? id : undefined}
              type="radio"
              name={name}
              value={lvl}
              checked={value === lvl}
              onChange={onChange}
              className="sr-only"
            />
            {lvl}
          </label>
        ))}
      </div>
    )
  } else {
    control = <input id={id} name={name} type={type} min={min} step={step} value={value} onChange={onChange} className={cls} />
  }

  return (
    <div className={'flex min-w-0 flex-col gap-1' + (wide ? ' col-span-full' : '') + (newRow ? ' sm:col-start-1' : '')}>
      <label id={`${id}-label`} htmlFor={type === 'choice' ? undefined : id} className={ui.label}>
        {label}
        {required && <span className={ui.required}>*</span>}
      </label>
      {control}
      {error && <p className={ui.errorText}>{error}</p>}
    </div>
  )
}

import { useState } from 'react'
import * as ui from '../ui'

const STARTER_MESSAGES = [
  {
    id: 1,
    sender: 'Shipping',
    initials: 'SH',
    time: '10:24 AM',
    text: 'Good morning! We have a pickup arriving for order 48291. Please send the driver to the waiting area.',
  },
  {
    id: 2,
    sender: 'Gate',
    initials: 'GT',
    time: '10:27 AM',
    text: 'Copy. Driver is checked in. Trailer TR-208 is waiting at the gate.',
  },
  {
    id: 3,
    sender: 'Shipping',
    initials: 'SH',
    time: '10:29 AM',
    text: 'Thanks. Please send TR-208 to dock 3 when it is ready.',
  },
]

export default function Messages() {
  const [messages, setMessages] = useState(STARTER_MESSAGES)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        sender: 'Gate',
        initials: 'GT',
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        text,
      },
    ])
    setDraft('')
  }

  return (
    <section className="no-print fixed right-4 bottom-4 z-30 w-[min(380px,calc(100vw-2rem))]">
      {open ? (
        <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <div className="flex items-center justify-between gap-3 bg-chrome px-4 py-3 text-white">
            <div>
              <h2 className="font-display text-xl leading-tight font-bold">Shipping Department</h2>
              <p className="text-xs text-[#C9D0D5]">Gate operations · UI demo</p>
            </div>
            <button
              type="button"
              aria-label="Minimize messages"
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-2xl leading-none hover:bg-white/10"
            >
              −
            </button>
          </div>

          <div role="note" className="border-b border-line bg-signal/15 px-4 py-2 text-xs font-semibold text-ink">
            Demo only — messages are not delivered or saved.
          </div>

          <div
            aria-live="polite"
            aria-label="Conversation with Shipping Department"
            className="flex max-h-[min(45vh,360px)] min-h-48 flex-col gap-3 overflow-y-auto bg-page px-3 py-4"
          >
            {messages.map((message) => {
              const fromGate = message.sender === 'Gate'
              return (
                <article key={message.id} className={'flex gap-2 ' + (fromGate ? 'flex-row-reverse' : '')}>
                  <span
                    aria-hidden="true"
                    className={
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                      (fromGate ? 'bg-ink text-panel' : 'bg-signal text-signal-ink')
                    }
                  >
                    {message.initials}
                  </span>
                  <div className={'max-w-[85%] ' + (fromGate ? 'text-right' : '')}>
                    <div className="mb-0.5 flex items-baseline gap-2 text-xs">
                      <span className="font-semibold">{message.sender}</span>
                      <time className="text-muted">{message.time}</time>
                    </div>
                    <p
                      className={
                        'whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-left text-sm ' +
                        (fromGate ? 'rounded-tr-sm bg-ink text-panel' : 'rounded-tl-sm border border-line bg-panel')
                      }
                    >
                      {message.text}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-line p-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="message-draft" className="sr-only">
                Message as Gate
              </label>
              <textarea
                id="message-draft"
                rows={2}
                maxLength={500}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type a demo message…"
                className={ui.input + ' min-h-0 resize-y text-base'}
              />
            </div>
            <button type="submit" disabled={!draft.trim()} className={ui.btnSmallPrimary + ' min-h-11 px-3 text-base'}>
              Send
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded="false"
          onClick={() => setOpen(true)}
          className="ml-auto flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 border-signal bg-chrome px-5 font-display text-lg font-bold text-white shadow-xl hover:bg-ink"
        >
          <span aria-hidden="true">●</span>
          Shipping chat
          <span className={ui.tag + ' bg-signal text-signal-ink'}>Demo</span>
        </button>
      )}
    </section>
  )
}

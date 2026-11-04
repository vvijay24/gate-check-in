import { useEffect, useState } from 'react'
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

// Opens and closes the chat from the header, so no floating button covers the boards and forms.
export function ChatButton({ open, onToggle }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="shipping-chat"
      onClick={onToggle}
      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-3 text-[13px] font-medium whitespace-nowrap text-white hover:bg-white/10"
    >
      <span aria-hidden="true" className="hidden h-1.5 w-1.5 rounded-full bg-ok sm:inline-block" />
      <span>
        Chat<span className="hidden sm:inline"> with Shipping</span>
      </span>
      {/* Phones drop the tag to keep the header on one row; the panel itself says it's a demo. */}
      <span className={ui.tag.replace('inline-block', 'hidden sm:inline-block') + ' bg-signal text-signal-ink'}>Demo</span>
    </button>
  )
}

// The chat panel, pinned under the header on the right while `open`. It stays mounted while closed so
// the demo conversation isn't lost.
export default function Messages({ open, onClose }) {
  const [messages, setMessages] = useState(STARTER_MESSAGES)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (ev) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
    <section
      id="shipping-chat"
      aria-label="Shipping chat"
      hidden={!open}
      className="no-print fixed top-[calc(var(--header-h,114px)+12px)] right-4 z-30 w-[min(380px,calc(100vw-2rem))]"
    >
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between gap-3 bg-chrome px-4 py-3 text-white">
          <div>
            <h2 className="font-display text-[16px] leading-tight font-semibold">Shipping Department</h2>
            <p className="text-xs text-[#C9D0D5]">Gate operations · UI demo</p>
          </div>
          <button
            type="button"
            aria-label="Close chat"
            onClick={onClose}
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
    </section>
  )
}

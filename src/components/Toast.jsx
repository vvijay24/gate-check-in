// Pop-up message under the header, in place of the old banner at the top of the page: a check that
// draws itself for a success, a red cross for a problem (a failed inspection). It leaves after a few
// seconds or when closed. Screen readers hear it through role="status".
export default function Toast({ notice, onClose }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print pointer-events-none fixed top-[calc(var(--header-h,72px)+12px)] left-1/2 z-40 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2"
    >
      {notice && (
        <div
          key={notice.id}
          className="toast-in pointer-events-auto flex items-center gap-3 rounded-xl bg-chrome py-2.5 pr-2 pl-3 text-white shadow-raised"
        >
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
            <circle cx="15" cy="15" r="14" fill={notice.tone === 'fail' ? 'var(--color-danger)' : 'var(--color-ok)'} />
            {notice.tone === 'fail' ? (
              <path className="draw" d="M10 10 L20 20 M20 10 L10 20" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
            ) : (
              <path className="draw" d="M8.5 15.5 L13 20 L21.5 10.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          <p className="min-w-0 flex-1 font-semibold">{notice.text}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss message"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-lg text-rail-text hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

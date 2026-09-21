import { useEffect, useId, useRef, useState } from 'react'

/**
 * A small "what does this mean?" button next to a term. Written for someone who
 * doesn't do bookkeeping — every explainer is a plain sentence, not a
 * definition. Opens on click (not hover) so it works on a phone too.
 */
export function Explain({ children, label }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="explain" ref={ref}>
      <button
        type="button"
        className="explain-btn"
        aria-label={label ?? 'What does this mean?'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span className="explain-pop" id={id} role="note">
          {children}
        </span>
      )}
    </span>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Option<T extends string> = { value: T; label: string }

export function MenuSelect<T extends string>(props: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  label?: string
  width?: number
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; direction: 'down' | 'up'; maxHeight: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const selectedLabel = useMemo(() => {
    const found = props.options.find((o) => o.value === props.value)
    if (found) return found.label
    return props.placeholder ?? String(props.value)
  }, [props.options, props.value, props.placeholder])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      const btn = buttonRef.current
      const panel = panelRef.current
      if (btn?.contains(target)) return
      if (panel?.contains(target)) return
      setOpen(false)
    }
    function onScroll(e: Event) {
      const target = e.target as Node | null
      const panel = panelRef.current
      if (target && panel?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  function toggleMenu() {
    if (open) {
      setOpen(false)
      return
    }
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = props.width ?? Math.max(220, Math.round(r.width))
    const margin = 10
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin))
    const belowTop = r.bottom + 6
    const aboveTop = r.top - 6
    const availableBelow = window.innerHeight - belowTop - margin
    const availableAbove = aboveTop - margin
    const direction: 'down' | 'up' = availableBelow >= 220 || availableBelow >= availableAbove ? 'down' : 'up'
    const maxHeight = Math.max(160, Math.min(520, direction === 'down' ? availableBelow : availableAbove))
    setPos({ left, top: direction === 'down' ? belowTop : aboveTop, width, direction, maxHeight })
    setOpen(true)
  }

  return (
    <>
      <button type="button" className="menuButton" onClick={toggleMenu} ref={buttonRef}>
        {props.label ? `${props.label}: ` : ''}
        {selectedLabel}
        <span className="menuChevron">▾</span>
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div className="menuOverlay">
              <div
                className="menuPanel"
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: pos.width,
                  maxHeight: pos.maxHeight,
                  transform: pos.direction === 'up' ? 'translateY(-100%)' : undefined,
                }}
                ref={panelRef}
              >
                {props.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={o.value === props.value ? 'menuOption active' : 'menuOption'}
                    onClick={() => {
                      props.onChange(o.value)
                      setOpen(false)
                    }}
                  >
                    <span className="menuOptionText">{o.label}</span>
                    {o.value === props.value ? <span className="menuCheck">✓</span> : <span className="menuCheck" />}
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

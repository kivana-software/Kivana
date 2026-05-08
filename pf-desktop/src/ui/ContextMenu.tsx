import { useEffect, useMemo, useRef, useState } from 'react'

export type ContextMenuItem =
  | { id: string; label: string; tone?: 'default' | 'danger'; disabled?: boolean; onSelect: () => void }
  | { id: string; kind: 'separator' }

export function useContextMenu(items: ContextMenuItem[]) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const isOpen = pos != null
  const menuRef = useRef<HTMLDivElement | null>(null)

  const normalized = useMemo(() => items, [items])

  useEffect(() => {
    if (!isOpen) return
    const raf = window.requestAnimationFrame(() => {
      const el = menuRef.current
      if (!el || !pos) return
      const r = el.getBoundingClientRect()
      const margin = 10
      let x = pos.x
      let y = pos.y

      if (r.right > window.innerWidth - margin) x -= r.right - (window.innerWidth - margin)
      if (r.left < margin) x += margin - r.left
      if (r.bottom > window.innerHeight - margin) y -= r.bottom - (window.innerHeight - margin)
      if (r.top < margin) y += margin - r.top

      if (x !== pos.x || y !== pos.y) setPos({ x, y })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, pos])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPos(null)
    }
    function onDown(e: MouseEvent) {
      const el = menuRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setPos(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [isOpen])

  function open(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'contextmenu') {
      setPos({ x: e.clientX, y: e.clientY })
      return
    }
    const target = e.currentTarget as HTMLElement | null
    if (!target || typeof target.getBoundingClientRect !== 'function') {
      setPos({ x: e.clientX, y: e.clientY })
      return
    }
    const r = target.getBoundingClientRect()
    setPos({ x: r.left, y: r.bottom + 6 })
  }

  function close() {
    setPos(null)
  }

  const Menu = isOpen ? (
    <div className="ctxOverlay">
      <div
        className="ctxMenu"
        ref={menuRef}
        style={{
          left: pos!.x,
          top: pos!.y,
        }}
      >
        {normalized.map((it) => {
          if ((it as any).kind === 'separator') return <div key={it.id} className="ctxSep" />
          const item = it as Exclude<ContextMenuItem, { kind: 'separator'; id: string }>
          return (
            <button
              key={item.id}
              type="button"
              className={item.tone === 'danger' ? 'ctxItem danger' : 'ctxItem'}
              disabled={Boolean(item.disabled)}
              onClick={() => {
                close()
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  ) : null

  return { open, close, Menu }
}

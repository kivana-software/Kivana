import { useEffect, useRef, useState } from 'react'
import { isTauriRuntime } from '../storage/tauriJsonStore'

type AvailableUpdate = {
  version: string
  body?: string | null
  date?: string | null
  downloadAndInstall: () => Promise<void>
}

export function UpdateWatcher() {
  const promptInFlightRef = useRef(false)
  const checkInFlightRef = useRef(false)
  const [pending, setPending] = useState<AvailableUpdate | null>(null)
  const [installing, setInstalling] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!isTauriRuntime()) return

    const tenMinutesMs = 10 * 60 * 1000
    const remainder = Date.now() % tenMinutesMs
    const delayToNextBoundary = remainder === 0 ? tenMinutesMs : tenMinutesMs - remainder

    let intervalId: number | null = null

    async function runCheck() {
      if (checkInFlightRef.current) return
      checkInFlightRef.current = true
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = (await check()) as AvailableUpdate | null
        if (!update) return
        if (promptInFlightRef.current) return
        const seen = localStorage.getItem('Kivana/lastUpdatePromptVersion') ?? ''
        if (seen === update.version) return
        localStorage.setItem('Kivana/lastUpdatePromptVersion', update.version)
        promptInFlightRef.current = true
        setStatus('')
        setPending(update)
      } catch {
        return
      } finally {
        checkInFlightRef.current = false
      }
    }

    const timeoutId = window.setTimeout(() => {
      void runCheck()
      intervalId = window.setInterval(() => {
        void runCheck()
      }, tenMinutesMs)
    }, delayToNextBoundary)

    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [])

  async function install() {
    if (!pending || installing) return
    setInstalling(true)
    setStatus('Downloading…')
    try {
      await pending.downloadAndInstall()
      setStatus('Update installed. Restart Kivana to finish.')
    } catch (e: any) {
      setStatus(`Update failed: ${String(e?.message ?? e)}`)
    } finally {
      setInstalling(false)
    }
  }

  if (!pending) return null

  return (
    <div
      className="modalBackdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setPending(null)
          promptInFlightRef.current = false
        }
      }}
    >
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(720px, calc(100vw - 32px))' }}>
        <div className="modalTitle">Update available</div>
        <div className="note" style={{ marginTop: 6 }}>
          Kivana {pending.version} is available.
        </div>
        {pending.body ? (
          <div className="groupBox" style={{ marginTop: 12, maxHeight: 280, overflow: 'auto' }}>
            <div className="groupTitle">What’s new</div>
            <div className="note" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>
              {String(pending.body)}
            </div>
          </div>
        ) : null}
        <div className="rowActions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => {
              setPending(null)
              promptInFlightRef.current = false
            }}
          >
            Later
          </button>
          <button type="button" onClick={() => void install()} className="btnPrimary" disabled={installing}>
            {installing ? 'Installing…' : 'Download & install'}
          </button>
        </div>
        {status ? <div className="note" style={{ marginTop: 10 }}>{status}</div> : null}
      </div>
    </div>
  )
}

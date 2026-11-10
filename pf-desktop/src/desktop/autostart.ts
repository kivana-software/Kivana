import { isTauriRuntime } from '../storage/tauriJsonStore'

export async function applyAutostart(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return
  const mod = await import('@tauri-apps/plugin-autostart')
  if (enabled) {
    await mod.enable()
  } else {
    await mod.disable()
  }
}


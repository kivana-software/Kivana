import type { LoadedDatasets } from '../storage/localJsonStore'
import { decodeBackupToDatasets, encodeBackup } from '../storage/backup'
import { isTauriRuntime } from '../storage/tauriJsonStore'
import type { AppAction } from '../app/appStore'

export async function exportBackup(datasets: LoadedDatasets): Promise<string> {
  const json = encodeBackup(datasets)

  if (!isTauriRuntime()) {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Kivana_Backup.json'
    a.click()
    URL.revokeObjectURL(url)
    return 'Exported JSON.'
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  const { invoke } = await import('@tauri-apps/api/core')
  const df = new Date()
  const stamp = `${df.getFullYear()}-${String(df.getMonth() + 1).padStart(2, '0')}-${String(df.getDate()).padStart(2, '0')}_${String(df.getHours()).padStart(2, '0')}-${String(df.getMinutes()).padStart(2, '0')}`
  const defaultName = `Kivana_Backup_${stamp}.pfbackup`
  const path = await save({ defaultPath: defaultName })
  if (!path) return 'Export cancelled.'
  await invoke('export_backup', {
    bundleDirPath: path,
    backupJson: json,
    attachmentPaths: [],
  })
  return 'Export complete.'
}

export async function importBackupFromJson(dispatch: (a: AppAction) => void): Promise<string> {
  if (!isTauriRuntime()) return 'Import requires the desktop app (Tauri).'
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { invoke } = await import('@tauri-apps/api/core')
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Backup', extensions: ['json', 'pfbackup'] }],
  })
  if (!path || Array.isArray(path)) return 'Import cancelled.'
  const source = (await invoke('read_backup_source', { path })) as { json: string }
  const decoded = decodeBackupToDatasets(source.json)
  dispatch({ type: 'data/replaceAll', data: decoded.datasets })
  clearSelections(dispatch)
  return `Imported backup v${decoded.version}.`
}

function clearSelections(dispatch: (a: AppAction) => void) {
  dispatch({ type: 'ui/selectBill', id: null })
  dispatch({ type: 'ui/selectAccount', id: null })
  dispatch({ type: 'ui/selectTransaction', id: null })
}

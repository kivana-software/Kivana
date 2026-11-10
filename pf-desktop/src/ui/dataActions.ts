import type { LoadedDatasets } from '../storage/localJsonStore'
import { attachmentPathsForBackup, decodeBackupToDatasets, encodeBackupV2 } from '../storage/backup'
import { isTauriRuntime } from '../storage/tauriJsonStore'
import type { AppAction } from '../app/appStore'
import { normalizePeopleSettings } from '../domain/people'

export async function exportBackup(datasets: LoadedDatasets): Promise<{ message: string; backupPath?: string }> {
  const json = encodeBackupV2(datasets)
  const attachmentPaths = attachmentPathsForBackup(datasets)

  if (!isTauriRuntime()) {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Kivana_Backup.json'
    a.click()
    URL.revokeObjectURL(url)
    return { message: 'Exported JSON (web mode).' }
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  const { invoke } = await import('@tauri-apps/api/core')
  const df = new Date()
  const stamp = `${df.getFullYear()}-${String(df.getMonth() + 1).padStart(2, '0')}-${String(df.getDate()).padStart(2, '0')}_${String(df.getHours()).padStart(2, '0')}-${String(df.getMinutes()).padStart(2, '0')}`
  const defaultName = `Kivana_Backup_${stamp}.pfbackup`
  const path = await save({ defaultPath: defaultName })
  if (!path) return { message: 'Export cancelled.' }
  await invoke('export_backup', {
    bundleDirPath: path,
    backupJson: json,
    attachmentPaths: attachmentPaths,
  })
  return { message: 'Export complete.', backupPath: path }
}

export async function exportAutoBackup(params: {
  datasets: LoadedDatasets
  keepCount: number
}): Promise<{ message: string; backupPath?: string }> {
  if (!isTauriRuntime()) return { message: 'Auto backup requires the desktop app (Tauri).' }
  const json = encodeBackupV2(params.datasets)
  const attachmentPaths = attachmentPathsForBackup(params.datasets)
  const { invoke } = await import('@tauri-apps/api/core')
  const out = (await invoke('create_auto_backup', {
    backupJson: json,
    attachmentPaths,
    keepCount: params.keepCount,
  })) as { path: string }
  return { message: 'Auto backup complete.', backupPath: out?.path }
}

export async function listAutoBackups(): Promise<
  Array<{ path: string; name: string; modifiedAtMs: number }>
> {
  if (!isTauriRuntime()) return []
  const { invoke } = await import('@tauri-apps/api/core')
  const list = (await invoke('list_auto_backups')) as Array<{ path: string; name: string; modifiedAtMs: number }>
  return Array.isArray(list) ? list : []
}

export async function deleteAutoBackup(path: string): Promise<string> {
  if (!isTauriRuntime()) return 'Desktop only.'
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('delete_auto_backup', { path })
  return 'Deleted.'
}

export async function importBackupFromPath(dispatch: (a: AppAction) => void, path: string, currentDatasets?: LoadedDatasets): Promise<string> {
  if (!isTauriRuntime()) return 'Import requires the desktop app (Tauri).'
  const { invoke } = await import('@tauri-apps/api/core')
  const source = (await invoke('read_backup_source', { path })) as { json: string; attachments_source_dir: string | null }
  const decoded = decodeBackupToDatasets(source.json)
  const current = currentDatasets ? { ...currentDatasets, settings: normalizePeopleSettings(currentDatasets.settings) } : null
  const shouldOfferPersonImport = Boolean(current && current.settings.peopleEnabled)
  if (shouldOfferPersonImport) {
    const ok = window.confirm('Import this backup into the currently selected person (merge transactions) instead of replacing all data?')
    if (ok) {
      const existingIds = new Set(current!.transactions.map((t) => t.id))
      const pid = current!.settings.activePersonId
      const imported = decoded.datasets.transactions.map((t) => {
        const id = existingIds.has(t.id) ? crypto.randomUUID() : t.id
        existingIds.add(id)
        return { ...t, id, personId: pid }
      })
      dispatch({ type: 'data/replaceAll', data: { ...current!, transactions: [...current!.transactions, ...imported] } })
      clearSelections(dispatch)
      return `Imported backup v${decoded.version} into current person.`
    }
  }
  if (source.attachments_source_dir) {
    await invoke('restore_attachments_from', { sourceRootDir: source.attachments_source_dir })
  }
  dispatch({ type: 'data/replaceAll', data: decoded.datasets })
  clearSelections(dispatch)
  return `Imported backup v${decoded.version}.`
}

export async function importBackupFromJson(dispatch: (a: AppAction) => void, currentDatasets?: LoadedDatasets): Promise<string> {
  if (!isTauriRuntime()) return 'Import requires the desktop app (Tauri).'
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { invoke } = await import('@tauri-apps/api/core')
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Backup', extensions: ['json'] }],
  })
  if (!path || Array.isArray(path)) return 'Import cancelled.'
  const source = (await invoke('read_backup_source', { path })) as { json: string; attachments_source_dir: string | null }
  const decoded = decodeBackupToDatasets(source.json)
  const current = currentDatasets ? { ...currentDatasets, settings: normalizePeopleSettings(currentDatasets.settings) } : null
  const shouldOfferPersonImport = Boolean(current && current.settings.peopleEnabled)
  if (shouldOfferPersonImport) {
    const ok = window.confirm('Import this backup into the currently selected person (merge transactions) instead of replacing all data?')
    if (ok) {
      const existingIds = new Set(current!.transactions.map((t) => t.id))
      const pid = current!.settings.activePersonId
      const imported = decoded.datasets.transactions.map((t) => {
        const id = existingIds.has(t.id) ? crypto.randomUUID() : t.id
        existingIds.add(id)
        return { ...t, id, personId: pid }
      })
      dispatch({ type: 'data/replaceAll', data: { ...current!, transactions: [...current!.transactions, ...imported] } })
      clearSelections(dispatch)
      return `Imported backup v${decoded.version} into current person.`
    }
  }
  dispatch({ type: 'data/replaceAll', data: decoded.datasets })
  clearSelections(dispatch)
  return `Imported backup v${decoded.version}.`
}

export async function importBackupFromFolder(dispatch: (a: AppAction) => void, currentDatasets?: LoadedDatasets): Promise<string> {
  if (!isTauriRuntime()) return 'Import requires the desktop app (Tauri).'
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { invoke } = await import('@tauri-apps/api/core')
  const dir = await open({ multiple: false, directory: true })
  if (!dir || Array.isArray(dir)) return 'Import cancelled.'
  const source = (await invoke('read_backup_source', { path: dir })) as { json: string; attachments_source_dir: string | null }
  const decoded = decodeBackupToDatasets(source.json)
  const current = currentDatasets ? { ...currentDatasets, settings: normalizePeopleSettings(currentDatasets.settings) } : null
  const shouldOfferPersonImport = Boolean(current && current.settings.peopleEnabled)
  if (shouldOfferPersonImport) {
    const ok = window.confirm('Import this backup into the currently selected person (merge transactions) instead of replacing all data?')
    if (ok) {
      const existingIds = new Set(current!.transactions.map((t) => t.id))
      const pid = current!.settings.activePersonId
      const imported = decoded.datasets.transactions.map((t) => {
        const id = existingIds.has(t.id) ? crypto.randomUUID() : t.id
        existingIds.add(id)
        return { ...t, id, personId: pid }
      })
      dispatch({ type: 'data/replaceAll', data: { ...current!, transactions: [...current!.transactions, ...imported] } })
      clearSelections(dispatch)
      return `Imported backup v${decoded.version} into current person.`
    }
  }
  if (source.attachments_source_dir) {
    await invoke('restore_attachments_from', { sourceRootDir: source.attachments_source_dir })
  }
  dispatch({ type: 'data/replaceAll', data: decoded.datasets })
  clearSelections(dispatch)
  return `Imported backup v${decoded.version}.`
}

function clearSelections(dispatch: (a: AppAction) => void) {
  dispatch({ type: 'ui/selectBill', id: null })
  dispatch({ type: 'ui/selectIncome', id: null })
  dispatch({ type: 'ui/selectAccount', id: null })
  dispatch({ type: 'ui/selectTransaction', id: null })
  dispatch({ type: 'ui/selectGoal', id: null })
  dispatch({ type: 'ui/selectDebt', id: null })
}

import type { AICommand } from '../ai/commands'
import { isTauriRuntime } from './tauriJsonStore'

export interface CommandMemoryItem {
  id: string
  createdAt: string
  input: string
  command: AICommand
  raw: string
  favorite: boolean
}

export interface CommandMemory {
  version: 1
  items: CommandMemoryItem[]
}

const FILE_NAME = 'command_memory.json'
const STORAGE_KEY = 'Kivana/command_memory.json'

export async function loadCommandMemory(): Promise<CommandMemory> {
  const fallback: CommandMemory = { version: 1, items: [] }
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const text = (await invoke('read_data_file', { name: FILE_NAME })) as string | null
    if (!text) return fallback
    try {
      return normalizeMemory(JSON.parse(text))
    } catch {
      await invoke('preserve_corrupt_file', { name: FILE_NAME })
      return fallback
    }
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return fallback
  try {
    return normalizeMemory(JSON.parse(raw))
  } catch {
    try {
      localStorage.setItem(`${STORAGE_KEY}.corrupt-${Date.now()}`, raw)
    } catch {
    }
    return fallback
  }
}

export async function saveCommandMemory(mem: CommandMemory): Promise<void> {
  const text = JSON.stringify(mem, null, 2)
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('write_data_file', { name: FILE_NAME, content: text })
    return
  }
  localStorage.setItem(STORAGE_KEY, text)
}

function normalizeMemory(x: any): CommandMemory {
  if (!x || typeof x !== 'object') return { version: 1, items: [] }
  const items = Array.isArray(x.items) ? x.items : []
  const normalized: CommandMemoryItem[] = items
    .map((i: any) => ({
      id: String(i.id ?? crypto.randomUUID()),
      createdAt: String(i.createdAt ?? new Date().toISOString()),
      input: String(i.input ?? ''),
      command: (i.command ?? { type: 'unknown', payload: { message: 'Missing' } }) as AICommand,
      raw: String(i.raw ?? ''),
      favorite: Boolean(i.favorite ?? false),
    }))
    .filter((i: CommandMemoryItem) => i.input.trim().length > 0)
  return { version: 1, items: normalized }
}


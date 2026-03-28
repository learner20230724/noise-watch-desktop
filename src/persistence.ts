import type { PersistenceSnapshot } from './types'

export async function writeSnapshot(snapshot: PersistenceSnapshot) {
  if (!window.desktopAPI?.writeSnapshot) {
    return { filePath: '' }
  }
  return window.desktopAPI.writeSnapshot(snapshot)
}

export async function exportCsv(snapshot: PersistenceSnapshot) {
  if (!window.desktopAPI?.exportCsv) {
    return { filePath: '' }
  }
  return window.desktopAPI.exportCsv(snapshot)
}

export function createSnapshot(params: Omit<PersistenceSnapshot, 'updatedAt'>): PersistenceSnapshot {
  return {
    updatedAt: new Date().toISOString(),
    ...params,
  }
}

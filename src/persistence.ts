import { defaultSettings } from './appLogic'
import type { FrequencyBand, MonitoringSettings, PersistenceSnapshot } from './types'

const settingsStorageKey = 'noise-watch-settings'
const validBands: FrequencyBand[] = ['low', 'mid', 'high']

export function loadSettings(): MonitoringSettings {
  const defaults = defaultSettings()
  try {
    const saved = JSON.parse(localStorage.getItem(settingsStorageKey) ?? '{}')
    const bands = Array.isArray(saved.frequencyBands)
      ? saved.frequencyBands.filter((band: string): band is FrequencyBand => validBands.includes(band as FrequencyBand))
      : []
    return { ...defaults, ...saved, frequencyBands: bands.length > 0 ? bands : defaults.frequencyBands }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: MonitoringSettings) {
  try {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  } catch {
    // Storage may be unavailable; settings simply won't persist.
  }
}

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

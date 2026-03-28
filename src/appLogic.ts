import type { DeviceOption, EventLog, FrequencyBand, MonitoringSettings, MonitoringStats } from './types'
import { bandRangeText, t } from './i18n'

const bandRanges: Record<FrequencyBand, [number, number]> = {
  low: [20, 200],
  mid: [200, 2000],
  high: [2000, 8000],
}

function formatTwo(n: number) {
  return n.toString().padStart(2, '0')
}

function clampDb(value: number) {
  if (!Number.isFinite(value)) return -120
  return Math.max(-120, Math.min(0, value))
}

export function formatElapsed(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${formatTwo(h)}:${formatTwo(m)}:${formatTwo(s)}`
}

export function defaultSettings(): MonitoringSettings {
  return {
    inputDeviceId: 'default',
    alertAudioName: '',
    alertAudioPath: '',
    language: 'zh',
    frequencyBand: 'low',
    threshold: -35,
    triggerCount: 3,
    timeWindowSeconds: 4,
    cooldownSeconds: 5,
  }
}

export function createInitialStats(language: 'zh' | 'en'): MonitoringStats {
  const copy = t(language)
  return {
    lowBandDb: -120,
    midBandDb: -120,
    highBandDb: -120,
    peakDb: -120,
    selectedBandDb: -120,
    impactCount: 0,
    triggerCount: 0,
    elapsedSeconds: 0,
    lastEventAt: null,
    statusTextZh: copy.ready,
    statusTextEn: t('en').ready,
  }
}

export function humanBand(band: FrequencyBand, language: 'zh' | 'en') {
  const copy = t(language)
  const label = band === 'low' ? copy.low : band === 'mid' ? copy.mid : copy.high
  const range = bandRangeText[band][language]
  return `${label} (${range})`
}

export function deviceLabel(d: MediaDeviceInfo): string {
  if (d.label && d.label.trim()) return d.label
  return d.deviceId === 'default' ? 'Default' : `Device ${d.deviceId.slice(0, 6)}`
}

export async function listAudioInputDevices(): Promise<DeviceOption[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ id: d.deviceId, label: deviceLabel(d) }))
}

export function createLogEvent(params: {
  band: FrequencyBand
  peakDb: number
  selectedBandDb: number
  threshold: number
  impactCount: number
  triggered: boolean
  messageZh: string
  messageEn: string
}): EventLog {
  const now = new Date()
  const id = `${now.getTime()}-${Math.random().toString(16).slice(2)}`
  return {
    id,
    timestamp: now.toISOString(),
    ...params,
  }
}

export function calculateBandLevels(
  frequencyData: Float32Array,
  sampleRate: number,
  fftSize: number,
) {
  const nyquist = sampleRate / 2
  const binWidth = nyquist / frequencyData.length

  function maxDbInRange(minFreq: number, maxFreq: number) {
    const startIndex = Math.max(0, Math.floor(minFreq / binWidth))
    const endIndex = Math.min(frequencyData.length - 1, Math.ceil(maxFreq / binWidth))

    let max = -120
    for (let i = startIndex; i <= endIndex; i += 1) {
      max = Math.max(max, frequencyData[i] ?? -120)
    }
    return clampDb(max)
  }

  return {
    low: maxDbInRange(...bandRanges.low),
    mid: maxDbInRange(...bandRanges.mid),
    high: maxDbInRange(...bandRanges.high),
    peak: clampDb(Math.max(...frequencyData)),
    fftSize,
  }
}

export function selectedBandDb(
  band: FrequencyBand,
  levels: { low: number; mid: number; high: number },
) {
  if (band === 'low') return levels.low
  if (band === 'mid') return levels.mid
  return levels.high
}

export function bandToPercent(db: number) {
  return Math.max(0, Math.min(100, ((db + 120) / 120) * 100))
}

export function toFileUrl(filePath: string) {
  if (!filePath) return ''
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/')) {
    return encodeURI(`file://${normalized}`)
  }
  return encodeURI(`file:///${normalized}`)
}

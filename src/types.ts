export type Language = 'zh' | 'en'
export type FrequencyBand = 'low' | 'mid' | 'high'

export type DeviceOption = {
  id: string
  label: string
}

export type MonitoringSettings = {
  inputDeviceId: string
  alertAudioName: string
  alertAudioPath: string
  alertVolumePercent: number
  language: Language
  frequencyBand: FrequencyBand
  threshold: number
  triggerCount: number
  timeWindowSeconds: number
  cooldownSeconds: number
}

export type MonitoringStats = {
  lowBandDb: number
  midBandDb: number
  highBandDb: number
  peakDb: number
  selectedBandDb: number
  impactCount: number
  triggerCount: number
  elapsedSeconds: number
  lastEventAt: string | null
  statusTextZh: string
  statusTextEn: string
}

export type EventLog = {
  id: string
  timestamp: string
  band: FrequencyBand
  peakDb: number
  selectedBandDb: number
  threshold: number
  impactCount: number
  triggered: boolean
  messageZh: string
  messageEn: string
}

export type AppPaths = {
  userDataPath: string
  exportDir: string
  eventsDir: string
}

export type PersistenceSnapshot = {
  updatedAt: string
  settings: MonitoringSettings
  stats: MonitoringStats
  logs: EventLog[]
}

declare global {
  interface Window {
    desktopAPI?: {
      getPaths: () => Promise<AppPaths>
      chooseAlertAudio: () => Promise<{ filePath: string; fileName: string; audioUrl: string } | null>
      writeSnapshot: (snapshot: PersistenceSnapshot) => Promise<{ filePath: string }>
      exportCsv: (snapshot: PersistenceSnapshot) => Promise<{ filePath: string }>
    }
  }
}

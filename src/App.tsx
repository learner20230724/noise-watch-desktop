import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  bandToPercent,
  calculateBandLevels,
  createInitialStats,
  createLogEvent,
  defaultSettings,
  formatElapsed,
  listAudioInputDevices,
  selectedBandDb,
  alertGainFromPercent,
} from './appLogic'
import { createSnapshot, exportCsv, writeSnapshot } from './persistence'
import { bandRangeText, t } from './i18n'
import { RadioPill } from './components/RadioPill'
import { SectionCard } from './components/SectionCard'
import { SelectRow } from './components/SelectRow'
import { SliderRow } from './components/SliderRow'
import type { DeviceOption, EventLog, FrequencyBand, MonitoringSettings, MonitoringStats } from './types'

const fallbackDevices: DeviceOption[] = [
  { id: 'default', label: '[Default] System Microphone' },
  { id: 'usb-mic', label: '[USB] Wireless Microphone RX' },
]

const maxLogs = 200
const waveformHistoryLength = 48
const waveformUpdateInterval = 4
const alertAudioLoadTimeoutMs = 5000
const defaultAlertToneStepMs = 140
const defaultAlertToneSequence = [880, 1175, 1568]

function createEmptyWaveformHistory() {
  return Array.from({ length: waveformHistoryLength }, () => 0)
}

type AlertAudioSelection = {
  filePath: string
  fileName: string
  audioUrl: string
}

function App() {
  const [settings, setSettings] = useState<MonitoringSettings>(defaultSettings)
  const [devices, setDevices] = useState<DeviceOption[]>(fallbackDevices)
  const [stats, setStats] = useState<MonitoringStats>(() => createInitialStats('zh'))
  const [logs, setLogs] = useState<EventLog[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [lastJsonPath, setLastJsonPath] = useState('')
  const [lastCsvPath, setLastCsvPath] = useState('')
  const [, setWaveformVersion] = useState(0)

  const settingsRef = useRef(settings)
  const statsRef = useRef(stats)
  const pendingAlertSetupRef = useRef<Promise<void> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const impactTimesRef = useRef<number[]>([])
  const lastAboveThresholdRef = useRef(false)
  const cooldownUntilRef = useRef(0)
  const alertAudioRef = useRef<HTMLAudioElement | null>(null)
  const alertAudioContextRef = useRef<AudioContext | null>(null)
  const alertAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const alertAudioGainRef = useRef<GainNode | null>(null)
  const alertAudioFilePathRef = useRef('')
  const alertAudioUrlRef = useRef('')
  const alertAudioSetupSeqRef = useRef(0)
  const alertToneTimeoutsRef = useRef<number[]>([])
  const alertToneOscillatorsRef = useRef<OscillatorNode[]>([])
  const waveformHistoryRef = useRef<number[]>(createEmptyWaveformHistory())
  const waveformFrameCountRef = useRef(0)

  const copy = useMemo(() => t(settings.language), [settings.language])
  const bandOptions = [
    { label: `${copy.low} (${bandRangeText.low[settings.language]})`, value: 'low' },
    { label: `${copy.mid} (${bandRangeText.mid[settings.language]})`, value: 'mid' },
    { label: `${copy.high} (${bandRangeText.high[settings.language]})`, value: 'high' },
  ]

  const pushLog = useCallback((log: EventLog) => {
    setLogs((prev) => [log, ...prev].slice(0, maxLogs))
  }, [])

  const resetWaveformHistory = useCallback(() => {
    waveformHistoryRef.current = createEmptyWaveformHistory()
    waveformFrameCountRef.current = 0
    setWaveformVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  const stopDefaultAlertTone = useCallback(() => {
    alertToneTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    alertToneTimeoutsRef.current = []

    alertToneOscillatorsRef.current.forEach((oscillator) => {
      try {
        oscillator.stop()
      } catch {
        // Ignore already stopped oscillators.
      }
      oscillator.disconnect()
    })
    alertToneOscillatorsRef.current = []
  }, [])

  const clearAlertAudio = useCallback(async () => {
    pendingAlertSetupRef.current = null
    stopDefaultAlertTone()
    const audio = alertAudioRef.current
    const source = alertAudioSourceRef.current
    const gain = alertAudioGainRef.current
    const context = alertAudioContextRef.current

    alertAudioRef.current = null
    alertAudioContextRef.current = null
    alertAudioSourceRef.current = null
    alertAudioGainRef.current = null
    alertAudioFilePathRef.current = ''
    alertAudioUrlRef.current = ''

    audio?.pause()
    if (audio) {
      audio.removeAttribute('src')
      audio.load()
    }
    source?.disconnect()
    gain?.disconnect()

    if (context && context.state !== 'closed') {
      await context.close()
    }
  }, [stopDefaultAlertTone])

  function clearAlertAudioSelection() {
    setSettings((prev) => {
      if (!prev.alertAudioName && !prev.alertAudioPath) return prev
      return {
        ...prev,
        alertAudioName: '',
        alertAudioPath: '',
      }
    })
  }

  async function invalidateAlertAudio() {
    await clearAlertAudio()
    clearAlertAudioSelection()
  }

  async function ensureAlertAudioReady(selection: AlertAudioSelection) {
    const currentPath = alertAudioFilePathRef.current
    if (currentPath === selection.filePath && alertAudioContextRef.current && alertAudioGainRef.current) {
      return
    }

    if (pendingAlertSetupRef.current) {
      await pendingAlertSetupRef.current
      const readyPath = alertAudioFilePathRef.current
      if (readyPath === selection.filePath && alertAudioContextRef.current && alertAudioGainRef.current) {
        return
      }
    }

    const setupSeq = ++alertAudioSetupSeqRef.current
    const setupPromise = (async () => {
      await clearAlertAudio()
      if (setupSeq !== alertAudioSetupSeqRef.current) {
        return
      }

      const audio = new Audio(selection.audioUrl)
      audio.preload = 'auto'
      audio.volume = 1

      let context: AudioContext | null = null
      let source: MediaElementAudioSourceNode | null = null
      let gain: GainNode | null = null

      try {
        context = new AudioContext()
        source = context.createMediaElementSource(audio)
        gain = context.createGain()
        gain.gain.value = alertGainFromPercent(settingsRef.current.alertVolumePercent)
        source.connect(gain)
        gain.connect(context.destination)

        await new Promise<void>((resolve, reject) => {
          let settled = false
          const cleanup = () => {
            window.clearTimeout(timeoutId)
            audio.removeEventListener('loadedmetadata', handleReady)
            audio.removeEventListener('canplaythrough', handleReady)
            audio.removeEventListener('error', handleError)
          }
          const finish = (callback: () => void) => {
            if (settled) return
            settled = true
            cleanup()
            callback()
          }
          const handleReady = () => {
            finish(resolve)
          }
          const handleError = () => {
            finish(() => reject(new Error('Failed to load alert audio.')))
          }
          const timeoutId = window.setTimeout(() => {
            finish(() => reject(new Error('Timed out while loading alert audio.')))
          }, alertAudioLoadTimeoutMs)

          audio.addEventListener('loadedmetadata', handleReady, { once: true })
          audio.addEventListener('canplaythrough', handleReady, { once: true })
          audio.addEventListener('error', handleError, { once: true })

          if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
            handleReady()
            return
          }

          audio.load()
        })

        if (setupSeq !== alertAudioSetupSeqRef.current) {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
          source.disconnect()
          gain.disconnect()
          await context.close()
          return
        }

        alertAudioRef.current = audio
        alertAudioContextRef.current = context
        alertAudioSourceRef.current = source
        alertAudioGainRef.current = gain
        alertAudioFilePathRef.current = selection.filePath
        alertAudioUrlRef.current = selection.audioUrl
      } catch (error) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        source?.disconnect()
        gain?.disconnect()
        if (context && context.state !== 'closed') {
          await context.close().catch(() => undefined)
        }
        throw error
      }
    })()

    pendingAlertSetupRef.current = setupPromise

    try {
      await setupPromise
    } finally {
      if (pendingAlertSetupRef.current === setupPromise) {
        pendingAlertSetupRef.current = null
      }
    }
  }

  async function playDefaultAlertTone() {
    let context = alertAudioContextRef.current
    let gain = alertAudioGainRef.current

    if (!context || !gain) {
      context = new AudioContext()
      gain = context.createGain()
      gain.gain.value = alertGainFromPercent(settingsRef.current.alertVolumePercent)
      gain.connect(context.destination)
      alertAudioContextRef.current = context
      alertAudioGainRef.current = gain
    }

    stopDefaultAlertTone()

    if (context.state === 'suspended') {
      await context.resume()
    }

    defaultAlertToneSequence.forEach((frequency, index) => {
      const timeoutId = window.setTimeout(() => {
        const liveContext = alertAudioContextRef.current
        const liveGain = alertAudioGainRef.current
        if (!liveContext || !liveGain || liveContext.state === 'closed') {
          return
        }

        const oscillator = liveContext.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        oscillator.connect(liveGain)
        alertToneOscillatorsRef.current.push(oscillator)
        oscillator.onended = () => {
          alertToneOscillatorsRef.current = alertToneOscillatorsRef.current.filter((item) => item !== oscillator)
          oscillator.disconnect()
        }
        oscillator.start()
        oscillator.stop(liveContext.currentTime + 0.12)
      }, index * defaultAlertToneStepMs)

      alertToneTimeoutsRef.current.push(timeoutId)
    })
  }

  async function playAlertAudio() {
    const { alertAudioPath } = settingsRef.current
    const currentAudioUrl = alertAudioUrlRef.current
    if (!alertAudioPath || !currentAudioUrl) {
      await playDefaultAlertTone()
      return
    }

    await ensureAlertAudioReady({
      filePath: alertAudioPath,
      fileName: settingsRef.current.alertAudioName,
      audioUrl: currentAudioUrl,
    })

    const audio = alertAudioRef.current
    const context = alertAudioContextRef.current
    if (!audio || !context) return

    if (context.state === 'suspended') {
      await context.resume()
    }

    audio.pause()
    audio.currentTime = 0
    await audio.play()
  }

  function stopCurrentAlertPlayback() {
    const audio = alertAudioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    stopDefaultAlertTone()
  }

  async function refreshDevices() {
    try {
      const inputs = await listAudioInputDevices()
      if (inputs.length > 0) {
        setDevices(inputs)
        setSettings((prev) => ({
          ...prev,
          inputDeviceId: inputs.some((d) => d.id === prev.inputDeviceId) ? prev.inputDeviceId : inputs[0].id,
        }))
      }
    } catch {
      setDevices(fallbackDevices)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const inputs = await listAudioInputDevices()
        if (inputs.length > 0) {
          setDevices(inputs)
          setSettings((prev) => ({
            ...prev,
            inputDeviceId: inputs.some((d) => d.id === prev.inputDeviceId) ? prev.inputDeviceId : inputs[0].id,
          }))
        }
      } catch {
        setDevices(fallbackDevices)
      }
    })()
  }, [])

  useEffect(() => {
    if (alertAudioGainRef.current) {
      alertAudioGainRef.current.gain.value = alertGainFromPercent(settings.alertVolumePercent)
    }
  }, [settings.alertVolumePercent])

  // Persist snapshot on an interval to avoid blocking the UI/audio loop.
  useEffect(() => {
    const writeNow = async () => {
      const snapshot = createSnapshot({ settings, stats, logs })
      const result = await writeSnapshot(snapshot)
      if (result.filePath) {
        setLastJsonPath(result.filePath)
      }
    }

    void writeNow()
    const timer = window.setInterval(() => {
      void writeNow()
    }, 1000)

    return () => window.clearInterval(timer)
  }, [settings, stats, logs])

  useEffect(() => {
    const exportNow = async () => {
      const snapshot = createSnapshot({ settings, stats, logs })
      const result = await exportCsv(snapshot)
      if (result.filePath) {
        setLastCsvPath(result.filePath)
      }
    }

    void exportNow()
    const timer = window.setInterval(() => {
      void exportNow()
    }, 5 * 60 * 1000)

    return () => window.clearInterval(timer)
  }, [settings, stats, logs])

  useEffect(() => {
    return () => {
      alertAudioSetupSeqRef.current += 1
      void clearAlertAudio()
    }
  }, [clearAlertAudio])

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false)
    resetWaveformHistory()

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }

    impactTimesRef.current = []
    lastAboveThresholdRef.current = false
    startTimeRef.current = null
  }, [resetWaveformHistory])

  useEffect(() => {
    return () => {
      stopMonitoring()
    }
  }, [stopMonitoring])

  async function handleChooseAudio() {
    const picked = await window.desktopAPI?.chooseAlertAudio?.()
    if (!picked) return

    alertAudioSetupSeqRef.current += 1
    await clearAlertAudio()

    try {
      await ensureAlertAudioReady(picked)
      setSettings((prev) => ({
        ...prev,
        alertAudioName: picked.fileName,
        alertAudioPath: picked.filePath,
      }))
    } catch (error) {
      const currentSettings = settingsRef.current
      const currentStats = statsRef.current
      await invalidateAlertAudio()
      pushLog(
        createLogEvent({
          band: currentSettings.frequencyBand,
          peakDb: currentStats.peakDb,
          selectedBandDb: currentStats.selectedBandDb,
          threshold: currentSettings.threshold,
          impactCount: currentStats.impactCount,
          triggered: false,
          messageZh: '提醒音初始化失败，请检查系统播放权限或重新选择音频文件。',
          messageEn: 'Alert audio initialization failed. Check system playback permission or reselect the audio file.',
        }),
      )
      console.error(error)
    }
  }

  async function startMonitoring() {
    stopMonitoring()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: settings.inputDeviceId && settings.inputDeviceId !== 'default'
          ? { deviceId: { exact: settings.inputDeviceId } }
          : true,
      })

      const audioContext = new AudioContext()
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.15
      analyser.minDecibels = -110
      analyser.maxDecibels = -10

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      streamRef.current = stream
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source
      impactTimesRef.current = []
      lastAboveThresholdRef.current = false
      cooldownUntilRef.current = 0
      startTimeRef.current = performance.now()
      setIsMonitoring(true)

      const frequencyData = new Float32Array(analyser.frequencyBinCount)

      const tick = () => {
        const analyserNode = analyserRef.current
        const context = audioContextRef.current
        const currentSettings = settingsRef.current
        if (!analyserNode || !context) {
          return
        }

        analyserNode.getFloatFrequencyData(frequencyData)
        const levels = calculateBandLevels(frequencyData, context.sampleRate, analyserNode.fftSize)
        const selectedDb = selectedBandDb(currentSettings.frequencyBand, levels)
        const selectedPercent = bandToPercent(selectedDb)
        const now = performance.now()
        const windowMs = currentSettings.timeWindowSeconds * 1000

        waveformHistoryRef.current = [...waveformHistoryRef.current.slice(-(waveformHistoryLength - 1)), selectedPercent]
        waveformFrameCountRef.current += 1

        impactTimesRef.current = impactTimesRef.current.filter((ts) => now - ts <= windowMs)

        if (selectedDb >= currentSettings.threshold) {
          if (!lastAboveThresholdRef.current) {
            impactTimesRef.current.push(now)
            const impactCount = impactTimesRef.current.length
            const triggered = impactCount >= currentSettings.triggerCount && now >= cooldownUntilRef.current

            const log = createLogEvent({
              band: currentSettings.frequencyBand,
              peakDb: levels.peak,
              selectedBandDb: selectedDb,
              threshold: currentSettings.threshold,
              impactCount,
              triggered,
              messageZh: triggered
                ? '达到阈值，已触发本机提醒。'
                : `检测到一次超过阈值的${currentSettings.frequencyBand}频事件。`,
              messageEn: triggered
                ? 'Threshold met. Local alert played.'
                : `Detected one ${currentSettings.frequencyBand}-band event above threshold.`,
            })

            pushLog(log)

            if (triggered) {
              cooldownUntilRef.current = now + currentSettings.cooldownSeconds * 1000
              impactTimesRef.current = []
              void playAlertAudio().catch(async () => {
                await invalidateAlertAudio()
                pushLog(
                  createLogEvent({
                    band: currentSettings.frequencyBand,
                    peakDb: levels.peak,
                    selectedBandDb: selectedDb,
                    threshold: currentSettings.threshold,
                    impactCount,
                    triggered: false,
                    messageZh: '提醒音播放失败，请检查系统播放权限或重新选择音频文件。',
                    messageEn: 'Alert audio playback failed. Check system playback permission or reselect the audio file.',
                  }),
                )
              })
              setStats((prev) => ({
                ...prev,
                triggerCount: prev.triggerCount + 1,
                lastEventAt: log.timestamp,
              }))
            }
          }
          lastAboveThresholdRef.current = true
        } else {
          lastAboveThresholdRef.current = false
        }

        setStats((prev) => ({
          ...prev,
          lowBandDb: levels.low,
          midBandDb: levels.mid,
          highBandDb: levels.high,
          peakDb: levels.peak,
          selectedBandDb: selectedDb,
          impactCount: impactTimesRef.current.length,
          elapsedSeconds: startTimeRef.current ? Math.floor((now - startTimeRef.current) / 1000) : prev.elapsedSeconds,
          lastEventAt: prev.lastEventAt,
          statusTextZh: '监听中',
          statusTextEn: 'Listening',
        }))

        if (waveformFrameCountRef.current >= waveformUpdateInterval) {
          waveformFrameCountRef.current = 0
          setWaveformVersion((version) => version + 1)
        }

        frameRef.current = requestAnimationFrame(tick)
      }

      frameRef.current = requestAnimationFrame(tick)
    } catch (error) {
      setIsMonitoring(false)
      pushLog(
        createLogEvent({
          band: settingsRef.current.frequencyBand,
          peakDb: -120,
          selectedBandDb: -120,
          threshold: settingsRef.current.threshold,
          impactCount: 0,
          triggered: false,
          messageZh: '无法启动麦克风监听，请检查系统权限。',
          messageEn: 'Unable to start microphone monitoring. Check system permission.',
        }),
      )
      console.error(error)
    }
  }

  useEffect(() => {
    resetWaveformHistory()
  }, [resetWaveformHistory, settings.frequencyBand])

  const lowPercent = bandToPercent(stats.lowBandDb)
  const midPercent = bandToPercent(stats.midBandDb)
  const highPercent = bandToPercent(stats.highBandDb)

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <h1>{copy.appTitle}</h1>
          <div className="subTitle">{copy.appSubtitle}</div>
        </div>
        <div className="toolbar">
          <label className="languageSelect">
            <span>{copy.language}</span>
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  language: e.target.value as 'zh' | 'en',
                }))
              }
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
      </header>

      <main className="contentGrid">
        <SectionCard title={copy.deviceSettings}>
          <div className="devicePanel">
            <SelectRow
              label={copy.inputDevice}
              value={settings.inputDeviceId}
              onChange={(value) => setSettings((prev) => ({ ...prev, inputDeviceId: value }))}
              options={devices.map((device) => ({ value: device.id, label: device.label }))}
            />
            <button className="secondaryButton" type="button" onClick={refreshDevices}>
              {copy.refreshDevices}
            </button>
          </div>
        </SectionCard>

        <SectionCard title={copy.alertAudio} right={<span className="mutedText">{copy.exportMode}</span>}>
          <div className="audioPanel">
            <div className="fileField">
              {settings.alertAudioName || copy.noAlert}
            </div>
            <button className="secondaryButton" type="button" onClick={handleChooseAudio}>
              {copy.chooseFile}
            </button>
          </div>
          <div className="audioSettings">
            <div className="audioControls">
              <div className="audioSliderWrap">
                <SliderRow
                  label={copy.alertVolume}
                  min={0}
                  max={2000}
                  step={10}
                  value={settings.alertVolumePercent}
                  onChange={(value) => setSettings((prev) => ({ ...prev, alertVolumePercent: value }))}
                  rightText={`${settings.alertVolumePercent}%`}
                />
              </div>
              <button
                className="secondaryButton audioStopButton"
                type="button"
                onClick={stopCurrentAlertPlayback}
              >
                {copy.stopAlert}
              </button>
            </div>
          </div>
          <div className="pathHints">
            <span>JSON: {lastJsonPath || '-'}</span>
            <span>CSV: {lastCsvPath || '-'}</span>
          </div>
        </SectionCard>

        <SectionCard title={copy.frequencyBand}>
          <div className="pillGroup">
            {bandOptions.map((option) => (
              <RadioPill
                key={option.value}
                label={option.label}
                optionValue={option.value}
                selectedValue={settings.frequencyBand}
                onChange={(value) =>
                  setSettings((prev) => ({
                    ...prev,
                    frequencyBand: value as FrequencyBand,
                  }))
                }
                name="band"
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title={copy.params}>
          <div className="sliders">
            <SliderRow
              label={copy.threshold}
              min={-80}
              max={0}
              step={1}
              value={settings.threshold}
              onChange={(value) => setSettings((prev) => ({ ...prev, threshold: value }))}
              rightText={`${settings.threshold} dB`}
            />
            <SliderRow
              label={copy.triggerCount}
              min={1}
              max={10}
              step={1}
              value={settings.triggerCount}
              onChange={(value) => setSettings((prev) => ({ ...prev, triggerCount: value }))}
              rightText={`${settings.triggerCount}x / ${settings.timeWindowSeconds}s`}
            />
            <SliderRow
              label={copy.timeWindow}
              min={1}
              max={10}
              step={1}
              value={settings.timeWindowSeconds}
              onChange={(value) => setSettings((prev) => ({ ...prev, timeWindowSeconds: value }))}
              rightText={`${settings.timeWindowSeconds}s`}
            />
            <SliderRow
              label={copy.cooldown}
              min={1}
              max={30}
              step={1}
              value={settings.cooldownSeconds}
              onChange={(value) => setSettings((prev) => ({ ...prev, cooldownSeconds: value }))}
              rightText={`${settings.cooldownSeconds}s`}
            />
          </div>
        </SectionCard>

        <div className="buttonRow">
          <button className="primaryButton" type="button" onClick={startMonitoring}>
            {copy.start}
          </button>
          <button className="dangerButton" type="button" onClick={stopMonitoring}>
            {copy.stop}
          </button>
        </div>

        <SectionCard title={copy.status}>
          <div className="statusGrid">
            <div className="statusHero">
              <div className="statusText">{isMonitoring ? copy.listening : copy.ready}</div>
              <div className="statusMeta">{copy.elapsed}: {formatElapsed(stats.elapsedSeconds)}</div>
            </div>
            <div className="statusItem">
              <span>{copy.peakDb}</span>
              <strong>{stats.peakDb.toFixed(1)} dB</strong>
            </div>
            <div className="statusItem">
              <span>{copy.selectedBandDb}</span>
              <strong>{stats.selectedBandDb.toFixed(1)} dB</strong>
            </div>
            <div className="statusItem">
              <span>{copy.impactCount}</span>
              <strong>{stats.impactCount}</strong>
            </div>
            <div className="statusItem">
              <span>{copy.totalTriggers}</span>
              <strong>{stats.triggerCount}</strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={copy.charts}>
          <div className="chartPanel">
            <div className="chartPlaceholder waveformBars">
              {waveformHistoryRef.current.map((height, index) => (
                <div key={index} className="waveBar" style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="energyBars">
              <div className="energyBar">
                <span>{copy.low}</span>
                <div className="barTrack"><div className="barFill low" style={{ width: `${lowPercent}%` }} /></div>
              </div>
              <div className="energyBar">
                <span>{copy.mid}</span>
                <div className="barTrack"><div className="barFill mid" style={{ width: `${midPercent}%` }} /></div>
              </div>
              <div className="energyBar">
                <span>{copy.high}</span>
                <div className="barTrack"><div className="barFill high" style={{ width: `${highPercent}%` }} /></div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={copy.logs}>
          <div className="logTable">
            <div className="logHeader">
              <span>Time</span>
              <span>Band</span>
              <span>dB</span>
              <span>Event</span>
            </div>
            {logs.length === 0 ? (
              <div className="emptyLogs">No logs yet.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="logRow">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span>{log.band}</span>
                  <span>{log.selectedBandDb.toFixed(1)}</span>
                  <span>{settings.language === 'zh' ? log.messageZh : log.messageEn}</span>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </main>
    </div>
  )
}

export default App

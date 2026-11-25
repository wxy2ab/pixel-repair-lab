import type { ArenaLevel } from '../shared/advanced'
import { validateRealtimeArenaCheckpoint, type RealtimeArenaCheckpoint } from '../engine/realtimeProtocol'
import { parseArenaReplayProgress, type ArenaReplayProgress } from './arenaReplayProgress'

export type ArenaMatchMode = 'timed' | 'relaxed'
export type ArenaReload = { levelId: string; mode: ArenaMatchMode; fromRoute: boolean }
type ArenaMatchProgress = RealtimeArenaCheckpoint | ArenaReplayProgress
type ArenaMatchRecord<Progress extends ArenaMatchProgress = ArenaMatchProgress> = { progress: Progress; savedAt?: number }

const reloadKey = 'pixel-repair-lab:arena-reload'
const scenarioKeys = new WeakMap<ArenaLevel, number>()

function matchKey(level: ArenaLevel, mode: ArenaMatchMode) {
  return `pixel-repair-lab:arena-match:${level.id}:${mode}`
}

function scenarioKey(level: ArenaLevel) {
  const existing = scenarioKeys.get(level)
  if (existing !== undefined) return existing
  const { tiles, start, items, opponents, maxTurns, objective, shifts, variants, helpers } = level
  const scenario = JSON.stringify([tiles, start, items, opponents, maxTurns, objective, shifts, variants, helpers,
    ...(level.combat?.switches?.length ? [level.combat.switches] : [])])
  let key = 2166136261
  for (let index = 0; index < scenario.length; index++) key = Math.imul(key ^ scenario.charCodeAt(index), 16777619)
  scenarioKeys.set(level, key)
  return key
}

function parseMatchProgress(level: ArenaLevel, mode: ArenaMatchMode, progress: unknown) {
  return mode === 'timed' ? validateRealtimeArenaCheckpoint(progress, level.maxTurns, Boolean(level.combat)) : parseArenaReplayProgress(progress, level)
}

export function readArenaMatchRecord(level: ArenaLevel, mode: 'timed'): ArenaMatchRecord<RealtimeArenaCheckpoint> | undefined
export function readArenaMatchRecord(level: ArenaLevel, mode: 'relaxed'): ArenaMatchRecord<ArenaReplayProgress> | undefined
export function readArenaMatchRecord(level: ArenaLevel, mode: ArenaMatchMode): ArenaMatchRecord | undefined
export function readArenaMatchRecord(level: ArenaLevel, mode: ArenaMatchMode) {
  try {
    const raw = localStorage.getItem(matchKey(level, mode))
    if (!raw || raw.length > 2_000_000) return
    const stored: unknown = JSON.parse(raw)
    if (!stored || typeof stored !== 'object' || !('scenario' in stored) || stored.scenario !== scenarioKey(level)
      || !('progress' in stored)) return
    const progress = parseMatchProgress(level, mode, stored.progress)
    if (!progress) return
    const savedAt = 'savedAt' in stored ? stored.savedAt : undefined
    return typeof savedAt === 'number' && Number.isSafeInteger(savedAt) && savedAt >= 0 && savedAt <= 8_640_000_000_000_000
      ? { progress, savedAt } : { progress }
  } catch {
    return undefined
  }
}

export function readArenaMatch(level: ArenaLevel, mode: 'timed'): RealtimeArenaCheckpoint | undefined
export function readArenaMatch(level: ArenaLevel, mode: 'relaxed'): ArenaReplayProgress | undefined
export function readArenaMatch(level: ArenaLevel, mode: ArenaMatchMode): ArenaMatchProgress | undefined
export function readArenaMatch(level: ArenaLevel, mode: ArenaMatchMode) {
  return readArenaMatchRecord(level, mode)?.progress
}

export function saveArenaMatch(level: ArenaLevel, mode: ArenaMatchMode, progress?: ArenaMatchProgress) {
  try {
    const key = matchKey(level, mode)
    if (progress) {
      const existing = readArenaMatchRecord(level, mode)
      const next = parseMatchProgress(level, mode, progress)
      if (existing && next && JSON.stringify(existing.progress) === JSON.stringify(next)) return true
      localStorage.setItem(key, JSON.stringify({ scenario: scenarioKey(level), progress, savedAt: Date.now() }))
    } else localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function readArenaReload(): ArenaReload | undefined {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (navigation?.type !== 'reload') return undefined
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(reloadKey) ?? 'null')
    if (!stored || typeof stored !== 'object' || !('levelId' in stored) || !('mode' in stored) || !('fromRoute' in stored)) return
    const { levelId, mode, fromRoute } = stored
    if (typeof levelId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(levelId)
      && (mode === 'timed' || mode === 'relaxed') && typeof fromRoute === 'boolean') return { levelId, mode, fromRoute }
  } catch {
    return undefined
  }
}

export function saveArenaReload(entry?: ArenaReload) {
  try {
    if (entry) sessionStorage.setItem(reloadKey, JSON.stringify(entry))
    else sessionStorage.removeItem(reloadKey)
  } catch { /* Storage may be unavailable. */ }
}

import type { BreadboardBuild, BreadboardLevel } from '../shared/breadboard'
import { compareRepairBoards } from './breadboardRepairChanges'
export { compareRepairBoards, type RepairChange } from './breadboardRepairChanges'
import { boardStorageKeys, decodeBreadboardBuild, readBoardStorage, writeBoardStorage } from './breadboardDraft'
import { sameMeterNote, sameProbeConditions, validNote, type FaultKind, type MeterNote } from './breadboardRepairTicket'
import { readRepairReplay, saveRepairReplay, type RepairReplayEvent } from './breadboardRepairReplay'

export type RepairComparison = { before: MeterNote; after?: MeterNote }
export type RepairObservation = { ledOn: boolean; d2: number; d13: number }
export type RepairReport = {
  id: string
  completedAt: number
  firstDiagnosis: FaultKind
  diagnosis: FaultKind
  original: BreadboardBuild
  repaired: BreadboardBuild
  readings: RepairComparison[]
  validation: { open: RepairObservation; closed: RepairObservation }
  events?: RepairReplayEvent[]
}

type Lesson = Pick<BreadboardLevel, 'id'>
const historyPrefix = (level: Lesson) => 'pixel-repair-lab:repair-history:' + level.id + ':'
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id)
const validDiagnosis = (value: unknown): value is FaultKind => value === 'wrong-jumper' || value === 'reversed-led'
const bit = (value: unknown) => value === 0 || value === 1

function observed(value: RepairObservation | undefined) {
  return value && typeof value.ledOn === 'boolean' && bit(value.d2) && bit(value.d13)
}

function validComparison(pair: RepairComparison | null) {
  return pair && validNote(pair.before) && (pair.after === undefined || validNote(pair.after) && sameProbeConditions(pair.before, pair.after))
}

// The record picker can list many reports. Only opening a particular replay
// needs to parse its events; object spreads and JSON writes keep the small summary.
function withReplay(report: RepairReport, level: Lesson): RepairReport {
  let events: RepairReplayEvent[] | undefined
  Object.defineProperty(report, 'events', { configurable: true, get() {
    events ??= readRepairReplay(level, report.id, false, 'archive')
    return events.length ? events : undefined
  } })
  return report
}

function readReportAt(key: string, id: string, level: Lesson): RepairReport | undefined {
  const data = readBoardStorage(key) as (Partial<RepairReport> & { version?: number }) | undefined
  if (data?.version !== 1 || data.id !== id || !validId(id) || typeof data.completedAt !== 'number'
    || !Number.isSafeInteger(data.completedAt) || data.completedAt <= 0 || data.completedAt > 8_640_000_000_000_000
    || !validDiagnosis(data.firstDiagnosis) || !validDiagnosis(data.diagnosis)
    || !Array.isArray(data.readings) || data.readings.length === 0 || data.readings.length > 6 || !data.readings.every(validComparison)
    || !observed(data.validation?.closed) || !observed(data.validation?.open)) return
  const original = decodeBreadboardBuild(data.original ?? null, 'call-lamp')
  const repaired = decodeBreadboardBuild(data.repaired ?? null, 'call-lamp')
  if (!original || !repaired) return
  const readings = data.readings.map((pair, index) => {
    const after = readBoardStorage(key + ':measurement:' + index) as MeterNote | undefined
    return after && validNote(after) && sameProbeConditions(pair.before, after) ? { before: pair.before, after } : pair
  })
  return withReplay({ id, completedAt: data.completedAt, firstDiagnosis: data.firstDiagnosis, diagnosis: data.diagnosis,
    original, repaired, readings, validation: data.validation! }, level)
}

// Each accepted repair is an immutable snapshot in its own key. Each later measurement
// updates just that pair, so independent reports and probe pairs cannot overwrite each other.
export function readRepairHistory(level: Lesson, preview = false): RepairReport[] {
  if (preview) return []
  const prefix = historyPrefix(level)
  const reports: RepairReport[] = []
  for (const key of boardStorageKeys(prefix)) {
    const id = key.slice(prefix.length)
    if (!validId(id)) continue
    const report = readReportAt(key, id, level)
    if (report) reports.push(report)
  }
  return reports.sort((a, b) => b.completedAt - a.completedAt || b.id.localeCompare(a.id))
}

export function saveRepairReport(level: Lesson, report: RepairReport, preview = false): RepairReport {
  if (preview) return report
  const key = historyPrefix(level) + report.id
  const saved = readReportAt(key, report.id, level)
  if (!saved) {
    const { events, ...summary } = report
    if (events) saveRepairReplay(level, report.id, events, false, 'archive')
    writeBoardStorage(key, { version: 1, ...summary })
    return report
  }
  if (saved.diagnosis !== report.diagnosis || compareRepairBoards(saved.original, report.original).length
    || compareRepairBoards(saved.repaired, report.repaired).length) return saved
  const readings = saved.readings.map((pair, index) => {
    const next = report.readings.find(entry => sameMeterNote(entry.before, pair.before))?.after
    if (!next || !sameProbeConditions(pair.before, next) || pair.after && sameMeterNote(pair.after, next)) return pair
    writeBoardStorage(key + ':measurement:' + index, next)
    return { before: pair.before, after: next }
  })
  if (report.events?.length) {
    const existing = saved.events ?? []
    const accepted = existing.find(event => event.action.kind === 'check' && event.action.passed)
    let additions = report.events
    if (accepted) {
      // An earlier copy of this ticket may still be open in a different tab.
      // Only extend the branch whose original acceptance we archived.
      const index = additions.findIndex(event => event.id === accepted.id)
      additions = index < 0 ? [] : additions.slice(index + 1)
    } else if (!existing.length || existing[0].id !== additions[0].id) {
      const first = additions[0].action
      if (first.kind !== 'resume' || !first.archived || compareRepairBoards(first.build, saved.repaired).length) additions = []
      else if (existing.length) additions = additions.slice(1)
    }
    saveRepairReplay(level, report.id, additions, false, 'archive')
  }
  return withReplay({ ...saved, readings }, level)
}

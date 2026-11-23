import type { MeterMode, MeterReading } from '../engine/breadboardMeter'
import { isBreadboardPin, type BreadboardBuild, type BreadboardLevel } from '../shared/breadboard'
import { boardStorageKeys, decodeBreadboardBuild, readBoardStorage, removeBoardStorage, writeBoardStorage } from './breadboardDraft'
import { compareRepairBoards, type RepairChange } from './breadboardRepairChanges'
import type { RepairObservation, RepairReport } from './breadboardRepairHistory'
import { newRepairAttemptId, sameMeterNote, validNote, type FaultKind, type MeterNote } from './breadboardRepairTicket'

export type RepairReplayBench = {
  pressed: boolean; powered: boolean; ledOn: boolean
  d2?: number | null; d13?: number | null
  red?: string; black?: string; mode?: MeterMode; reading?: MeterReading
}
type PriorEvidence = { notes: MeterNote[]; firstDiagnosis?: FaultKind; diagnosis?: FaultKind }
export type RepairReplayAction =
  | { kind: 'start' | 'button' | 'power' }
  | { kind: 'resume'; build: BreadboardBuild; archived?: boolean; prior?: PriorEvidence }
  | { kind: 'measure'; note: MeterNote }
  | { kind: 'retest'; note?: MeterNote; source?: MeterNote }
  | { kind: 'diagnosis'; diagnosis: FaultKind }
  | { kind: 'edit'; build: BreadboardBuild }
  | { kind: 'test'; observation: RepairObservation }
  | { kind: 'check'; passed: boolean }
export type RepairReplayEvent = { id: string; at: number; action: RepairReplayAction; bench: RepairReplayBench }
export type RepairReplayFrame = {
  id: string; action: RepairReplayAction; bench: Partial<RepairReplayBench>; build: BreadboardBuild; changes: RepairChange[]; snapshot: boolean
}

export function newReplayEvent(action: RepairReplayAction, bench: RepairReplayBench, previous?: RepairReplayEvent): RepairReplayEvent {
  return { id: newRepairAttemptId(), at: Math.max(Date.now(), (previous?.at ?? 0) + 1),
    ...structuredClone({ action, bench }) }
}

type Lesson = Pick<BreadboardLevel, 'id'>
type Store = 'draft' | 'archive'
const prefixFor = (level: Lesson, id: string, store: Store) => 'pixel-repair-lab:repair-replay:' + store + ':' + level.id + ':' + id + ':'
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id)
const bit = (value: unknown) => value === 0 || value === 1
const knownPin = (pin: unknown) => typeof pin === 'string' && isBreadboardPin('call-lamp', pin, [])

function validReading(value: MeterReading) {
  if (value.kind === 'continuity') return typeof value.connected === 'boolean'
  if (value.kind === 'voltage') return Number.isFinite(value.volts)
  return ['place-probes', 'power-off-first', 'unpowered', 'protected', 'floating'].includes(value.kind)
}

function validBench(value: RepairReplayBench | null) {
  return !!value && [value.pressed, value.powered, value.ledOn].every(flag => typeof flag === 'boolean')
    && [value.d2, value.d13].every(pin => pin == null || bit(pin))
    && [value.red, value.black].every(pin => pin === undefined || knownPin(pin))
    && (value.mode === undefined || value.mode === 'continuity' || value.mode === 'voltage')
    && (value.reading === undefined || !!value.reading && validReading(value.reading))
}

function knownDiagnosis(value: unknown) {
  return value === 'wrong-jumper' || value === 'reversed-led'
}

function decodeEvent(raw: unknown, expectedId: string): RepairReplayEvent | undefined {
  const value = raw as Partial<RepairReplayEvent> | null
  if (!value || value.id !== expectedId || !validId(value.id) || !Number.isSafeInteger(value.at)
    || !(value.at! > 0) || !value.bench || !validBench(value.bench) || !value.action) return
  const action = value.action
  switch (action.kind) {
    case 'resume':
    case 'edit': {
      const build = decodeBreadboardBuild(action.build, 'call-lamp')
      if (!build || (action.kind === 'resume' && action.archived !== undefined && typeof action.archived !== 'boolean')) return
      if (action.kind === 'resume' && action.prior !== undefined) {
        const prior = action.prior
        if (!prior || !Array.isArray(prior.notes) || prior.notes.length > 6 || !prior.notes.every(validNote)
          || [prior.firstDiagnosis, prior.diagnosis].some(choice => choice !== undefined && !knownDiagnosis(choice))) return
      }
      return { id: value.id, at: value.at!, bench: value.bench, action: { ...action, build } }
    }
    case 'measure': if (!validNote(action.note)) return; break
    case 'retest':
      if (action.note !== undefined && !validNote(action.note) || action.source !== undefined && !validNote(action.source)) return
      break
    case 'diagnosis': if (!knownDiagnosis(action.diagnosis)) return; break
    case 'test': if (!action.observation || !bit(action.observation.d2) || !bit(action.observation.d13)
      || typeof action.observation.ledOn !== 'boolean') return; break
    case 'check': if (typeof action.passed !== 'boolean') return; break
    case 'button':
    case 'power':
    case 'start': break
    default: return
  }
  return { id: value.id, at: value.at!, action, bench: value.bench }
}

// Independent immutable steps avoid an oversized draft and prevent a stale tab's
// re-save from erasing other measurements made after the report was accepted.
export function saveRepairReplay(level: Lesson, id: string, events: readonly RepairReplayEvent[], preview = false, store: Store = 'draft') {
  if (preview || !validId(id)) return
  const prefix = prefixFor(level, id, store)
  for (const event of events) {
    if (!validId(event.id)) continue
    const key = prefix + event.id
    if (!readBoardStorage(key)) writeBoardStorage(key, event)
  }
}

export function readRepairReplay(level: Lesson, id: string, preview = false, store: Store = 'draft'): RepairReplayEvent[] {
  if (preview || !validId(id)) return []
  const prefix = prefixFor(level, id, store)
  const result: RepairReplayEvent[] = []
  for (const key of boardStorageKeys(prefix)) {
    const event = decodeEvent(readBoardStorage(key), key.slice(prefix.length))
    if (event) result.push(event)
  }
  return result.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

export function discardRepairReplay(level: Lesson, id: string, preview = false, events?: readonly RepairReplayEvent[]) {
  if (preview || !validId(id)) return
  const prefix = prefixFor(level, id, 'draft')
  const keys = events ? events.filter(event => validId(event.id)).map(event => prefix + event.id) : boardStorageKeys(prefix)
  keys.forEach(removeBoardStorage)
}

function noteBench(note: MeterNote): Partial<RepairReplayBench> {
  const mode = note.kind === 'continuity' ? 'continuity' : 'voltage'
  const reading: MeterReading = note.kind === 'continuity' ? { kind: 'continuity', connected: note.connected }
    : note.kind === 'voltage' ? { kind: 'voltage', volts: note.volts } : { kind: 'floating' }
  return { red: note.red, black: note.black, pressed: note.pressed, powered: mode === 'voltage', mode, reading, d13: note.output }
}

// Older files contain the original/final boards and a collection of observations,
// but no click order, intermediate circuit, or meter state during diagnosis.
function snapshotFrames(report: RepairReport, subsequent: RepairReplayEvent[]) {
  const frames: RepairReplayFrame[] = []
  function add(action: RepairReplayAction, build: BreadboardBuild, bench: Partial<RepairReplayBench> = {}, changes: RepairChange[] = []) {
    frames.push({ id: 'snapshot-' + frames.length, action, build, bench, changes, snapshot: true })
  }
  for (const { before } of report.readings) add({ kind: 'measure', note: before }, report.original, noteBench(before))
  add({ kind: 'diagnosis', diagnosis: report.firstDiagnosis }, report.original)
  add({ kind: 'edit', build: report.repaired }, report.repaired, {}, compareRepairBoards(report.original, report.repaired))
  if (report.firstDiagnosis !== report.diagnosis) add({ kind: 'diagnosis', diagnosis: report.diagnosis }, report.repaired)
  for (const { before, after } of report.readings) {
    if (!after) continue
    const alreadyRecorded = subsequent.some(({ action }) => action.kind === 'retest' && action.note && sameMeterNote(action.note, after)
      && (!action.source || sameMeterNote(action.source, before)))
    if (!alreadyRecorded) add({ kind: 'retest', note: after, source: before }, report.repaired, noteBench(after))
  }
  for (const pressed of [true, false]) {
    const observation = pressed ? report.validation.closed : report.validation.open
    add({ kind: 'test', observation }, report.repaired, { pressed, powered: true, ...observation })
  }
  return frames
}

export function repairReplayFrames(report: RepairReport): RepairReplayFrame[] {
  const events = report.events ?? []
  const first = events[0]?.action
  const frames = !first || first.kind === 'resume' && first.archived ? snapshotFrames(report, events) : []
  if (first?.kind === 'resume' && !first.archived && first.prior) {
    const { notes, firstDiagnosis, diagnosis } = first.prior
    for (const note of notes) frames.push({ id: 'prior-' + frames.length, action: { kind: 'measure', note },
      bench: noteBench(note), build: report.original, changes: [], snapshot: true })
    if (firstDiagnosis) frames.push({ id: 'prior-first', action: { kind: 'diagnosis', diagnosis: firstDiagnosis },
      bench: {}, build: report.original, changes: [], snapshot: true })
    if (diagnosis && diagnosis !== firstDiagnosis) frames.push({ id: 'prior-diagnosis', action: { kind: 'diagnosis', diagnosis },
      bench: {}, build: first.build, changes: [], snapshot: true })
  }
  let build = report.original
  for (const { id, action, bench } of events) {
    const changes = action.kind === 'edit' ? compareRepairBoards(build, action.build) : []
    if (action.kind === 'edit' || action.kind === 'resume') build = action.build
    frames.push({ id, action, build, bench, changes, snapshot: false })
  }
  return frames
}

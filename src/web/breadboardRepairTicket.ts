import { breadboardFaultBuild, isBreadboardSocket, type BreadboardBuild, type BreadboardFault, type BreadboardLevel } from '../shared/breadboard'
import type { BreadboardMeterSample } from './BreadboardMeter'
import { decodeBreadboardBuild, readBoardStorage, writeBoardStorage } from './breadboardDraft'

export type FaultKind = BreadboardFault['kind']
export type MeterNote = { red: string; black: string; pressed: boolean; output?: 0 | 1; pullup?: boolean; drivenBy?: boolean } & (
  { kind: 'continuity'; connected: boolean } | { kind: 'voltage'; volts: number } | { kind: 'floating' }
)
export type RepairTicket = {
  id: string; index: number; build: BreadboardBuild; notes: MeterNote[]; diagnosis?: FaultKind
  firstDiagnosis?: FaultKind; after?: (MeterNote | null)[]; resumed?: boolean
}

const storageKey = (level: BreadboardLevel) => 'pixel-repair-lab:repair-ticket:' + level.id
const probePin = (pin: unknown): pin is string => typeof pin === 'string'
  && (isBreadboardSocket(pin) || ['uno-D2', 'uno-D13', 'GND'].includes(pin))

export function validNote(note: Partial<MeterNote> | null): note is MeterNote {
  return !!note && probePin(note.red) && probePin(note.black) && typeof note.pressed === 'boolean'
    && (note.pullup === undefined || typeof note.pullup === 'boolean') && (note.drivenBy === undefined || typeof note.drivenBy === 'boolean')
    && (note.output === undefined || note.output === 0 || note.output === 1) && (
    note.kind === 'continuity' && typeof note.connected === 'boolean'
    || note.kind === 'voltage' && typeof note.volts === 'number' && Number.isFinite(note.volts)
    || note.kind === 'floating')
}

export function sameProbeConditions(a: MeterNote, b: MeterNote) {
  return a.red === b.red && a.black === b.black && a.pressed === b.pressed
    && (a.kind === 'continuity') === (b.kind === 'continuity')
}

export function sameMeterNote(a: MeterNote, b: MeterNote) {
  if (!sameProbeConditions(a, b) || a.output !== b.output || a.pullup !== b.pullup || a.drivenBy !== b.drivenBy) return false
  if (a.kind === 'voltage' && b.kind === 'voltage') return a.volts === b.volts
  if (a.kind === 'continuity' && b.kind === 'continuity') return a.connected === b.connected
  return a.kind === b.kind
}

export function newRepairAttemptId() {
  return globalThis.crypto?.randomUUID?.() ?? ('repair-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))
}

export function newRepairTicket(level: BreadboardLevel, index: number): RepairTicket {
  return { id: newRepairAttemptId(), index, build: breadboardFaultBuild(level, level.board.faults![index]), notes: [] }
}

export function openRepairTicket(level: BreadboardLevel, preview: boolean): RepairTicket | undefined {
  const faults = level.board.faults
  if (!faults?.length) return
  if (!preview) {
    const saved = readBoardStorage(storageKey(level)) as (Partial<RepairTicket> & { version?: number; fault?: FaultKind }) | undefined
    if (saved?.version === 1 && typeof saved.index === 'number' && Number.isInteger(saved.index)
      && faults[saved.index] && saved.fault === faults[saved.index].kind && Array.isArray(saved.notes)
      && saved.notes.length <= 6 && saved.notes.every(validNote)) {
      const build = decodeBreadboardBuild(saved.build ?? null, level.board.mode)
      const diagnosis = saved.notes.length ? saved.diagnosis : undefined
      if (build && (!diagnosis || diagnosis === 'wrong-jumper' || diagnosis === 'reversed-led')) {
        const first = saved.firstDiagnosis
        const notes = saved.notes
        const after = notes.map((before, i) => {
          const item = Array.isArray(saved.after) ? saved.after[i] : null
          return validNote(item) && sameProbeConditions(before, item) ? item : null
        })
        return { id: typeof saved.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(saved.id) ? saved.id : newRepairAttemptId(),
          index: saved.index, notes, diagnosis, build, after, resumed: true,
          firstDiagnosis: first === 'wrong-jumper' || first === 'reversed-led' ? first : diagnosis }
      }
    }
  }
  return newRepairTicket(level, preview ? 0 : Math.floor(Math.random() * faults.length))
}

export function saveRepairTicket(level: BreadboardLevel, ticket: RepairTicket) {
  writeBoardStorage(storageKey(level), { version: 1, fault: level.board.faults![ticket.index].kind, ...ticket })
}

export function repairEvidence(sample: BreadboardMeterSample | undefined, pressed: boolean, output?: 0 | 1, pullup?: boolean, drivenBy?: boolean): MeterNote | undefined {
  if (!sample || sample.red === sample.black) return
  const { red, black, reading } = sample
  if (reading.kind === 'continuity') return { red, black, pressed, kind: 'continuity', connected: reading.connected }
  if (reading.kind === 'voltage') return { red, black, pressed, output, pullup, drivenBy, kind: 'voltage', volts: reading.volts }
  if (reading.kind === 'floating') return { red, black, pressed, output, pullup, drivenBy, kind: 'floating' }
}

export function recordRepairNote(notes: MeterNote[], next: MeterNote): MeterNote[] {
  const distinct = notes.filter(note => note.red !== next.red || note.black !== next.black || note.kind !== next.kind
    || note.pressed !== next.pressed || note.output !== next.output || note.pullup !== next.pullup || note.drivenBy !== next.drivenBy)
  return [...distinct, next].slice(-6)
}

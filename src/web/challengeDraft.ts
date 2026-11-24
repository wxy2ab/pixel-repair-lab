import { isFerryCommand, isFerryLayout } from '../shared/ferry'
import { gridOffsets } from '../shared/gridDevices'
import { isMirrorLayout } from '../shared/laserTrial'
import type { CardInstance, Direction, FerryCommand, FerryRaceLayout, GridLevel, Level, MirrorPlacement } from '../shared/types'

export type GridChallengeDraft = {
  kind: 'grid'
  mode: 'cards' | 'python'
  cards: CardInstance[]
  source?: string
  ferryRace?: { layout: FerryRaceLayout; commands: FerryCommand[] }
  laserRace?: { mirrors: MirrorPlacement[]; commands: Direction[] }
  warehouse?: { controls: 'direct' | 'program'; path: string }
}

export type ArenaChallengeDraft = {
  kind: 'arena'
  mode: 'relaxed' | 'timed'
  source?: string
  policy?: string
}

export type AlgorithmChallengeDraft = { kind: 'algorithm'; source: string }
export type MachineChallengeDraft = { kind: 'machine'; source: string }

export type ChallengeDraft = GridChallengeDraft | ArenaChallengeDraft | AlgorithmChallengeDraft | MachineChallengeDraft

const maxMachineCodeLength = 12_000
const maxPythonDraftLength = 120_000
const maxStoredLength = 1_600_000
const maxCards = 100
const maxCardDepth = 5

export function challengeDraftKey(id: string): string {
  return 'pixel-repair-lab:challenge-draft:' + id
}

export function supportsChallengeDraft(level: Level): boolean {
  return level.kind === 'grid' || level.kind === 'arena' || level.kind === 'machine'
    || (level.kind === 'algorithm' && !level.batteryPipeline && !level.batteryDispatch && !level.chargingChallenge)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCode(value: unknown, limit = maxPythonDraftLength): string | undefined {
  return typeof value === 'string' && value.length <= limit ? value : undefined
}

function readGridCards(level: GridLevel, stored: unknown): CardInstance[] {
  const byId = new Map(level.cards.map(definition => [definition.id, definition]))
  let remaining = maxCards

  function readCards(items: unknown, depth: number): CardInstance[] {
    if (!Array.isArray(items) || depth > maxCardDepth) return []
    const cards: CardInstance[] = []
    for (const item of items as unknown[]) {
      if (remaining === 0) break
      if (!isRecord(item) || typeof item.cardId !== 'string') continue
      const definition = byId.get(item.cardId)
      if (!definition) continue
      remaining -= 1

      const card: CardInstance = { cardId: definition.id }
      const values = item.values
      if (isRecord(values)) {
        card.values = Object.fromEntries((definition.parameters ?? []).flatMap(({ name, choices }) => {
          const choice = values[name]
          return typeof choice === 'string' && choices.some(option => option.id === choice) ? [[name, choice]] : []
        }))
      }
      if (definition.block && Array.isArray(item.children)) card.children = readCards(item.children, depth + 1)
      cards.push(card)
    }
    return cards
  }

  return readCards(stored, 0)
}

export function parseChallengeDraft(level: Level, raw: string | null | undefined): ChallengeDraft | undefined {
  if (!supportsChallengeDraft(level) || !raw || raw.length > maxStoredLength) return

  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return
  }
  if (!isRecord(stored) || stored.kind !== level.kind) return

  if (level.kind === 'grid' && (stored.mode === 'cards' || stored.mode === 'python')) {
    const source = readCode(stored.source)
    const draft: GridChallengeDraft = { kind: 'grid', mode: stored.mode, cards: readGridCards(level, stored.cards), ...(source !== undefined && { source }) }
    const warehouse = stored.warehouse
    if (level.warehouse && isRecord(warehouse) && (warehouse.controls === 'direct' || warehouse.controls === 'program')
      && typeof warehouse.path === 'string' && warehouse.path.length <= 16384 && /^[udlr]*$/.test(warehouse.path)) {
      draft.warehouse = { controls: warehouse.controls, path: warehouse.path }
    }
    const race = stored.ferryRace
    if (level.ferry?.kind === 'race' && isRecord(race) && isFerryLayout(level, race.layout)
      && Array.isArray(race.commands) && race.commands.length <= 240 && race.commands.every(isFerryCommand)) {
      draft.ferryRace = { layout: race.layout, commands: race.commands }
    }
    const laserRace = stored.laserRace
    if (level.laserTrial?.kind === 'race' && isRecord(laserRace) && isMirrorLayout(level, laserRace.mirrors)
      && Array.isArray(laserRace.commands) && laserRace.commands.length <= 240
      && laserRace.commands.every((command): command is Direction => typeof command === 'string' && Object.hasOwn(gridOffsets, command))) {
      draft.laserRace = { mirrors: laserRace.mirrors, commands: laserRace.commands }
    }
    return draft
  }
  if (level.kind === 'arena' && (stored.mode === 'relaxed' || stored.mode === 'timed')) {
    const source = readCode(stored.source)
    const policy = readCode(stored.policy)
    return { kind: 'arena', mode: stored.mode, ...(source !== undefined && { source }), ...(policy !== undefined && { policy }) }
  }
  if (level.kind === 'algorithm' || level.kind === 'machine') {
    const source = readCode(stored.source, level.kind === 'machine' ? maxMachineCodeLength : maxPythonDraftLength)
    if (source !== undefined) return { kind: level.kind, source }
  }
}

import type { ArenaPreviewBoard } from '../engine/arenaMatchPreview'
import type { Position } from '../shared/types'

const entityKinds = ['player', 'rivals', 'battery'] as const
type EntityKind = (typeof entityKinds)[number]
export type SavedArenaChangeKind = EntityKind | 'gate'

type LocatedEntity = Position & { id: string }
type EntityChange = { id: string; first: Position | undefined; second: Position | undefined }
type GateChange = { id: string; first: boolean; second: boolean }

export type SavedArenaChange = {
  positions: readonly Position[]
} & (
  | { kind: EntityKind; entries: readonly EntityChange[] }
  | { kind: 'gate'; entries: readonly GateChange[] }
)

const cellKey = ({ x, y }: Position) => `${x},${y}`
const samePosition = (first: Position | undefined, second: Position | undefined) =>
  first?.x === second?.x && first?.y === second?.y

function entityPositions(entities: readonly LocatedEntity[]) {
  return new Map(entities.map(({ id, x, y }) => [id, { x, y }]))
}

function changedEntities(first: readonly LocatedEntity[], second: readonly LocatedEntity[]) {
  const firstPositions = entityPositions(first)
  const secondPositions = entityPositions(second)
  const ids = new Set([...firstPositions.keys(), ...secondPositions.keys()])
  const changes: EntityChange[] = []

  for (const id of ids) {
    const firstPosition = firstPositions.get(id)
    const secondPosition = secondPositions.get(id)
    if (!samePosition(firstPosition, secondPosition)) {
      changes.push({ id, first: firstPosition, second: secondPosition })
    }
  }
  return changes
}

function affectedCells(changes: readonly EntityChange[]) {
  const cells = new Map<string, Position>()
  for (const { first, second } of changes) {
    if (first) cells.set(cellKey(first), first)
    if (second) cells.set(cellKey(second), second)
  }
  return cells
}

export function changedSavedArenaLocations(first: readonly LocatedEntity[], second: readonly LocatedEntity[]) {
  return affectedCells(changedEntities(first, second))
}

function entitiesFor(board: ArenaPreviewBoard, kind: EntityKind): readonly LocatedEntity[] {
  if (kind === 'battery') return board.items
  return board.actors.filter(({ id }) => (id === 'player') === (kind === 'player'))
}

function entityChange(kind: EntityKind, entries: readonly EntityChange[]): SavedArenaChange {
  return { kind, entries, positions: [...affectedCells(entries).values()] }
}

function gateChange(first: ArenaPreviewBoard, second: ArenaPreviewBoard, position: Position): SavedArenaChange | undefined {
  const { x, y } = position
  const firstTile = first.tiles[y]?.[x]
  const secondTile = second.tiles[y]?.[x]
  if (firstTile === undefined || secondTile === undefined) return
  const firstOpen = firstTile === '.'
  const secondOpen = secondTile === '.'
  if (firstOpen === secondOpen) return
  return {
    kind: 'gate',
    positions: [position],
    entries: [{ id: cellKey(position), first: firstOpen, second: secondOpen }],
  }
}

export function readSavedArenaChanges(first: ArenaPreviewBoard, second: ArenaPreviewBoard, gates: readonly Position[]): SavedArenaChange[] {
  const changes = entityKinds.flatMap(kind =>
    changedEntities(entitiesFor(first, kind), entitiesFor(second, kind))
      .sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true }))
      .map(entry => entityChange(kind, [entry])),
  )
  const distinctGates = new Map(gates.map(position => [cellKey(position), position]))
  const sortedGates = [...distinctGates.values()].sort((left, right) => left.y - right.y || left.x - right.x)
  for (const position of sortedGates) {
    const change = gateChange(first, second, position)
    if (change) changes.push(change)
  }
  return changes
}

export function readSavedArenaChange(
  first: ArenaPreviewBoard,
  second: ArenaPreviewBoard,
  kind: SavedArenaChangeKind,
  position: Position,
): SavedArenaChange | undefined {
  if (kind === 'gate') return gateChange(first, second, position)

  const entries = changedEntities(entitiesFor(first, kind), entitiesFor(second, kind))
    .filter(change => samePosition(change.first, position) || samePosition(change.second, position))
  if (entries.length === 0) return
  return entityChange(kind, entries)
}

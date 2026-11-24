import type { FerryCommand, FerryRaceLayout, GridLevel, Issue, Position } from './types'

export function initialFerryLayout(level: GridLevel): FerryRaceLayout {
  if (level.ferry?.kind !== 'race' || level.items?.length !== 2) throw new Error('Expected a two-battery ferry race')
  const [a, b] = level.items
  return { batteries: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], wall: { ...level.ferry.wall } }
}

function isFloor(level: GridLevel, point: unknown): point is Position {
  if (!point || typeof point !== 'object' || !('x' in point) || !('y' in point)) return false
  const { x, y } = point
  return typeof x === 'number' && Number.isInteger(x) && typeof y === 'number' && Number.isInteger(y)
    && level.tiles[y]?.[x] === '.'
}

export function isFerryLayout(level: GridLevel, value: unknown): value is FerryRaceLayout {
  if (!value || typeof value !== 'object' || !('batteries' in value) || !('wall' in value)
    || !Array.isArray(value.batteries) || value.batteries.length !== 2) return false
  const pieces: unknown[] = [...value.batteries, value.wall]
  if (!pieces.every((point): point is Position => isFloor(level, point))) return false
  const exit = level.objectives.find(goal => goal.type === 'exit')
  if (!exit) return false
  const positions = [level.start, exit, ...pieces]
  return new Set(positions.map(({ x, y }) => x + ',' + y)).size === positions.length
}

export function isFerryCommand(value: unknown): value is FerryCommand {
  return value === 'up' || value === 'right' || value === 'down' || value === 'left' || value === 'pick' || value === 'wait'
}

export function ferryGrid(level: GridLevel, layout: FerryRaceLayout): GridLevel {
  const { x, y } = layout.wall
  return {
    ...level,
    tiles: level.tiles.map((row, i) => i === y ? row.slice(0, x) + '#' + row.slice(x + 1) : row),
    items: level.items?.map((item, i) => ({ ...item, ...layout.batteries[i] })),
  }
}

export function ferryIssues(level: GridLevel): Issue[] {
  const race = level.ferry
  if (race?.kind !== 'race') return []
  const issues: Issue[] = []
  const report = (path: string, message: string) => issues.push({ path, code: 'ferry-race', message })
  const exits = level.objectives.filter(goal => goal.type === 'exit')
  const collect = level.objectives.find(goal => goal.type === 'collect')
  if (exits.length !== 1 || !collect || level.items?.length !== 2 || level.objectives.length !== 2
    || collect.itemIds.length !== 2 || !level.items.every(item => collect.itemIds.includes(item.id))) {
    report('/objectives', 'A ferry race needs two batteries to collect and a single dock.')
  }
  if (!level.turnLimit) report('/turnLimit', 'Set the ferry departure turn.')
  if (level.variants?.length || level.devices?.length || level.enemies?.length) {
    report('/ferry', 'Both runners use the same editable board with its movable wall and batteries.')
  }
  if (level.items?.length === 2 && !isFerryLayout(level, initialFerryLayout(level))) {
    report('/ferry/wall', 'Place the starting pieces on separate floor tiles away from the start and dock.')
  }
  if (!isFerryLayout(level, race.solutionLayout)) {
    report('/ferry/solutionLayout', 'Place the reference pieces on separate floor tiles away from the start and dock.')
  }
  return issues
}

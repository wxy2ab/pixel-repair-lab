import type { GridDevice, GridLevel, Issue, MirrorPlacement, Position } from './types'

const cell = ({ x, y }: Position) => x + ',' + y

export function initialMirrors(level: GridLevel): MirrorPlacement[] {
  if (level.laserTrial?.kind !== 'race') return []
  return level.laserTrial.mirrorIds.flatMap(id => {
    const device = level.devices?.find(candidate => candidate.id === id)
    return device?.kind === 'mirror' ? [{ x: device.x, y: device.y, orientation: device.orientation }] : []
  })
}

export function isMirrorLayout(level: GridLevel, value: unknown): value is MirrorPlacement[] {
  const race = level.laserTrial
  if (race?.kind !== 'race' || !Array.isArray(value) || value.length !== race.mirrorIds.length) return false
  const occupied = new Set([cell(level.start), ...level.objectives.filter(goal => goal.type === 'exit').map(cell),
    ...(level.devices ?? []).filter(device => !race.mirrorIds.includes(device.id)).map(cell)])
  for (const piece of value) {
    if (!piece || typeof piece !== 'object' || !Number.isInteger(piece.x) || !Number.isInteger(piece.y)
      || level.tiles[piece.y]?.[piece.x] !== '.' || (piece.orientation !== '/' && piece.orientation !== '\\')) return false
    const key = cell(piece)
    if (occupied.has(key)) return false
    occupied.add(key)
  }
  return true
}

export function mirrorGrid(level: GridLevel, mirrors: readonly MirrorPlacement[]): GridLevel {
  const race = level.laserTrial
  if (race?.kind !== 'race') return level
  const devices = level.devices?.map((device): GridDevice => {
    const index = race.mirrorIds.indexOf(device.id)
    if (device.kind !== 'mirror' || index < 0) return device
    const { x, y, orientation } = mirrors[index]
    return { ...device, x, y, orientation }
  })
  return { ...level, devices }
}

export function laserTrialIssues(level: GridLevel): Issue[] {
  const race = level.laserTrial
  if (!race) return []
  const issues: Issue[] = []
  const report = (path: string, message: string) => issues.push({ path, code: 'laser-trial', message })
  if (level.ferry) report('/laserTrial', 'A grid belongs to one short challenge series.')
  if (race.kind !== 'race') return issues
  if (!level.turnLimit) report('/turnLimit', 'Set the turn limit for both runners.')
  if (level.items?.length || level.enemies?.length || level.variants?.length
    || level.devices?.some(device => device.kind !== 'laser' && device.kind !== 'mirror')) {
    report('/devices', 'Use fixed lasers and mirrors so both runners see the same beams on a single board.')
  }
  if (level.objectives.length !== 1 || level.objectives[0].type !== 'exit' || !level.devices?.some(device => device.kind === 'laser')) {
    report('/objectives', 'The mirror race needs one exit and an active laser.')
  }
  if (!isMirrorLayout(level, initialMirrors(level))) {
    report('/laserTrial/mirrorIds', 'Each movable mirror must refer to a mirror on a separate floor tile away from the start and exit.')
  }
  if (!isMirrorLayout(level, race.solutionMirrors)) {
    report('/laserTrial/solutionMirrors', 'Give each movable mirror a separate floor tile away from fixed devices, the start and the exit.')
  }
  return issues
}

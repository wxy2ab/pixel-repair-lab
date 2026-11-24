import type { ArenaActor, ArenaEvent } from '../shared/advanced'
import type { Direction, Position } from '../shared/types'
import { gridOffsets } from '../shared/gridDevices'

export const isActive = (actor: ArenaActor) => actor.hp !== 0
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y
const cellAt = (position: Position, direction: Direction) => ({
  x: position.x + gridOffsets[direction].x, y: position.y + gridOffsets[direction].y,
})

/** A robot occupies its original square for the movement phase. Contested destinations stay empty. */
export function moveCombatants(tiles: string[], actors: ArenaActor[], events: ArenaEvent[]) {
  const destinations = events.map((event, index) => event.action === 'move' && event.direction
    ? cellAt(actors[index], event.direction) : undefined)
  const occupied = actors.filter(isActive).map(({ x, y }) => ({ x, y }))
  destinations.forEach((next, index) => {
    if (!next) return
    if (tiles[next.y]?.[next.x] !== '.' || occupied.some(actor => same(actor, next))
      || destinations.some((other, i) => i !== index && other && same(other, next))) {
      events[index].blocked = true
    } else {
      Object.assign(actors[index], next)
    }
  })
}

function pulse(tiles: string[], actors: ArenaActor[], from: ArenaActor, direction: Direction, range: number) {
  const path: Position[] = []
  let cell: Position = from
  for (let distance = 0; distance < range; distance++) {
    cell = cellAt(cell, direction)
    if (tiles[cell.y]?.[cell.x] !== '.') break
    path.push(cell)
    const hit = actors.find(actor => isActive(actor) && same(actor, cell))
    if (hit) return { path, hit }
  }
  return { path }
}

export function aimAtPlayer(tiles: string[], actors: ArenaActor[], from: ArenaActor, range: number) {
  const player = actors[0]
  const direction = player.x === from.x ? (player.y < from.y ? 'up' : 'down')
    : player.y === from.y ? (player.x < from.x ? 'left' : 'right') : undefined
  return direction && pulse(tiles, actors, from, direction, range).hit === player ? direction : undefined
}

/** Trace every shot against the same board before applying any damage. */
export function resolvePulses(tiles: string[], actors: ArenaActor[], events: ArenaEvent[], range: number) {
  const shots = events.flatMap((event, index) => {
    if (event.action !== 'shoot' || !event.direction) return []
    const source = actors[index]
    const { path, hit } = pulse(tiles, actors, source, event.direction, range)
    event.path = path
    if (!hit || (index !== 0 && hit !== actors[0])) return []
    event.targetId = hit.id
    return [{ event, hit, power: 1 + (source.power ?? 0) }]
  })
  const guarding = new Set(events.filter(event => event.action === 'guard').map(event => event.actorId))
  for (const { event, hit, power } of shots) {
    const incoming = power - Number(guarding.has(hit.id))
    const absorbedByShield = Math.min(incoming, hit.shield ?? 0)
    hit.shield = (hit.shield ?? 0) - absorbedByShield
    event.absorbed = power - incoming + absorbedByShield
    event.damage = Math.min(hit.hp ?? 0, incoming - absorbedByShield)
    hit.hp = (hit.hp ?? 0) - event.damage
  }
}

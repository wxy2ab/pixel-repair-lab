import type { ArenaScenario, ArenaSnapshot } from '../../shared/advanced'
import type { GridSnapshot, Position, Scenario } from '../../shared/types'

type MapTarget = Position & { id?: string }

export function arenaMapTargets({ objective }: ArenaScenario, snapshot: ArenaSnapshot): MapTarget[] {
  switch (objective.kind) {
    case 'score': return snapshot.items
    case 'eliminate': return snapshot.actors.slice(1).filter(actor => actor.hp !== 0)
    case 'collect': return snapshot.items.filter(item => objective.itemIds.includes(item.id))
    case 'escape': return [objective.exit, ...snapshot.items.filter(item => objective.itemIds.includes(item.id))]
  }
}

export function gridMapTargets(scenario: Scenario, snapshot: GridSnapshot): MapTarget[] {
  const exits = scenario.objectives.filter(goal => goal.type === 'exit')
  const requested = new Set(scenario.objectives.flatMap(goal => goal.type === 'collect' ? goal.itemIds : []))
  const chests = scenario.devices?.filter(device => device.kind === 'chest' && requested.has(device.id)
    && !snapshot.devices?.openedChests.includes(device.id)) ?? []
  return [...exits, ...snapshot.items.filter(item => requested.has(item.id)), ...chests]
}

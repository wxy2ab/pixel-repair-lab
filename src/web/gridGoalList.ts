import type { GridLevel, GridSnapshot, Locale, Origin, RunFrame, Scenario } from '../shared/types'
import { initialSnapshot } from '../engine/snapshot'
import { warehouseParked } from '../shared/warehouse'
import { tr } from './text'

export type GridGoal = { key: string; label: string; done: boolean; progress?: string }

const moveSources: Record<Origin, [string, string]> = {
  'list-index': ['按列表里取出的方向移动', 'Move in a direction read from the list'],
  'stack-pop': ['按栈顶取出的方向移动', 'Move in a direction popped from the stack'],
  'queue-pop': ['按队头取出的方向移动', 'Move in a direction taken from the queue'],
  'dict-index': ['按字典里查到的方向移动', 'Move in a direction looked up in the dictionary'],
  'memory-load': ['按内存里读出的方向移动', 'Move in a direction loaded from memory'],
}

/** What each objective of this map needs, and how far the shown moment of the run has come. */
export function gridGoals(scenario: Scenario & Pick<GridLevel, 'ferry'>, shown: GridSnapshot, frames: readonly RunFrame[], locale: Locale): GridGoal[] {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  // A collision frame shows the impact square. Credit objectives through the last successful action.
  const snapshot = frames.at(-1)?.issue ? frames.findLast(frame => !frame.issue)?.state ?? initialSnapshot(scenario) : shown
  const submitted = frames.filter(frame => frame.action === 'submit' && !frame.issue).length
  const moved = frames.some(frame => frame.action === 'move' && !frame.issue)
  let submissionsBefore = 0
  return scenario.objectives.map((objective, index): GridGoal => {
    const key = objective.type + index
    switch (objective.type) {
      case 'parkBoxes': {
        const targets = scenario.warehouse?.targets ?? []
        const parked = warehouseParked(snapshot.boxes ?? [], targets)
        return { key, label: t('把货箱推上所有货位', 'Fill every loading pad'), done: targets.length > 0 && parked === targets.length,
          progress: parked + ' / ' + targets.length }
      }
      case 'exit': return {
        key, label: scenario.ferry ? t('到码头登船', 'Board at the dock') : t('停在出口', 'Stop at the exit'),
        done: snapshot.player.x === objective.x && snapshot.player.y === objective.y,
      }
      case 'collect': {
        const opened = snapshot.devices?.openedChests ?? []
        const collected = objective.itemIds.filter(id => scenario.items?.some(item => item.id === id)
          ? !snapshot.items.some(item => item.id === id) : opened.includes(id)).length
        const total = objective.itemIds.length
        return {
          key, label: total === 1 ? t('拾取目标物品', 'Pick up the target') : t('拾取全部目标物品', 'Pick up every target'),
          done: collected === total, progress: collected + ' / ' + total,
        }
      }
      case 'submit': {
        const total = objective.values.length
        const count = Math.max(0, Math.min(total, submitted - submissionsBefore))
        submissionsBefore += total
        return {
          key, label: total === 1 ? t('提交正确的结果', 'Submit the right result') : t('依次提交正确的结果', 'Submit each right result in order'),
          done: count === total, progress: count + ' / ' + total,
        }
      }
      case 'moves': return { key, label: tr(locale, ...moveSources[objective.origin]), done: moved }
      case 'memory': return {
        key, label: t(`内存地址 ${objective.address} 存入 ${objective.value}`, `Store ${objective.value} at memory address ${objective.address}`),
        done: snapshot.memory[objective.address] === objective.value,
      }
      case 'halt': return { key, label: t('让 CPU 停机', 'Halt the CPU'), done: snapshot.halted }
    }
  })
}

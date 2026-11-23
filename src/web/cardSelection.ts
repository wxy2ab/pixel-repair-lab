import type { CardInstance } from '../shared/types'

export type CardEditAction = 'up' | 'down' | 'delete'

function siblingOrder(selected: boolean[], action: CardEditAction): number[] {
  const order = selected.map((_, index) => index)
  if (action === 'delete') return order.filter(index => !selected[index])

  // Visit the leading edge first so adjacent selected rows cross the same neighbor as a group.
  const movingUp = action === 'up'
  for (let step = 1; step < order.length; step++) {
    const position = movingUp ? step : order.length - 1 - step
    const neighbor = position + (movingUp ? -1 : 1)
    const index = order[position]
    if (selected[index] && !selected[order[neighbor]]) {
      order[position] = order[neighbor]
      order[neighbor] = index
    }
  }
  return order
}

export function editSelectedCards(cards: CardInstance[], selection: ReadonlySet<string>, action: CardEditAction) {
  const survivingPaths = new Map<string, number[]>()
  const nextSelection = new Set<string>()

  function editList(items: CardInstance[], oldParent: number[], newParent: number[], parentSelected: boolean): CardInstance[] {
    const oldPaths = items.map((_, index) => [...oldParent, index])
    const selected = oldPaths.map(path => selection.has(path.join('.')))
    // A selected block travels intact, including any checked descendants.
    const order = parentSelected ? items.map((_, index) => index) : siblingOrder(selected, action)
    let changed = order.length !== items.length
    const next = order.map((oldIndex, newIndex) => {
      const item = items[oldIndex]
      const oldPath = oldPaths[oldIndex]
      const newPath = [...newParent, newIndex]
      survivingPaths.set(oldPath.join('.'), newPath)
      if (selected[oldIndex]) nextSelection.add(newPath.join('.'))
      if (oldIndex !== newIndex) changed = true

      if (!item.children?.length) return item
      const children = editList(item.children, oldPath, newPath, parentSelected || selected[oldIndex])
      if (children === item.children) return item
      changed = true
      return { ...item, children }
    })
    return changed ? next : items
  }

  const next = editList(cards, [], [], false)

  function remapPath(path: readonly number[]): number[] {
    for (let depth = path.length; depth > 0; depth--) {
      const mapped = survivingPaths.get(path.slice(0, depth).join('.'))
      if (mapped) return mapped
    }
    return []
  }

  return { cards: next, selection: nextSelection, remapPath }
}

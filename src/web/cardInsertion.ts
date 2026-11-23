import type { CardInstance } from '../shared/types'

export function changeList(cards: CardInstance[], path: readonly number[],
  change: (items: CardInstance[]) => CardInstance[]): CardInstance[] {
  if (path.length === 0) return change(cards)
  const [index, ...rest] = path
  const block = cards[index]
  if (!block) return cards
  const children = block.children ?? []
  const updated = changeList(children, rest, change)
  if (updated === children) return cards
  const next = cards.slice()
  next[index] = { ...block, children: updated }
  return next
}

export function insertCommand(cards: CardInstance[], listPath: readonly number[], index: number, card: CardInstance): CardInstance[] {
  return changeList(cards, listPath, items => {
    if (!Number.isInteger(index) || index < 0 || index > items.length) return items
    return [...items.slice(0, index), card, ...items.slice(index)]
  })
}

export function pathAfterInsertion(path: number[], listPath: readonly number[], index: number): number[] {
  const depth = listPath.length
  if (depth >= path.length || path[depth] < index || !listPath.every((part, i) => path[i] === part)) return path
  const next = path.slice()
  next[depth]++
  return next
}

export type BreadthCell = [number, number]
export type BreadthFirstMap = { tiles: string[]; start: BreadthCell; goal: BreadthCell }
export type BreadthFirstResult = { order: BreadthCell[]; path: BreadthCell[] }
export type BreadthFirstLesson = {
  demo: BreadthFirstMap
  practice: BreadthFirstMap & {
    expected: BreadthFirstResult
    predictions: { orders: BreadthCell[][]; paths: BreadthCell[][] }
  }
}

const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const

export function sameBreadthCell(left: BreadthCell | undefined, right: BreadthCell | undefined): boolean {
  return left !== undefined && right !== undefined && left[0] === right[0] && left[1] === right[1]
}

export function walkableBreadthCell(tiles: readonly string[], [x, y]: BreadthCell): boolean {
  return tiles[y]?.[x] === '.'
}

export function breadthFirstReference({ tiles, start, goal }: BreadthFirstMap): BreadthFirstResult {
  const width = tiles[0].length
  const address = (cell: BreadthCell) => cell[1] * width + cell[0]
  const parents = new Map<number, BreadthCell | undefined>([[address(start), undefined]])
  const queue = [start]
  const order: BreadthCell[] = []
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]
    order.push(cell)
    if (sameBreadthCell(cell, goal)) {
      const path: BreadthCell[] = []
      for (let back: BreadthCell | undefined = cell; back; back = parents.get(address(back))) path.push(back)
      return { order, path: path.reverse() }
    }
    for (const [dx, dy] of directions) {
      const next: BreadthCell = [cell[0] + dx, cell[1] + dy]
      if (!walkableBreadthCell(tiles, next) || parents.has(address(next))) continue
      parents.set(address(next), cell)
      queue.push(next)
    }
  }
  return { order, path: [] }
}

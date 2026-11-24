import { useLayoutEffect, useRef } from 'react'

function movingTiles(board: HTMLDivElement) {
  const tiles = new Map<string, HTMLElement>()
  const repeated = new Set<string>()
  // The tray of removed batteries is also a history. Skip a name shown twice.
  for (const tile of board.querySelectorAll<HTMLElement>('[data-battery-name]')) {
    const name = tile.dataset.batteryName!
    if (tiles.has(name)) repeated.add(name)
    tiles.set(name, tile)
  }
  for (const name of repeated) tiles.delete(name)
  return tiles
}

/** Follow the same battery across trays even when React mounts it in a different list. */
export function useBatteryMotion(position: number) {
  const board = useRef<HTMLDivElement>(null)
  const previous = useRef(new Map<string, { x: number; y: number }>())
  const motions = useRef<Animation[]>([])

  function capture() {
    previous.current.clear()
    if (!board.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const origin = board.current.getBoundingClientRect()
    for (const [name, tile] of movingTiles(board.current)) {
      const rect = tile.getBoundingClientRect()
      previous.current.set(name, { x: rect.left - origin.left, y: rect.top - origin.top })
    }
  }

  useLayoutEffect(() => {
    for (const motion of motions.current) motion.cancel()
    motions.current = []
    if (!board.current || !previous.current.size || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const origin = board.current.getBoundingClientRect()
    for (const [name, tile] of movingTiles(board.current)) {
      const from = previous.current.get(name)
      if (!from) continue
      const rect = tile.getBoundingClientRect()
      const dx = from.x - (rect.left - origin.left), dy = from.y - (rect.top - origin.top)
      if (Math.abs(dx) + Math.abs(dy) < 2) continue
      motions.current.push(tile.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' },
      ], { duration: 460, easing: 'cubic-bezier(.24,.72,.2,1)' }))
    }
    previous.current.clear()
    return () => { for (const motion of motions.current) motion.cancel() }
  }, [position])
  return { board, capture }
}

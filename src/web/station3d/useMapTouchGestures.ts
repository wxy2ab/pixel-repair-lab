import { useEffectEvent, useLayoutEffect, type RefObject } from 'react'

type Point = { x: number; y: number }

/** Touch the scene to inspect, drag to pan, or spread two fingers to zoom. */
export function useMapTouchGestures(surfaceRef: RefObject<HTMLElement | null>, enabled: boolean,
  pan: (dx: number, dy: number) => void, zoom: (factor: number) => void, onTap: (point: Point) => void) {
  const tap = useEffectEvent(onTap)
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !enabled) return
    const contacts = new Map<number, Point>()
    let moved = false
    let suppressClick = false
    function start(event: PointerEvent) {
      if (!contacts.size) suppressClick = false
      if (event.pointerType !== 'touch') return
      event.stopImmediatePropagation()
      contacts.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (contacts.size === 1) moved = false
      else moved = true // Lifting one finger after a pinch must never inspect a cell.
    }
    function move(event: PointerEvent) {
      const previous = contacts.get(event.pointerId)
      if (!previous) return
      event.stopImmediatePropagation()
      const point = { x: event.clientX, y: event.clientY }
      const dx = previous.x - point.x, dy = previous.y - point.y
      if (contacts.size === 1) {
        if (!moved && Math.hypot(dx, dy) < 5) return
        moved = true
        pan(dx, dy)
      } else if (contacts.size === 2) {
        const other = [...contacts].find(([id]) => id !== event.pointerId)![1]
        const before = Math.hypot(previous.x - other.x, previous.y - other.y)
        const after = Math.hypot(point.x - other.x, point.y - other.y)
        if (before >= 4 && after >= 4) zoom(after / before)
      }
      contacts.set(event.pointerId, point)
    }
    function end(event: PointerEvent) {
      if (!contacts.delete(event.pointerId)) return
      event.stopImmediatePropagation()
      if (event.type === 'pointercancel') moved = true
      suppressClick = moved
      if (!moved && !contacts.size) tap({ x: event.clientX, y: event.clientY })
    }
    function click(event: MouseEvent) {
      if (suppressClick && event.detail > 0) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // Touch pointers implicitly capture their initial target, including a 2D tile.
    surface.addEventListener('pointerdown', start, true)
    surface.addEventListener('pointermove', move, true)
    surface.addEventListener('pointerup', end, true)
    surface.addEventListener('pointercancel', end, true)
    surface.addEventListener('click', click, true)
    return () => {
      surface.removeEventListener('pointerdown', start, true)
      surface.removeEventListener('pointermove', move, true)
      surface.removeEventListener('pointerup', end, true)
      surface.removeEventListener('pointercancel', end, true)
      surface.removeEventListener('click', click, true)
    }
  }, [surfaceRef, enabled, pan, zoom])
}

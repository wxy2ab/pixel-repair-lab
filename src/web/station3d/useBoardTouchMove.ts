import { useEffectEvent, useLayoutEffect, type RefObject } from 'react'
import type { Direction } from '../../shared/types'

/** One completed finger swipe on the playing surface moves one grid square. */
export function useBoardTouchMove(surfaceRef: RefObject<HTMLElement | null>, onMove: ((direction: Direction) => void) | null,
  projectSwipe?: (dx: number, dy: number) => Direction | undefined) {
  const move = useEffectEvent((dx: number, dy: number) => {
    const projected = projectSwipe?.(dx, dy)
    if (projected) onMove?.(projected)
    else if (Math.abs(dx) > Math.abs(dy)) onMove?.(dx > 0 ? 'right' : 'left')
    else onMove?.(dy > 0 ? 'down' : 'up')
  })
  const enabled = Boolean(onMove)
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !enabled) return
    let swipe: { id: number; x: number; y: number } | undefined
    let touchClick = false

    function checkContacts(event: PointerEvent) {
      // A second finger anywhere, including on the toolbar, cancels the pending move.
      if (event.pointerType === 'touch' && !event.isPrimary) swipe = undefined
    }
    function start(event: PointerEvent) {
      if (event.pointerType !== 'touch') {
        touchClick = false
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation() // The camera also listens on this surface.
      touchClick = true
      if (event.isPrimary) swipe = { id: event.pointerId, x: event.clientX, y: event.clientY }
    }
    function finish(event: PointerEvent) {
      if (!swipe || event.pointerId !== swipe.id) return
      const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y
      swipe = undefined
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
      move(dx, dy)
    }
    function cancel() { swipe = undefined }
    function click(event: MouseEvent) {
      // Some touch browsers still synthesize a click after a cancelled pointerdown.
      if (touchClick && event.detail > 0) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    surface.addEventListener('pointerdown', start, { capture: true, passive: false })
    window.addEventListener('pointerdown', checkContacts, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', cancel)
    surface.addEventListener('lostpointercapture', cancel)
    surface.addEventListener('click', click, true)
    return () => {
      surface.removeEventListener('pointerdown', start, true)
      window.removeEventListener('pointerdown', checkContacts, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', cancel)
      surface.removeEventListener('lostpointercapture', cancel)
      surface.removeEventListener('click', click, true)
    }
  }, [surfaceRef, enabled])
}

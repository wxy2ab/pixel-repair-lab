import { useEffectEvent, useLayoutEffect, type RefObject } from 'react'
import type { Direction } from '../../shared/types'

/** Dispatch one action on release. Leave a gap between tapping and swiping. */
export function useBoardTouchMove(surfaceRef: RefObject<HTMLElement | null>, onMove: ((direction: Direction) => void) | null,
  mapNavigation: boolean, projectSwipe?: (dx: number, dy: number) => Direction | undefined, onTap?: (x: number, y: number) => void) {
  const tap = useEffectEvent((x: number, y: number) => onTap?.(x, y))
  const move = useEffectEvent((dx: number, dy: number) => {
    const projected = projectSwipe?.(dx, dy)
    if (projected) onMove?.(projected)
    else if (Math.abs(dx) > Math.abs(dy)) onMove?.(dx > 0 ? 'right' : 'left')
    else onMove?.(dy > 0 ? 'down' : 'up')
  })
  const enabled = Boolean(onMove)
  const captureDrag = enabled || mapNavigation
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !captureDrag) return
    // Native scrolling can swallow the next toolbar tap even when pointer events handled the drag.
    function touchMove(event: TouchEvent) { if (event.cancelable) event.preventDefault() }
    surface.addEventListener('touchmove', touchMove, { passive: false })
    return () => surface.removeEventListener('touchmove', touchMove)
  }, [surfaceRef, captureDrag])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !enabled) return
    let swipe: { id: number; x: number; y: number; canTap: boolean } | undefined
    let touchClick = false

    function checkContacts(event: PointerEvent) {
      // Another contact, including a tap on the toolbar, cancels the pending move.
      if (swipe && event.pointerId !== swipe.id) swipe = undefined
    }
    function start(event: PointerEvent) {
      if (event.pointerType !== 'touch') {
        touchClick = false
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation() // The camera also listens on this surface.
      touchClick = true
      if (event.isPrimary) swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, canTap: true }
    }
    function track(event: PointerEvent) {
      if (swipe?.id === event.pointerId && Math.hypot(event.clientX - swipe.x, event.clientY - swipe.y) > 8) {
        swipe.canTap = false
      }
    }
    function finish(event: PointerEvent) {
      if (!swipe || event.pointerId !== swipe.id) return
      const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y
      const canTap = swipe.canTap && Math.hypot(dx, dy) <= 8
      swipe = undefined
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) move(dx, dy)
      else if (canTap) tap(event.clientX, event.clientY)
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
    window.addEventListener('pointermove', track, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', cancel, true)
    window.addEventListener('blur', cancel)
    surface.addEventListener('lostpointercapture', cancel)
    surface.addEventListener('click', click, true)
    return () => {
      surface.removeEventListener('pointerdown', start, true)
      window.removeEventListener('pointerdown', checkContacts, true)
      window.removeEventListener('pointermove', track, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('keydown', cancel, true)
      window.removeEventListener('blur', cancel)
      surface.removeEventListener('lostpointercapture', cancel)
      surface.removeEventListener('click', click, true)
    }
  }, [surfaceRef, enabled])
}

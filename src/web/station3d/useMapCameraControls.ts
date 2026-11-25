import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { isWorkspaceShortcut } from '../ArenaMapMode'
import type { Position } from '../../shared/types'
import type { createStationRenderer } from './renderer'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const zoomStep = 1.2
const panKeys: Record<string, [number, number]> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] }

export function useMapCameraControls(active: boolean, keyboardEnabled: boolean, view: '2d' | '3d', canvas: RefObject<HTMLCanvasElement | null>,
  engine: RefObject<ReturnType<typeof createStationRenderer> | null>, showOverview: () => void, columns: number, rows: number,
  onFootprint: (points: Position[]) => void) {
  const flat = useRef<HTMLDivElement>(null)
  const camera = useRef({ zoom: 1, x: 0, y: 0 })

  const measureFlat = useCallback(() => {
    if (!active || view !== '2d') return
    const surface = flat.current
    const grid = surface?.querySelector('.tilemap')
    const first = grid?.firstElementChild?.getBoundingClientRect()
    if (!surface || !grid || !first?.width || !first.height) return
    const board = grid.getBoundingClientRect()
    const viewport = surface.getBoundingClientRect()
    // Use the cell pitch, including the gap between tiles. Axis labels are outside the grid.
    const dx = columns > 1 ? (board.width - first.width) / (columns - 1) : first.width
    const dy = rows > 1 ? (board.height - first.height) / (rows - 1) : first.height
    if (dx <= 0 || dy <= 0) return
    const originX = first.left + (first.width - dx) / 2
    const originY = first.top + (first.height - dy) / 2
    const left = clamp((viewport.left - originX) / dx, 0, columns)
    const right = clamp((viewport.right - originX) / dx, 0, columns)
    const top = clamp((viewport.top - originY) / dy, 0, rows)
    const bottom = clamp((viewport.bottom - originY) / dy, 0, rows)
    onFootprint(left < right && top < bottom ? [
      { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom },
    ] : [])
  }, [active, view, columns, rows, onFootprint])

  const paintFlat = useCallback(() => {
    const { zoom, x, y } = camera.current
    flat.current?.style.setProperty('--map-zoom', String(zoom))
    flat.current?.style.setProperty('--map-shift-x', -x * 100 + '%')
    flat.current?.style.setProperty('--map-shift-y', -y * 100 + '%')
    measureFlat()
  }, [measureFlat])

  const zoom = useCallback((factor: number) => {
    if (view === '3d') return engine.current?.zoom(factor)
    camera.current.zoom = clamp(camera.current.zoom * factor, .65, 5)
    paintFlat()
  }, [view, engine, paintFlat])

  const pan = useCallback((dx: number, dy: number) => {
    if (view === '3d') return engine.current?.pan(dx, dy)
    const board = flat.current?.querySelector('.map-well')?.getBoundingClientRect()
    if (!board?.width || !board.height) return
    camera.current.x = clamp(camera.current.x + dx / board.width, -.5, .5)
    camera.current.y = clamp(camera.current.y + dy / board.height, -.5, .5)
    paintFlat()
  }, [view, engine, paintFlat])

  function centerOn(cell: Position) {
    if (view === '3d') {
      if (engine.current?.centerMapOn(cell) === 'overview') showOverview()
      return
    }
    const surface = flat.current
    const tile = surface?.querySelector('.tilemap')?.children[cell.y * columns + cell.x]
    if (!surface || !tile) return
    const target = tile.getBoundingClientRect()
    const viewport = surface.getBoundingClientRect()
    pan(target.left + target.width / 2 - viewport.left - viewport.width / 2,
      target.top + target.height / 2 - viewport.top - viewport.height / 2)
  }

  const fit = useCallback(() => {
    if (view === '3d') {
      engine.current?.setCamera('overview')
      showOverview()
    } else {
      camera.current = { zoom: 1, x: 0, y: 0 }
      paintFlat()
    }
  }, [view, engine, showOverview, paintFlat])

  useEffect(() => {
    if (!active || !keyboardEnabled) return
    const surface: HTMLElement | null = view === '2d' ? flat.current : canvas.current
    const workspace = surface?.closest('.arena-layout') ?? null
    if (!workspace) return
    function keyDown(event: KeyboardEvent) {
      if (!isWorkspaceShortcut(event, workspace)) return
      const key = event.key.toLowerCase()
      const direction = panKeys[key]
      if (direction) pan(direction[0] * 44, direction[1] * 44)
      else if (key === '+' || key === '=') zoom(zoomStep)
      else if (key === '-' || key === '_') zoom(1 / zoomStep)
      else if (key === 'home') fit()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [active, keyboardEnabled, view, canvas, pan, zoom, fit])

  useEffect(() => {
    if (!active) return
    const surface: HTMLElement | null = view === '2d' ? flat.current : canvas.current
    if (!surface) return
    // A new full-map session begins with a fitted flat board.
    if (view === '2d') { camera.current = { zoom: 1, x: 0, y: 0 }; paintFlat() }
    function wheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || !event.deltaY) return
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface!.clientHeight : 1)
      zoom(Math.exp(clamp(-delta * .002, -.35, .35)))
    }
    surface.addEventListener('wheel', wheel, { passive: false })
    const observer = view === '2d' ? new ResizeObserver(measureFlat) : undefined
    observer?.observe(surface)
    return () => {
      observer?.disconnect()
      surface.removeEventListener('wheel', wheel)
    }
  }, [active, view, canvas, zoom, paintFlat, measureFlat])

  useEffect(() => {
    const surface = flat.current
    if (!active || view !== '2d' || !surface) return
    let drag: { id: number; x: number; y: number; moved: boolean } | undefined
    let suppressClick = false
    function down(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return
      suppressClick = false
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    }
    function move(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return
      const dx = drag.x - event.clientX, dy = drag.y - event.clientY
      if (!drag.moved && Math.hypot(dx, dy) < 5) return
      if (!drag.moved) surface!.setPointerCapture(event.pointerId)
      drag = { ...drag, x: event.clientX, y: event.clientY, moved: true }
      pan(dx, dy)
    }
    function end(event: PointerEvent) {
      if (event.pointerId !== drag?.id) return
      suppressClick = drag.moved
      drag = undefined
      if (surface!.hasPointerCapture(event.pointerId)) surface!.releasePointerCapture(event.pointerId)
    }
    function click(event: MouseEvent) {
      if (suppressClick) { event.stopPropagation(); suppressClick = false }
    }
    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointermove', move)
    surface.addEventListener('click', click, true)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      surface.removeEventListener('pointerdown', down)
      surface.removeEventListener('pointermove', move)
      surface.removeEventListener('click', click, true)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [active, view, pan])
  return { flat, zoom, fit, centerOn }
}

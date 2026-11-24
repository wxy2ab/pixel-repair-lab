import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GridSnapshot, Locale, Position, Warehouse } from '../shared/types'
import { warehouseParked, warehousePushDestination } from '../shared/warehouse'
import type { WarehouseArrival } from './station3d/types'
import { useArenaMapMode } from './ArenaMapMode'
import { useVisibleMapWin } from './FullscreenVictory'
import { soundWarehouseCue } from './warehouseSound'
import { tr } from './text'
import './warehouse-feedback.css'

// Compare the frames that the child actually watched. A jump to a result, an undo or a restored
// draft can also put a crate on a pad, but none represents a push the child just performed.
export function useWarehouseArrival(warehouse: Warehouse | undefined, snapshot: GridSnapshot) {
  const previous = useRef<{ warehouse: Warehouse; snapshot: GridSnapshot } | undefined>(undefined)
  const [arrival, setArrival] = useState<WarehouseArrival>()
  const clear = useCallback(() => { previous.current = undefined; setArrival(undefined) }, [])
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = warehouse ? { warehouse, snapshot } : undefined
    if (!warehouse || warehouse !== before?.warehouse || snapshot.turn < before.snapshot.turn) {
      setArrival(undefined)
      return
    }
    const destination = warehousePushDestination(before.snapshot, snapshot)
    if (destination && warehouse.targets.some(pad => pad.x === destination.x && pad.y === destination.y)) {
      setArrival({ ...destination, id: performance.now() })
      if (warehouseParked(snapshot.boxes!, warehouse.targets) < warehouse.targets.length) soundWarehouseCue('arrival')
    }
  }, [warehouse, snapshot])
  useEffect(() => {
    if (!arrival) return
    const timer = window.setTimeout(() => setArrival(current => current === arrival ? undefined : current), 1150)
    return () => window.clearTimeout(timer)
  }, [arrival])
  return { arrival, clear }
}

export function WarehousePads({ targets, boxes, arrival, locale }: {
  targets: readonly Position[]; boxes: readonly Position[]; arrival?: WarehouseArrival; locale: Locale
}) {
  const occupied = targets.map(pad => boxes.some(box => box.x === pad.x && box.y === pad.y))
  const parked = occupied.filter(Boolean).length
  return <span className="warehouse-pads">{tr(locale, '货位', 'Pads')} <b>{parked}/{targets.length}</b>
    <span className="warehouse-pads__lights" aria-hidden="true">{targets.map(({ x, y }, index) => {
      const active = occupied[index] && arrival?.x === x && arrival.y === y
      return <i key={active ? 'lit-' + arrival.id : index} data-filled={occupied[index] || undefined} data-lit={active || undefined}>
        {occupied[index] && '✓'}
      </i>
    })}</span>
  </span>
}

export function warehouseDeliveryText(crates: number, moves: number, pushes: number) {
  return { zh: `${crates} 箱全部就位 · ${moves} 步 · 推箱 ${pushes} 次`,
    en: `${crates === 1 ? '1 crate delivered' : `All ${crates} crates delivered`} · ${moves} ${moves === 1 ? 'move' : 'moves'} · ${pushes} ${pushes === 1 ? 'push' : 'pushes'}` }
}

export function WarehouseReceipt({ locale, crates, moves, pushes, hasSummary }: {
  locale: Locale; crates: number; moves: number; pushes: number; hasSummary: boolean
}) {
  const fullscreen = useArenaMapMode()
  useVisibleMapWin(fullscreen)
  return <div role="status" className="warehouse-receipt" data-testid="warehouse-receipt">
    <svg viewBox="0 0 52 52" className="warehouse-receipt__seal" fill="none" aria-hidden="true">
      <path d="m26 2 6 3.2 6.8.8 3 6.1 4.9 4.8-.7 6.8 1.8 6.6-4.3 5.4-2.4 6.4-6.6 1.7-5.6 3.9-6.6-2-6.8.3-4.5-5.1-5.9-3.4-.3-6.9L2 26l3.2-6-.1-6.8 5.5-4.1 3.7-5.7 6.8.3Z" fill="#efc476"/>
      <circle cx="26" cy="25" r="16" stroke="#66461c" strokeWidth="1.6" strokeDasharray="2 2"/>
      <path d="m17 25 6 6 12-14" stroke="#3b351d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <div><strong>{tr(locale, '整仓交付！', 'Shipment complete!')}</strong>
      <span>{warehouseDeliveryText(crates, moves, pushes)[locale]}</span></div>
    {hasSummary && !fullscreen && <button type="button" className="text-button" onClick={() => {
      const summary = document.getElementById('challenge-completion-title')?.closest<HTMLElement>('.challenge-completion')
      summary?.focus({ preventScroll: true })
      summary?.scrollIntoView({ block: 'start' })
    }}>{tr(locale, '看成绩', 'See score')} <span aria-hidden="true">↗</span></button>}
  </div>
}

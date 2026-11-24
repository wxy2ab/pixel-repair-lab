import { useState, type CSSProperties } from 'react'
import type { Locale, Position } from '../shared/types'
import { cargoArrivalDuration, type WarehouseArrival } from './station3d/types'
import { tr } from './text'
import './warehouse-tiles.css'

export function cargoLabel(hasBox: boolean, hasPad: boolean, locale: Locale) {
  if (hasBox && hasPad) return tr(locale, '已归位的货箱', 'Parked crate')
  if (hasBox) return tr(locale, '货箱', 'Crate')
  if (hasPad) return tr(locale, '空货位', 'Empty loading pad')
}

export function LoadingPadGlyph() {
  return <svg className="loading-pad" aria-hidden="true" viewBox="0 0 32 32" fill="none">
    <path d="M3 11V3h8m10 0h8v8m0 10v8h-8m-10 0H3v-8" stroke="currentColor" strokeWidth="3" />
    <path d="m16 10 6 6-6 6-6-6z" stroke="currentColor" strokeWidth="2" />
  </svg>
}

export function CargoGlyph({ parked = false }: { parked?: boolean }) {
  return <svg className="cargo-glyph" viewBox="0 0 32 32" aria-hidden="true" data-parked={parked || undefined}>
    <rect x="2" y="4" width="28" height="26" rx="3" fill="#50382c" />
    <rect x="2" y="2" width="28" height="25" rx="3" fill="#f3af62" stroke="#573a2a" strokeWidth="1.5" />
    <path d="M6 6h20v17H6z" fill="#ab653c" />
    <path d="m7 7 18 15M25 7 7 22" fill="none" stroke="#ffd194" strokeWidth="3" />
    {parked && <g>
      <rect x="5" y="5" width="22" height="19" rx="3" fill="#256852" stroke="#acffd1" strokeWidth="1.5" />
      <path d="m10 14 4 4 8-9" fill="none" stroke="#d8ffde" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </g>}
  </svg>
}

function CargoArrival({ arrival }: { arrival: WarehouseArrival }) {
  // Switching board views during a delivery keeps the same point in the animation.
  const [elapsed] = useState(() => Math.max(0, performance.now() - arrival.id))
  if (elapsed >= cargoArrivalDuration) return null
  return <span style={{ '--crate-x': arrival.x, '--crate-y': arrival.y,
    '--arrival-duration': cargoArrivalDuration + 'ms', '--arrival-delay': -elapsed + 'ms' } as CSSProperties}>
    <svg className="cargo-arrival" data-x={arrival.x} data-y={arrival.y} viewBox="0 0 40 40" aria-hidden="true">
      <rect className="cargo-arrival__ring" x="2" y="2" width="36" height="36" rx="6" stroke="#8affd2" strokeWidth="2.6" fill="none" />
      <g className="cargo-arrival__seal">
        <path d="m20 0 8 4.6v8.8L20 18l-8-4.6V4.6Z" fill="#174f43" stroke="#ffde83" strokeWidth="1.9" />
        <path d="m15.8 8.7 2.9 3 5.7-6" stroke="#d6ffcd" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="m7 11 1.1 2.5L11 15l-2.9 1.3L7 19l-1.1-2.7L3 15l2.9-1.5Zm26-6 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="#ffde83" />
      </g>
    </svg>
  </span>
}

// Stable elements let the crates slide between the tiles that carry their inspection coordinates.
export function CargoOverlay({ boxes, targets, arrival }: { boxes: readonly Position[]; targets: readonly Position[]; arrival?: WarehouseArrival }) {
  return <div className="cargo-overlay" aria-hidden="true">{boxes.map(({ x, y }, index) =>
    <span key={index} style={{ '--crate-x': x, '--crate-y': y } as CSSProperties}>
      <CargoGlyph parked={targets.some(pad => pad.x === x && pad.y === y)} />
    </span>)}
    {arrival && boxes.some(box => box.x === arrival.x && box.y === arrival.y)
      && targets.some(pad => pad.x === arrival.x && pad.y === arrival.y) && <CargoArrival key={arrival.id} arrival={arrival} />}
  </div>
}

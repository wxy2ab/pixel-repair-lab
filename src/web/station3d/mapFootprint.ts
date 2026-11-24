import type { Frustum } from 'three'
import type { Position } from '../../shared/types'

/** Intersect the map floor with the camera's six clipping planes.
 * Mini-map coordinates start at the corner of cell (0, 0), half a tile before its world-space centre.
 */
export function visibleMapFloor(frustum: Frustum, columns: number, rows: number): Position[] {
  let polygon: Position[] = [{ x: 0, y: 0 }, { x: columns, y: 0 }, { x: columns, y: rows }, { x: 0, y: rows }]
  for (const { normal, constant } of frustum.planes) {
    const distance = (point: Position) => normal.x * (point.x - .5) + normal.z * (point.y - .5) + constant
    const clipped: Position[] = []
    let previous = polygon[polygon.length - 1]
    let before = distance(previous)
    for (const point of polygon) {
      const after = distance(point)
      if (before < 0 && after > 0 || before > 0 && after < 0) {
        const amount = before / (before - after)
        clipped.push({ x: previous.x + (point.x - previous.x) * amount, y: previous.y + (point.y - previous.y) * amount })
      }
      if (after >= 0) clipped.push(point)
      previous = point
      before = after
    }
    if (clipped.length < 3) return []
    polygon = clipped
  }
  return polygon
}

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { visibleMapFloor } from '../src/web/station3d/mapFootprint'
import type { Position } from '../src/shared/types'

const columns = 20, rows = 13

function footprint(camera: PerspectiveCamera) {
  camera.updateMatrixWorld()
  const transform = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  return visibleMapFloor(new Frustum().setFromProjectionMatrix(transform), columns, rows)
}

test('an overview includes every tile up to its outside edge', () => {
  const camera = new PerspectiveCamera(38, 1.5, .05, 200)
  camera.position.set(9.5, 40, 16)
  camera.lookAt(9.5, 0, 6)
  assert.deepEqual(footprint(camera), [
    { x: 0, y: 0 }, { x: columns, y: 0 }, { x: columns, y: rows }, { x: 0, y: rows },
  ])
})

test('a rotated, close camera footprint contains exactly the visible region of the board', () => {
  const camera = new PerspectiveCamera(38, 1.2, .05, 70)
  camera.position.set(18, 5, 14)
  camera.lookAt(13, 0, 9)
  const polygon = footprint(camera)
  assert.ok(polygon.length >= 3)
  assert.ok(polygon.every(p => p.x >= 0 && p.y >= 0 && p.x <= columns && p.y <= rows))
  function insidePolygon(x: number, y: number) {
    const leftOfEdge = (a: Position, b: Position) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0
    return polygon.every((p, index) => leftOfEdge(p, polygon[(index + 1) % polygon.length]))
  }
  let visible = 0
  for (let x = .17; x < columns; x += .5) {
    for (let y = .23; y < rows; y += .5) {
      const projected = new Vector3(x - .5, 0, y - .5).project(camera)
      const onScreen = projected.toArray().every(axis => Math.abs(axis) <= 1)
      assert.equal(insidePolygon(x, y), onScreen, `floor point (${x}, ${y})`)
      if (onScreen) visible++
    }
  }
  assert.ok(visible > 0 && visible < 4 * columns * rows)
})

import * as THREE from 'three'
import { cargoArrivalDuration, type WarehouseArrival } from './types'

/** A delivery seal faces the camera, while its mint rim stays under the delivered crate. */
export function makeCargoArrival() {
  const group = new THREE.Group()
  const seal = new THREE.Group()
  const material = (color: number) => new THREE.MeshBasicMaterial({
    color, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  })
  const rim = material(0x83ffd1), gold = material(0xffdb77), teal = material(0x174c41), ivory = material(0xdfffd5)
  const materials = [rim, gold, teal, ivory]
  const ringShape = new THREE.RingGeometry(.89, 1, 4)
  ringShape.rotateZ(Math.PI / 4)
  ringShape.rotateX(-Math.PI / 2)
  const ring = new THREE.Mesh(ringShape, rim)
  ring.position.y = .046
  const hexagon = new THREE.CircleGeometry(.24, 6, Math.PI / 2)
  const badge = new THREE.Mesh(hexagon, gold)
  const face = new THREE.Mesh(hexagon, teal)
  face.scale.setScalar(.85)
  face.position.z = .006
  const tick = new THREE.Shape([
    new THREE.Vector2(-.14, .006), new THREE.Vector2(-.045, -.09), new THREE.Vector2(.14, .102),
    new THREE.Vector2(.10, .14), new THREE.Vector2(-.045, -.01), new THREE.Vector2(-.10, .047),
  ])
  const tickShape = new THREE.ShapeGeometry(tick)
  const check = new THREE.Mesh(tickShape, ivory)
  check.position.z = .013
  const diamond = new THREE.CircleGeometry(1, 4)
  for (const [x, y, size] of [[-.31, .065, .065], [.29, .12, .045], [.32, -.05, .03]]) {
    const spark = new THREE.Mesh(diamond, gold)
    spark.position.set(x, y, 0)
    spark.scale.set(size * .68, size, 1)
    seal.add(spark)
  }
  // Keep the layered emblem legible even when a nearly overhead camera changes transparent draw order.
  badge.renderOrder = 3
  face.renderOrder = 4
  check.renderOrder = 5
  seal.add(badge, face, check)
  group.add(ring, seal)
  group.visible = false

  function draw(arrival: WarehouseArrival, now: number, camera: THREE.Quaternion, reduced: boolean) {
    const life = Math.max(0, (now - arrival.id) / cargoArrivalDuration)
    group.visible = life < 1
    if (!group.visible) return false
    const fadeIn = THREE.MathUtils.clamp((life - .11) / .14, 0, 1)
    const fadeOut = THREE.MathUtils.clamp((1 - life) / .23, 0, 1)
    const opacity = reduced ? 1 : fadeIn * fadeOut
    for (const mat of materials) mat.opacity = opacity
    group.position.set(arrival.x, 0, arrival.y)
    ring.scale.setScalar(reduced ? .67 : .54 + Math.min(1, life * 1.65) * .2)
    seal.position.y = reduced ? .97 : .76 + fadeIn * .20 + (1 - fadeOut) * .1
    seal.quaternion.copy(camera)
    return !reduced
  }
  function dispose() {
    for (const geometry of [ringShape, hexagon, tickShape, diamond]) geometry.dispose()
    for (const mat of materials) mat.dispose()
  }
  return { group, draw, dispose }
}

import * as THREE from 'three'
import type { ArenaEvent } from '../../shared/advanced'
import { gridOffsets } from '../../shared/gridDevices'
import { arenaMotionMs, type ArenaTurnMotion } from '../arenaTurnMotion'
import type { RobotRig } from './robotActivity'

export type ArenaStrike = { at: number; dx: number; dz: number; damage: number }

const smooth = THREE.MathUtils.smoothstep
function beat(value: number, begin: number, peak: number, end: number) {
  return smooth(value, begin, peak) * (1 - smooth(value, peak, end))
}

// Feet plant before the first stride and absorb the landing just after the chassis reaches the cell.
export function arenaTravel(step: number) {
  return smooth(step, .055, .94)
}

/** Adds the combat pose on top of the neutral, breathing rig. World-space recoil follows the actual ray. */
export function poseArenaRobot(body: THREE.Group, rig: RobotRig, turn: ArenaTurnMotion, time: number,
  event: ArenaEvent | undefined, hits: readonly ArenaStrike[] | undefined, downAt: number | undefined) {
  const { spine, head, arms, hands, legs } = rig
  if (event?.action === 'move' && event.direction) {
    const step = Math.min(1, time / turn.moveMs)
    const travel = arenaTravel(step)
    const bracing = beat(step, 0, .11, .32)
    const planting = beat(step, .70, .88, 1)
    const stride = Math.sin(2 * Math.PI * travel) * (event.blocked ? .38 : 1)
    spine.position.y += .026 * stride * stride - .036 * (bracing + planting)
    spine.rotation.x += .16 * bracing + .11 * beat(step, .05, .38, .83) - .08 * planting
    spine.rotation.z += .052 * stride
    head.rotation.x -= spine.rotation.x * .55
    head.rotation.z -= .060 * stride
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      arms[i].rotation.x -= .72 * stride * side
      legs[i].rotation.x += .71 * stride * side - .10 * (bracing + planting)
    }
    if (event.blocked) {
      const offset = gridOffsets[event.direction]
      const bump = .14 * beat(step, .04, .40, .94)
      body.position.x += offset.x * bump
      body.position.z += offset.y * bump
    }
  }
  if (event?.action === 'shoot' && event.direction) {
    const age = time - turn.fireAtMs
    const aim = smooth(age, -arenaMotionMs.windup, -10) * (1 - smooth(age, 70, arenaMotionMs.recoil))
    const kick = beat(age, -6, 65, arenaMotionMs.recoil)
    const direction = gridOffsets[event.direction]
    spine.position.y -= .040 * aim
    spine.rotation.x += .13 * aim - .27 * kick
    head.rotation.x -= .12 * aim
    arms[1].rotation.x -= 1.53 * aim
    arms[1].rotation.z -= .18 * aim
    hands[1].rotation.x -= .14 * aim
    arms[0].rotation.x -= .67 * aim
    legs[0].rotation.x += .22 * aim
    legs[1].rotation.x -= .21 * aim
    body.position.x -= direction.x * .075 * kick
    body.position.z -= direction.y * .075 * kick
  }
  for (const hit of hits ?? []) {
    const age = time - hit.at
    const weight = hit.damage > 0 ? 1 : .35
    const kick = weight * (beat(age, 0, 80, 260) - .20 * beat(age, 180, 245, arenaMotionMs.impact))
    const yaw = body.rotation.y
    const side = hit.dx * Math.cos(yaw) - hit.dz * Math.sin(yaw)
    const forward = hit.dx * Math.sin(yaw) + hit.dz * Math.cos(yaw)
    body.position.x += .105 * hit.dx * kick
    body.position.z += .105 * hit.dz * kick
    spine.rotation.x += .32 * forward * kick
    spine.rotation.z -= .32 * side * kick
    head.rotation.x += .15 * forward * kick
    head.rotation.z -= .15 * side * kick
    arms[0].rotation.z -= .23 * kick
    arms[1].rotation.z += .23 * kick
  }
  if (downAt === undefined) return 0
  const shutdown = THREE.MathUtils.clamp((time - downAt) / arenaMotionMs.shutdown, 0, 1)
  const buckle = smooth(shutdown, .09, .70)
  spine.position.y -= .175 * buckle
  spine.rotation.x += .52 * buckle
  head.rotation.x += .65 * smooth(shutdown, .18, .81)
  rig.eyes.scale.y *= 1 - smooth(shutdown, .23, .64)
  legs[0].rotation.x -= .72 * buckle
  legs[1].rotation.x -= .49 * buckle
  arms[0].rotation.x -= .33 * buckle
  arms[1].rotation.z += .28 * buckle
  return shutdown
}

// Arena models share their normal materials. Only the retiring robot should dim and fade.
export function fadeDisabledRobot(robot: THREE.Group) {
  const copies = new Map<THREE.Material, THREE.Material>()
  const originals: { node: THREE.Mesh | THREE.Sprite; material: THREE.Material | THREE.Material[] }[] = []
  const copy = (original: THREE.Material) => {
    let material = copies.get(original)
    if (!material) {
      material = original.clone()
      material.transparent = true
      copies.set(original, material)
    }
    return material
  }
  robot.traverse(node => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Sprite)) return
    originals.push({ node, material: node.material })
    node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material)
  })
  return {
    draw(progress: number) {
      const fade = smooth(progress, .45, 1)
      for (const [original, material] of copies) {
        material.opacity = original.opacity * (1 - fade)
        if ((material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial)
          && (original instanceof THREE.MeshBasicMaterial || original instanceof THREE.MeshStandardMaterial)) {
          material.color.copy(original.color).multiplyScalar(1 - .54 * fade)
        }
      }
    },
    restore() {
      for (const { node, material } of originals) node.material = material
      for (const material of copies.values()) material.dispose()
    },
  }
}

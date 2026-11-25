import * as THREE from 'three'
import type { ArenaEvent } from '../../shared/advanced'
import { gridOffsets } from '../../shared/gridDevices'
import type { ArenaTurnMotion } from '../arenaTurnMotion'
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
    const recoil = age / turn.recoilMs
    const aim = smooth(age / turn.windupMs, -1, -.25) * (1 - smooth(recoil, .28, 1))
    const kick = beat(recoil, 0, .22, 1)
    const direction = gridOffsets[event.direction]
    // Wind the firing shoulder forward and turn the head back onto the line of fire.
    // The other arm opens to balance it, giving the stance a distinct silhouette from above.
    spine.position.y -= .065 * aim
    spine.rotation.x += .20 * aim - .38 * kick
    spine.rotation.y -= .28 * aim
    head.rotation.x -= .16 * aim
    head.rotation.y += .26 * aim
    arms[1].position.z += .12 * aim - .16 * kick
    arms[1].rotation.x -= 1.63 * aim + .19 * kick
    arms[1].rotation.z += .20 * aim
    hands[1].rotation.x -= .18 * aim
    arms[0].position.z -= .065 * aim
    arms[0].rotation.x -= .63 * aim
    arms[0].rotation.z -= .72 * aim
    legs[0].rotation.x += .30 * aim
    legs[1].rotation.x -= .29 * aim
    body.position.x -= direction.x * .135 * kick
    body.position.z -= direction.y * .135 * kick
  }
  for (const hit of hits ?? []) {
    const impact = (time - hit.at) / turn.impactMs
    const weight = hit.damage > 0 ? 1 : .35
    const kick = weight * (beat(impact, 0, .22, .80) - .20 * beat(impact, .56, .78, 1))
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
  const shutdown = THREE.MathUtils.clamp((time - downAt) / turn.shutdownMs, 0, 1)
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

import * as THREE from 'three'
import { gridOffsets } from '../../shared/gridDevices'
import { arenaMotionMs, arenaPulseFlightMs, arenaPulseTravel, arenaShotImpactMs, type ArenaTurnMotion } from '../arenaTurnMotion'
import type { ArenaStrike } from './arenaRobotMotion'

const smooth = THREE.MathUtils.smoothstep
const forward = new THREE.Vector3(0, 0, 1)
type LightMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

export function createArenaPulses() {
  const group = new THREE.Group()
  const bead = new THREE.SphereGeometry(1, 12, 8)
  const ring = new THREE.RingGeometry(.79, 1, 36)
  ring.rotateX(-Math.PI / 2)
  const shard = new THREE.OctahedronGeometry(1, 0)
  const paints = { solid: [] as THREE.MeshBasicMaterial[], glow: [] as THREE.MeshBasicMaterial[] }
  const nextPaint = { solid: 0, glow: 0 }
  const scratch = new THREE.Vector3()
  const particle = new THREE.Object3D()
  function ink(color: number, luminous = false) {
    const kind = luminous ? 'glow' : 'solid'
    const index = nextPaint[kind]++
    const material = paints[kind][index] ??= new THREE.MeshBasicMaterial({ toneMapped: false, transparent: luminous,
      blending: luminous ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !luminous, side: THREE.DoubleSide })
    material.color.setHex(color)
    material.opacity = 1
    return material
  }

  type Shot = {
    actorId: string; start: THREE.Vector3; end: THREE.Vector3; locked: boolean; flight: number
    head: LightMesh; glow: LightMesh; tail: LightMesh; contact: LightMesh; ripple: LightMesh
    sparks?: THREE.InstancedMesh; lethal: boolean; hit: boolean; dx: number; dz: number
  }
  const shots: Shot[] = []
  const guards: LightMesh[] = []
  const impacts = new Map<string, ArenaStrike[]>()
  const shutdowns = new Map<string, number>()
  function prepare(turn?: ArenaTurnMotion) {
    group.clear()
    impacts.clear()
    shutdowns.clear()
    for (const shot of shots) shot.sparks?.dispose()
    nextPaint.solid = nextPaint.glow = 0
    shots.length = guards.length = 0
    if (!turn) return
    for (const event of turn.events) {
      const source = turn.to.find(actor => actor.id === event.actorId)
      if (!source) continue
      if (event.action === 'guard') {
        const field = new THREE.Mesh(ring, ink(0x9deeff, true))
        field.position.set(source.x, .15, source.y)
        group.add(field)
        guards.push(field)
      }
      if (event.action !== 'shoot' || !event.direction) continue
      const d = gridOffsets[event.direction]
      const at = arenaShotImpactMs(turn, event)
      const lethal = !!event.targetId && turn.to.some(actor => actor.id === event.targetId && actor.hp === 0)
      if (event.targetId) {
        const hits = impacts.get(event.targetId) ?? []
        hits.push({ at, dx: d.x, dz: d.y, damage: event.damage ?? 0 })
        impacts.set(event.targetId, hits)
        if (lethal && event.damage) shutdowns.set(event.targetId, Math.max(at, shutdowns.get(event.targetId) ?? 0))
      }
      const tint = event.actorId === 'player' ? 0x5cffe0 : 0xff79a5
      const hitColor = event.absorbed && !event.damage ? 0x92deff : 0xffd392
      const endpoint = event.path?.at(-1)
      const front = event.targetId ? .17 : 0
      const start = new THREE.Vector3(source.x + .27 * d.x, .45, source.y + .27 * d.y)
      const end = endpoint ? new THREE.Vector3(endpoint.x - d.x * front, .45, endpoint.y - d.y * front)
        : new THREE.Vector3(source.x + .48 * d.x, .45, source.y + .48 * d.y)
      const head = new THREE.Mesh(bead, ink(0xfff9d3))
      head.name = 'arena-pulse-head'
      const glow = new THREE.Mesh(bead, ink(tint, true))
      const tail = new THREE.Mesh(bead, ink(tint, true))
      tail.name = 'arena-pulse-tail'
      const contact = new THREE.Mesh(bead, ink(event.targetId ? hitColor : tint, true))
      contact.name = 'arena-impact-glow'
      const ripple = new THREE.Mesh(ring, ink(event.targetId ? hitColor : tint, true))
      ripple.position.set(end.x, .041, end.z)
      contact.position.copy(end)
      group.add(head, glow, tail, contact, ripple)
      let sparks: THREE.InstancedMesh | undefined
      if (event.targetId) {
        sparks = new THREE.InstancedMesh(shard, ink(hitColor, true), lethal ? 7 : 4)
        sparks.frustumCulled = false
        group.add(sparks)
      }
      shots.push({ actorId: event.actorId, start, end, locked: false, flight: arenaPulseFlightMs(event),
        head, glow, tail, contact, ripple, sparks, lethal, hit: !!event.targetId, dx: d.x, dz: d.y })
    }
  }

  function draw(turn: ArenaTurnMotion, elapsed: number, getMuzzle: (id: string, out: THREE.Vector3) => void) {
    let flying = false, landing = false
    for (const guard of guards) {
      const up = smooth(elapsed, 0, 150) * (1 - smooth(elapsed, turn.durationMs - 155, turn.durationMs))
      guard.scale.setScalar(.58 * up)
      guard.material.opacity = up * .75
    }
    for (const shot of shots) {
      const age = elapsed - turn.fireAtMs
      const impactAge = age - shot.flight
      // The very same bead charges on the wrist and becomes the moving head. Freeze its origin on release.
      if (!shot.locked) {
        getMuzzle(shot.actorId, shot.start)
        shot.locked = age >= 0
      }
      const charge = smooth(age, -arenaMotionMs.windup, 0)
      const headPower = charge * (1 - smooth(impactAge, 0, 120))
      const u = arenaPulseTravel(age / shot.flight)
      const rear = arenaPulseTravel((age - Math.min(83, shot.flight * .26)) / shot.flight)
      shot.head.position.lerpVectors(shot.start, shot.end, u)
      scratch.subVectors(shot.end, shot.start).normalize()
      shot.head.quaternion.setFromUnitVectors(forward, scratch)
      const stretch = smooth(age, 0, 85) * (1 - smooth(impactAge, 0, 90))
      shot.head.scale.set(.095 * headPower, .095 * headPower, (.095 + .052 * stretch) * headPower)
      shot.head.visible = shot.glow.visible = headPower > .002
      shot.glow.position.copy(shot.head.position)
      shot.glow.scale.copy(shot.head.scale).multiplyScalar(1.75)
      shot.glow.quaternion.copy(shot.head.quaternion)
      shot.glow.material.opacity = .30 * headPower
      // The rear of the streak continues into the contact point after its tip arrives.
      const length = (u - rear) * shot.end.distanceTo(shot.start)
      shot.tail.visible = length > .002
      if (shot.tail.visible) {
        shot.tail.position.lerpVectors(shot.start, shot.end, (u + rear) / 2)
        shot.tail.quaternion.copy(shot.head.quaternion)
        const width = .064 * smooth(length, 0, .25)
        shot.tail.scale.set(width, width, length / 2)
      }
      flying ||= age >= 0 && impactAge < 0
      const contactPower = smooth(impactAge, 0, 56) * (1 - smooth(impactAge, 56, 205))
      shot.contact.visible = contactPower > .002
      shot.contact.scale.setScalar((shot.hit ? .27 : .14) * smooth(impactAge, 0, 135))
      shot.contact.material.opacity = .72 * contactPower
      const ringProgress = THREE.MathUtils.clamp(impactAge / arenaMotionMs.impact, 0, 1)
      shot.ripple.visible = ringProgress > 0 && ringProgress < 1
      shot.ripple.scale.setScalar((shot.hit ? .62 : .31) * (1 - (1 - ringProgress) ** 2))
      shot.ripple.material.opacity = .72 * smooth(ringProgress, 0, .12) * (1 - smooth(ringProgress, .18, 1))
      if (shot.sparks) {
        const life = shot.lethal ? arenaMotionMs.shutdown - 30 : arenaMotionMs.impact
        shot.sparks.visible = impactAge > 0 && impactAge < life
        if (shot.sparks.visible) {
          for (let i = 0; i < shot.sparks.count; i++) {
            const delay = (i % 3) * 29
            const t = THREE.MathUtils.clamp((impactAge - delay) / (life - delay), 0, 1)
            const angle = i * 2.39996
            const reach = (.22 + .065 * (i % 4)) * t
            particle.position.copy(shot.end)
            particle.position.x += Math.cos(angle) * reach + .13 * shot.dx * t
            particle.position.z += Math.sin(angle) * reach + .13 * shot.dz * t
            particle.position.y += (.3 + .15 * (i % 3)) * Math.sin(t * Math.PI) - .36 * t * t
            const size = (.028 + .007 * (i % 3)) * smooth(t, 0, .12) * (1 - smooth(t, .30, 1))
            particle.scale.set(size, size * 1.55, size)
            particle.rotation.set(angle + t * 3, t * 4, angle)
            particle.updateMatrix()
            shot.sparks.setMatrixAt(i, particle.matrix)
          }
          shot.sparks.instanceMatrix.needsUpdate = true
        }
      }
      landing ||= impactAge >= 0 && ringProgress < 1
    }
    if (flying) return 'flight'
    if (landing) return 'impact'
    for (const at of shutdowns.values()) if (elapsed >= at) return 'shutdown'
    return elapsed < turn.moveMs ? 'movement' : 'windup'
  }
  function dispose() {
    group.removeFromParent()
    prepare()
    for (const material of [...paints.solid, ...paints.glow]) material.dispose()
    bead.dispose()
    ring.dispose()
    shard.dispose()
  }
  return { group, impacts, shutdowns, prepare, draw, dispose }
}

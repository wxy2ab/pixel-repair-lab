import * as THREE from 'three'
import { gridOffsets } from '../../shared/gridDevices'
import { arenaPulseFlightMs, arenaPulseTravel, arenaShotImpactMs, type ArenaTurnMotion } from '../arenaTurnMotion'
import type { ArenaStrike } from './arenaRobotMotion'

const smooth = THREE.MathUtils.smoothstep
const forward = new THREE.Vector3(0, 0, 1)
type LightMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

// A flared corona with six open petals. Its outline still points out of the wrist
// when a horizontal shot is viewed straight down or along the barrel.
function muzzleCorona() {
  const points: number[] = []
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3
    const radial = (radius: number, spread: number, z: number) =>
      [radius * Math.cos(angle + spread), radius * Math.sin(angle + spread), z]
    const base = radial(.10, 0, 0)
    const left = radial(.48, -.25, .30), right = radial(.48, .25, .30)
    const tip = radial(1, 0, .85)
    points.push(...base, ...left, ...right, ...right, ...left, ...tip)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geometry
}

export function createArenaPulses() {
  const group = new THREE.Group()
  const bead = new THREE.SphereGeometry(1, 12, 8)
  const ring = new THREE.RingGeometry(.79, 1, 36)
  ring.rotateX(-Math.PI / 2)
  const coil = new THREE.TorusGeometry(1, .125, 6, 24)
  const corona = muzzleCorona()
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
    actorId: string; start: THREE.Vector3; wrist: THREE.Vector3; end: THREE.Vector3; locked: boolean; flight: number
    collar: LightMesh; flash: LightMesh; head: LightMesh; glow: LightMesh; tail: LightMesh
    wake: LightMesh; contact: LightMesh; ripple: LightMesh
    sparks?: THREE.InstancedMesh; lethal: boolean; hit: boolean; blocked: boolean; dx: number; dz: number
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
      const player = event.actorId === 'player'
      const tint = player ? 0x54ffdf : 0xff739b
      const hitColor = event.absorbed && !event.damage ? 0x92deff : 0xffd392
      const endpoint = event.path?.at(-1)
      const blocked = !endpoint
      const front = event.targetId ? .17 : 0
      const start = new THREE.Vector3(source.x + .27 * d.x, .45, source.y + .27 * d.y)
      const end = endpoint ? new THREE.Vector3(endpoint.x - d.x * front, .45, endpoint.y - d.y * front)
        : new THREE.Vector3(source.x + .48 * d.x, .45, source.y + .48 * d.y)
      const collar = new THREE.Mesh(coil, ink(tint, true))
      collar.name = 'arena-charging-coil'
      const flash = new THREE.Mesh(corona, ink(tint, true))
      flash.name = 'arena-muzzle-flash'
      const axis = new THREE.Vector3(d.x, 0, d.y)
      collar.quaternion.setFromUnitVectors(forward, axis)
      flash.quaternion.copy(collar.quaternion)
      const head = new THREE.Mesh(shard, ink(player ? 0x109f8a : 0xd2396b))
      head.name = 'arena-pulse-head'
      const core = new THREE.Mesh(bead, ink(0xfffedc))
      core.scale.set(.77, .77, .68)
      core.position.z = .34
      head.add(core)
      const glow = new THREE.Mesh(bead, ink(tint, true))
      const tail = new THREE.Mesh(bead, ink(tint, true))
      tail.name = 'arena-pulse-tail'
      const wake = new THREE.Mesh(bead, ink(tint, true))
      wake.name = 'arena-pulse-wake'
      const contact = new THREE.Mesh(bead, ink(event.targetId ? hitColor : tint, true))
      contact.name = 'arena-impact-glow'
      const ripple = new THREE.Mesh(ring, ink(event.targetId ? hitColor : tint, true))
      ripple.position.set(end.x, .041, end.z)
      contact.position.copy(end)
      group.add(collar, flash, head, glow, tail, wake, contact, ripple)
      let sparks: THREE.InstancedMesh | undefined
      if (event.targetId || blocked) {
        sparks = new THREE.InstancedMesh(shard, ink(event.targetId ? hitColor : tint, true), lethal ? 7 : 4)
        sparks.frustumCulled = false
        group.add(sparks)
      }
      shots.push({ actorId: event.actorId, start, wrist: start.clone(), end, locked: false,
        flight: arenaPulseFlightMs(event, turn.attackSpeed), collar, flash, head, glow, tail, wake, contact, ripple, sparks,
        lethal, hit: !!event.targetId, blocked, dx: d.x, dz: d.y })
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
      const travel = age / shot.flight
      const recoil = age / turn.recoilMs
      const impact = (age - shot.flight) / turn.impactMs
      // The very same bead charges on the wrist and becomes the moving head. Freeze its origin on release.
      getMuzzle(shot.actorId, shot.wrist)
      if (!shot.locked) shot.start.copy(shot.wrist)
      if (age >= 0) shot.locked = true
      const charge = smooth(age / turn.windupMs, -1, -.12)
      const coilPower = smooth(charge, 0, .32) * (1 - smooth(recoil, 0, .28))
      shot.collar.visible = coilPower > .002
      shot.collar.position.copy(shot.wrist)
      shot.collar.scale.setScalar(.33 - .18 * charge)
      shot.collar.material.opacity = .95 * coilPower
      const release = smooth(recoil, -.05, .14) * (1 - smooth(recoil, .50, .89))
      const opening = smooth(recoil, -.05, .30)
      shot.flash.visible = release > .002
      shot.flash.position.copy(shot.wrist)
      shot.flash.scale.set(.40 * opening, .40 * opening, (shot.blocked ? .23 : .48) * opening)
      shot.flash.material.opacity = .94 * release
      const headPower = charge * (1 - smooth(impact, 0, .24))
      const u = arenaPulseTravel(travel)
      const distance = shot.end.distanceTo(shot.start)
      const tailFraction = Math.min(.22, .95 / Math.max(1, distance))
      const rear = arenaPulseTravel(travel - tailFraction)
      shot.head.position.lerpVectors(shot.start, shot.end, u)
      scratch.subVectors(shot.end, shot.start).normalize()
      shot.head.quaternion.setFromUnitVectors(forward, scratch)
      const stretch = smooth(travel, 0, .15) * (1 - smooth(impact, 0, .24))
      shot.head.scale.set(.17 * headPower, .17 * headPower, (.17 + .10 * stretch) * headPower)
      shot.head.visible = shot.glow.visible = headPower > .002
      shot.glow.position.copy(shot.head.position)
      shot.glow.scale.copy(shot.head.scale).multiplyScalar(1.42)
      shot.glow.quaternion.copy(shot.head.quaternion)
      shot.glow.material.opacity = .26 * headPower
      // The rear of the streak continues into the contact point after its tip arrives.
      const length = (u - rear) * distance
      shot.tail.visible = length > .002
      if (shot.tail.visible) {
        shot.tail.position.lerpVectors(shot.start, shot.end, (u + rear) / 2)
        shot.tail.quaternion.copy(shot.head.quaternion)
        const width = .108 * smooth(length, 0, .30)
        shot.tail.scale.set(width, width, length / 2)
      }
      // The thinner ion track grows behind the passing pulse and briefly connects
      // the two robots. Its end always follows the actual shot, even on a miss.
      const trace = u * distance
      const afterglow = smooth(trace, 0, .25) * (1 - smooth(impact, 0, .68))
      shot.wake.visible = afterglow > .002
      if (shot.wake.visible) {
        shot.wake.position.lerpVectors(shot.start, shot.head.position, .5)
        shot.wake.quaternion.copy(shot.head.quaternion)
        shot.wake.scale.set(.042, .042, trace / 2)
        shot.wake.material.opacity = .74 * afterglow
      }
      flying ||= travel >= 0 && travel < 1
      const contactPower = smooth(impact, 0, .14) * (1 - smooth(impact, .40, .82))
      shot.contact.visible = contactPower > .002
      shot.contact.scale.setScalar((shot.hit ? .36 : shot.blocked ? .26 : .17) * smooth(impact, 0, .28))
      shot.contact.material.opacity = .86 * contactPower
      const ringProgress = THREE.MathUtils.clamp(impact, 0, 1)
      shot.ripple.visible = ringProgress > 0 && ringProgress < 1
      shot.ripple.scale.setScalar((shot.hit ? .62 : .31) * (1 - (1 - ringProgress) ** 2))
      shot.ripple.material.opacity = .80 * smooth(ringProgress, 0, .12) * (1 - smooth(ringProgress, .52, 1))
      if (shot.sparks) {
        const life = shot.lethal ? turn.shutdownMs * .95 : turn.impactMs
        const sparkPhase = (age - shot.flight) / life
        shot.sparks.visible = sparkPhase > 0 && sparkPhase < 1
        if (shot.sparks.visible) {
          for (let i = 0; i < shot.sparks.count; i++) {
            const delay = (i % 3) * .06
            const t = THREE.MathUtils.clamp((sparkPhase - delay) / (1 - delay), 0, 1)
            const angle = i * 2.39996
            const reach = (.22 + .065 * (i % 4)) * t
            particle.position.copy(shot.end)
            particle.position.x += Math.cos(angle) * reach + .13 * shot.dx * t
            particle.position.z += Math.sin(angle) * reach + .13 * shot.dz * t
            particle.position.y += (.3 + .15 * (i % 3)) * Math.sin(t * Math.PI) - .36 * t * t
            const size = (.043 + .01 * (i % 3)) * smooth(t, 0, .12) * (1 - smooth(t, .30, 1))
            particle.scale.set(size, size * 1.55, size)
            particle.rotation.set(angle + t * 3, t * 4, angle)
            particle.updateMatrix()
            shot.sparks.setMatrixAt(i, particle.matrix)
          }
          shot.sparks.instanceMatrix.needsUpdate = true
        }
      }
      landing ||= impact >= 0 && impact < 1
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
    coil.dispose()
    corona.dispose()
    shard.dispose()
  }
  return { group, impacts, shutdowns, prepare, draw, dispose }
}

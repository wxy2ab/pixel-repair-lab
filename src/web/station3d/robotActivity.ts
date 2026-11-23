import * as THREE from 'three'
import type { StationAction } from './types'

export type RobotGesture = Exclude<StationAction, 'move'> | 'failed' | 'collect-key' | 'open-chest'
export type RobotRig = {
  spine: THREE.Object3D
  head: THREE.Object3D
  eyes: THREE.Object3D
  arms: THREE.Object3D[]
  hands: THREE.Object3D[]
  legs: THREE.Object3D[]
}

// Reach the readable silhouette early so short consecutive commands remain visible.
function strength(progress: number) {
  const reach = Math.min(1, progress / .19)
  const release = Math.min(1, (1 - progress) / .24)
  return Math.sin(reach * Math.PI / 2) * Math.sin(release * Math.PI / 2)
}

export function poseGesture(rig: RobotRig, action: RobotGesture, progress: number, condition = true) {
  const e = strength(progress)
  const turn = Math.sin((progress - .5) * Math.PI)
  const { spine, head, arms, hands, legs } = rig
  switch (action) {
    case 'scan':
    case 'read_map': {
      const sweep = action === 'read_map' ? 1.06 : .72
      head.rotation.y = turn * sweep * e
      head.rotation.x = .22 * e
      spine.rotation.y = turn * .21 * e
      arms[1].rotation.set(-1.26 * e, -.16 * e, .42 * e)
      hands[1].rotation.x -= .96 * e
      arms[0].rotation.set(-.72 * e, -.17 * e, -.24 * e)
      break
    }
    case 'submit':
    case 'store':
    case 'load': {
      const give = action !== 'load'
      const extend = e * (give ? .5 + .68 * progress : 1.08 - .69 * progress)
      spine.rotation.x = (give ? .20 : -.14) * e
      head.rotation.x = .18 * e
      for (let index = 0; index < 2; index++) {
        const side = index === 0 ? -1 : 1
        arms[index].rotation.set(-1.40 * extend, -side * .43 * e, -side * .26 * e)
        hands[index].rotation.x -= (.85 * e - .48 * extend)
      }
      break
    }
    case 'open-chest': {
      const lift = Math.sin(progress * Math.PI / 2)
      spine.rotation.x = (.46 - .25 * lift) * e
      head.rotation.x = .31 * e
      for (const arm of arms) arm.rotation.x -= (.64 + .88 * lift) * e
      break
    }
    case 'collect-key':
    case 'pick': {
      const crouch = Math.sin(Math.min(1, progress / .70) * Math.PI) * e
      spine.position.y -= .11 * crouch
      spine.rotation.x = .58 * crouch
      head.rotation.x = .33 * crouch
      arms[1].rotation.x -= (.55 * e + .76 * progress * e)
      arms[0].rotation.x -= (.26 * e + .58 * progress * e)
      for (const hand of hands) hand.rotation.x -= .74 * progress * e
      for (const boot of legs) boot.rotation.x = -.23 * crouch
      break
    }
    case 'say':
      head.rotation.y = -.25 * e
      head.rotation.z = .15 * e
      arms[1].rotation.set(-.58 * e, -.24 * e, 1.20 * e)
      hands[1].rotation.z = (.41 + .28 * Math.sin(progress * 3 * Math.PI)) * e
      break
    case 'step':
      head.rotation.x = .41 * e
      arms[0].rotation.set(-1.02 * e, .36 * e, .21 * e)
      arms[1].rotation.set(-.81 * e, -.33 * e, -.27 * e)
      hands[1].rotation.x -= (.70 + .47 * Math.sin(progress * 2 * Math.PI)) * e
      break
    case 'wait':
      head.rotation.y = -.46 * e
      head.rotation.x = .25 * e
      arms[0].rotation.set(-.90 * e, .40 * e, .20 * e)
      hands[0].rotation.x -= .88 * e
      break
    case 'call':
    case 'return': {
      const reach = action === 'call' ? 1 - progress : progress
      head.rotation.set(.25 * e, .35 * e, -.12 * e)
      arms[0].rotation.set(-.89 * e, .32 * e, -.39 * e)
      arms[1].rotation.set(-(.86 + .74 * reach) * e, -.35 * e, (.5 + .32 * reach) * e)
      hands[1].rotation.x -= .58 * e
      break
    }
    case 'if': {
      const side = condition ? 1 : -1
      const index = condition ? 1 : 0
      head.rotation.y = side * .73 * e
      spine.rotation.y = side * .24 * e
      arms[index].rotation.set(-.8 * e, -side * .35 * e, side * 1.29 * e)
      break
    }
    case 'for':
      head.rotation.set(.28 * e, (condition ? turn * .47 : -.48) * e, 0)
      arms[0].rotation.set(-.94 * e, .25 * e, -.46 * e)
      arms[1].rotation.set(-(condition ? .82 + .40 * progress : .48) * e, -.24 * e, .55 * e)
      hands[1].rotation.z = (condition ? turn : -.46) * e
      break
    case 'while':
      head.rotation.set((condition ? .23 : -.13) * e, (condition ? -.35 : .46) * e, 0)
      arms[0].rotation.set(-1.20 * e, .25 * e, -.46 * e)
      arms[1].rotation.set((condition ? -.90 : -.44) * e, -.22 * e, .55 * e)
      hands[1].rotation.z = (condition ? Math.sin(progress * 2 * Math.PI) : -.60) * e
      break
    case 'break':
      head.rotation.y = .58 * e
      arms[0].rotation.set(-1.16 * e, .26 * e, -.32 * e)
      arms[1].rotation.set(-.30 * e, -.42 * e, (1.02 + progress * .47) * e)
      break
    case 'continue':
      head.rotation.y = -.55 * e
      arms[0].rotation.set(-1.39 * e, .32 * e, -.62 * e)
      hands[0].rotation.z = (-.42 + .57 * Math.sin(progress * Math.PI * 2)) * e
      break
    case 'failed':
      spine.rotation.x = -.31 * e
      spine.position.y -= .035 * e
      head.rotation.y = .43 * Math.sin(progress * 3 * Math.PI) * e
      arms[0].rotation.z -= .70 * e
      arms[1].rotation.z += .70 * e
      hands[0].rotation.x -= 1.18 * e
      hands[1].rotation.x -= 1.18 * e
      break
  }
}

/** Local-space props travel and turn with the robot. Geometry is reused for successive commands. */
export function createRobotSignals() {
  const group = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.MeshBasicMaterial[] = []
  function ink(color: number, opacity = 1) {
    const material = new THREE.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity === 1,
      side: THREE.DoubleSide, toneMapped: false })
    materials.push(material)
    return material
  }
  function piece(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial, x = 0, y = 0, z = 0) {
    const part = new THREE.Mesh(geometry, material)
    // A scan can reach into adjacent cells. Those cells must remain selectable through its light.
    part.raycast = () => {}
    geometries.push(geometry)
    part.position.set(x, y, z)
    parent.add(part)
    return part
  }
  const mint = ink(0x76fff1), warm = ink(0xffc96a), violet = ink(0xa7c2ff), dark = ink(0x233e56)
  const fan = new THREE.Group()
  const angle = 1.31, start = -Math.PI / 2 - angle / 2
  const sweep = (inner: number, outer: number, material: THREE.MeshBasicMaterial) =>
    piece(fan, new THREE.RingGeometry(inner, outer, 32, 1, start, angle).rotateX(-Math.PI / 2), material)
  sweep(.10, 1.12, ink(0x40f4e2, .38))
  sweep(1.04, 1.12, mint)
  sweep(.48, .51, ink(0x82fff0, .74))
  for (const edge of [-1, 1]) {
    const beam = new THREE.BoxGeometry(.034, .027, 1.02).translate(0, 0, .60).rotateY(edge * angle / 2)
    piece(fan, beam, mint)
  }
  const packet = new THREE.Group()
  piece(packet, new THREE.BoxGeometry(.30, .21, .12), warm)
  piece(packet, new THREE.BoxGeometry(.22, .13, .125), dark)
  for (const y of [-.023, .023]) piece(packet, new THREE.BoxGeometry(.142, .014, .132), mint, 0, y)
  const battery = new THREE.Group()
  piece(battery, new THREE.BoxGeometry(.17, .23, .13), warm)
  piece(battery, new THREE.BoxGeometry(.075, .035, .08), mint, 0, .13)
  piece(battery, new THREE.BoxGeometry(.174, .046, .134), dark, 0, -.072)
  const key = new THREE.Group()
  piece(key, new THREE.TorusGeometry(.105, .035, 7, 18), warm, -.12, .02)
  piece(key, new THREE.BoxGeometry(.28, .06, .055), warm, .085, .02)
  for (const x of [.12, .21]) piece(key, new THREE.BoxGeometry(.047, .10, .055), warm, x, -.02)
  const glints = new THREE.Group()
  for (const side of [-1, 0, 1]) {
    const glint = piece(glints, new THREE.BoxGeometry(.045, .16, .045), warm, side * .13, side === 0 ? .09 : 0)
    glint.rotation.z = -side * .42
  }
  const bubble = new THREE.Group()
  piece(bubble, new THREE.BoxGeometry(.43, .21, .068), mint)
  piece(bubble, new THREE.BoxGeometry(.09, .09, .064), mint, -.125, -.095).rotation.z = Math.PI / 4
  for (const x of [-.115, 0, .115]) piece(bubble, new THREE.SphereGeometry(.025, 8, 6), dark, x, .007, .030)
  const dial = new THREE.Group()
  piece(dial, new THREE.CircleGeometry(.117, 20), dark)
  piece(dial, new THREE.RingGeometry(.116, .145, 20), violet, 0, 0, .004)
  piece(dial, new THREE.BoxGeometry(.012, .083, .011), mint, 0, .039, .009)
  const hand = piece(dial, new THREE.BoxGeometry(.075, .014, .012).translate(.032, 0, 0), mint, 0, 0, .013)
  const crossed = new THREE.Group()
  const warning = ink(0xff997c)
  for (const tilt of [-.77, .77]) piece(crossed, new THREE.BoxGeometry(.079, .32, .083), warning).rotation.z = tilt
  const stack = new THREE.Group()
  const lilac = ink(0xdab9ff)
  const cyan = ink(0x8becff)
  const frameCard = piece(stack, new THREE.BoxGeometry(.46, .055, .30), dark, 0, -.005)
  piece(frameCard, new THREE.BoxGeometry(.46, .016, .035), violet, 0, .03, .128)
  const topCard = piece(stack, new THREE.BoxGeometry(.39, .048, .27), lilac)
  piece(topCard, new THREE.BoxGeometry(.24, .012, .036), dark, 0, .028)
  const choice = new THREE.Group()
  piece(choice, new THREE.BoxGeometry(.044, .23, .06), dark, 0, -.1)
  const forks = [-1, 1].map(side => {
    const fork = piece(choice, new THREE.BoxGeometry(.055, .33, .064), dark, side * .106, .104)
    fork.rotation.z = -side * Math.PI / 4
    return fork
  })
  const reader = new THREE.Group()
  piece(reader, new THREE.BoxGeometry(.57, .056, .20), dark)
  for (const x of [-.20, 0, .20]) piece(reader, new THREE.BoxGeometry(.04, .02, .19), violet, x, .037)
  const token = piece(reader, new THREE.BoxGeometry(.125, .094, .15), mint)
  const loop = new THREE.Group()
  piece(loop, new THREE.TorusGeometry(.19, .034, 7, 32, 1.75 * Math.PI), violet)
  const cursor = piece(loop, new THREE.SphereGeometry(.065, 8, 6), mint)
  const arrow = piece(loop, new THREE.ConeGeometry(.083, .16, 4), warm)
  group.add(fan, packet, battery, key, glints, bubble, dial, crossed, stack, choice, reader, loop)
  group.visible = false

  function show(action: RobotGesture, p: number, condition = true) {
    group.visible = true
    const e = strength(p)
    fan.visible = action === 'scan' || action === 'read_map'
    if (fan.visible) {
      fan.rotation.y = (p - .5) * (action === 'read_map' ? 2.25 : 1.38)
      // Cast from the sensor above the railings so the scan is visible even when facing a wall.
      fan.position.set(.03, .69, .16)
      fan.scale.setScalar((action === 'read_map' ? 1.22 : .94) * (.48 + .52 * e))
    }
    packet.visible = action === 'submit' || action === 'store' || action === 'load'
    if (packet.visible) {
      const travel = action === 'load' ? 1 - p : p
      packet.position.set(0, .42 + Math.sin(p * Math.PI) * .12, .24 + travel * .57)
      packet.rotation.set(-.20 - travel * .35, 0, 0)
      packet.scale.setScalar(.36 + e * .86)
    }
    battery.visible = action === 'pick'
    if (battery.visible) {
      battery.position.set(.11, .16 + p * .46, .44 - p * .14)
      battery.scale.setScalar(.36 + e * .77)
    }
    key.visible = action === 'collect-key'
    if (key.visible) {
      key.position.set(.18, .53 + p * .38, .27)
      key.rotation.set(-.70, 0, .30)
      key.scale.setScalar(.65 + .54 * e)
    }
    glints.visible = action === 'open-chest'
    if (glints.visible) {
      glints.position.set(0, .52 + .39 * p, .43)
      glints.rotation.x = -.48
      glints.scale.setScalar(.4 + .73 * e)
    }
    bubble.visible = action === 'say'
    bubble.position.set(.30, 1.13 + .09 * e, .05)
    bubble.rotation.x = -.44
    bubble.scale.setScalar(.30 + .70 * e)
    dial.visible = action === 'step' || action === 'wait'
    dial.position.set(action === 'step' ? -.07 : -.24, .61, .36)
    dial.rotation.x = -.67
    hand.rotation.z = -Math.PI * 1.47 * p
    crossed.visible = action === 'failed'
    crossed.position.set(.26, 1.14, .16)
    crossed.rotation.x = -.52
    crossed.scale.setScalar(.60 + .60 * e)
    stack.visible = action === 'call' || action === 'return'
    if (stack.visible) {
      const separation = action === 'call' ? 1 - p : p
      stack.position.set(.31, .91, .23)
      stack.rotation.x = .25
      stack.scale.setScalar(.75 + .38 * e)
      topCard.position.set(.055 * separation, .08 + .37 * separation, -.04 * separation)
      topCard.material = action === 'call' ? lilac : cyan
    }
    choice.visible = action === 'if'
    if (choice.visible) {
      choice.position.set(.23, 1.14, .16)
      choice.rotation.x = -.55
      choice.scale.setScalar(.67 + .78 * e)
      forks[0].material = condition ? dark : warm
      forks[1].material = condition ? mint : dark
    }
    reader.visible = action === 'for'
    if (reader.visible) {
      reader.position.set(.27, .99, .26)
      reader.rotation.x = .30
      reader.scale.setScalar(.80 + .30 * e)
      token.position.set(condition ? -.21 + .42 * p : .31 + .13 * p, .10, 0)
      token.material = condition ? mint : warm
    }
    loop.visible = action === 'while' || action === 'break' || action === 'continue'
    if (loop.visible) {
      loop.position.set(.27, 1.14, .17)
      loop.rotation.x = -.55
      loop.scale.setScalar(.76 + .46 * e)
      const repeat = action === 'continue' || (action === 'while' && condition)
      const angle = (1 - p) * 1.75 * Math.PI
      cursor.position.set(repeat ? .19 * Math.cos(angle) : .19 + .20 * p, repeat ? .19 * Math.sin(angle) : 0, 0)
      cursor.visible = action === 'while'
      cursor.material = repeat ? mint : warm
      arrow.visible = action !== 'while'
      if (arrow.visible) {
        arrow.position.copy(cursor.position)
        arrow.rotation.z = repeat ? angle + Math.PI : -Math.PI / 2
        arrow.material = repeat ? cyan : warm
      }
    }
  }
  return { group, show, dispose() {
    group.removeFromParent()
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
  } }
}

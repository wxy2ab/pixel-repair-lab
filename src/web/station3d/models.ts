import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { deviceModel } from './deviceModels'
import type { BoardDevice } from '../gridDeviceDisplay'
import { poseGesture, type RobotGesture, type RobotRig } from './robotActivity'

type XYZ = [number, number, number]
type Finish = 'shell' | 'light'
export type RobotAction = 'idle' | 'walk' | 'work' | 'wave'

// Bake small details into the same mesh so duplicate robots and batteries can share both
// their geometry and their materials, including the individual colors of each panel.
export class ModelParts {
  private readonly parts: Record<Finish, THREE.BufferGeometry[]> = { shell: [], light: [] }

  add(source: THREE.BufferGeometry, color: string, position: XYZ, rotation: XYZ = [0, 0, 0], finish: Finish = 'shell') {
    const geometry = source.index ? source.toNonIndexed() : source
    if (geometry !== source) source.dispose()
    geometry.deleteAttribute('uv')
    geometry.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)))
    geometry.translate(...position)
    const tint = new THREE.Color(color)
    const colors = new Float32Array(geometry.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.parts[finish].push(geometry)
  }

  box(size: XYZ, position: XYZ, color: string, radius = 0, rotation: XYZ = [0, 0, 0], finish: Finish = 'shell') {
    this.add(radius ? new RoundedBoxGeometry(...size, 1, radius) : new THREE.BoxGeometry(...size),
      color, position, rotation, finish)
  }

  cylinder(top: number, bottom: number, height: number, position: XYZ, color: string, finish: Finish = 'shell') {
    this.add(new THREE.CylinderGeometry(top, bottom, height, 16), color, position, [0, Math.PI / 16, 0], finish)
  }

  capsule(from: XYZ, to: XYZ, radius: number, color: string, finish: Finish = 'shell') {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const axis = end.clone().sub(start)
    const piece = new THREE.CapsuleGeometry(radius, axis.length(), 3, 12)
    piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()))
    this.add(piece, color, start.lerp(end, .5).toArray(), [0, 0, 0], finish)
  }

  bake(materials: Record<Finish, THREE.Material>, resources: THREE.BufferGeometry[]) {
    const group = new THREE.Group()
    for (const finish of ['shell', 'light'] as const) {
      const parts = this.parts[finish]
      if (!parts.length) continue
      const geometry = mergeGeometries(parts)
      for (const part of parts) part.dispose()
      if (!geometry) throw new Error('Incompatible station model geometry')
      resources.push(geometry)
      const mesh = new THREE.Mesh(geometry, materials[finish])
      mesh.castShadow = finish === 'shell'
      mesh.receiveShadow = finish === 'shell'
      group.add(mesh)
    }
    return group
  }
}

// Folded leaves have a raised midrib and a pointed tip, even when seen from above.
function sproutLeaf() {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, .10, .085, -.060, .23, .12, 0,
    0, 0, 0, .23, .12, 0, .115, .060, .063,
    0, 0, 0, .115, .060, .063, .10, .110, .002,
    .115, .060, .063, .23, .12, 0, .10, .110, .002,
    .23, .12, 0, .10, .085, -.060, .10, .110, .002,
    .10, .085, -.060, 0, 0, 0, .10, .110, .002,
  ], 3))
  geometry.computeVertexNormals()
  return geometry
}

const graphite = '#233847'
const darkGlass = '#102332'

// Distinct tool rigs let a child keep track of opponents even with the camera behind them.
const liveries = [
  { enamel: '#29c8a7', crown: '#e7f6da', accent: '#ffae48', lamp: '#8affdf' },
  { enamel: '#e7643a', crown: '#ffb977', accent: '#ffe785', lamp: '#fff3a6' },
  { enamel: '#d59332', crown: '#ffdc83', accent: '#52c9c7', lamp: '#dcffff' },
  { enamel: '#7563a6', crown: '#d8c4ec', accent: '#ff9e63', lamp: '#ffd3fa' },
  { enamel: '#32798f', crown: '#9cd7df', accent: '#ff9c4e', lamp: '#ffea9c' },
]

type Livery = typeof liveries[number]

function helmet(style: number, { enamel, crown, lamp, accent }: Livery) {
  const head = new ModelParts()
  const heavy = style === 2
  head.box([heavy ? .65 : .61, .326, .438], [0, .157, 0], enamel, .10)
  head.box([heavy ? .66 : .624, .161, .445], [0, .262, -.007], crown, .065)
  head.box([.527, .245, .108], [0, .153, .183], graphite, .05)
  head.box([.493, .212, .075], [0, .156, .218], darkGlass, .032)
  // The edge bead, cheek lamps and glass glint read both in close-ups and on a distant helmet.
  head.capsule([-.165, .234, .255], [-.084, .234, .255], .006, '#6d9caa')
  head.box([.054, .013, .008], [0, .105, .255], lamp, .003, [0, 0, 0], 'light')
  for (const side of [-1, 1]) {
    head.box([.026, .012, .008], [side * .030, .111, .255], lamp, .003, [0, 0, side * .37], 'light')
    head.box([.047, .012, .009], [side * .157, .116, .253], accent, .004)
    head.capsule([side * .296, .146, -.022], [side * .320, .146, -.022], .076, graphite)
    head.add(new THREE.CylinderGeometry(.059, .059, .029, 16), crown, [side * .337, .146, -.022], [0, 0, Math.PI / 2])
    head.add(new THREE.CylinderGeometry(.030, .030, .007, 12), accent, [side * .355, .146, -.022], [0, 0, Math.PI / 2])
    head.box([.047, .021, .093], [side * .198, .338, -.085], enamel, .009)
  }
  // Back access panel, raised vents and the technician's goggles strap.
  head.box([.347, .161, .025], [0, .152, -.213], graphite, .012)
  for (const x of [-.098, -.033, .033, .098]) {
    head.box([.027, .087, .012], [x, .157, -.230], crown, .005, [0, 0, -.23])
  }
  if (!style) {
    head.cylinder(.059, .069, .039, [0, .35, -.046], graphite)
    head.capsule([0, .363, -.046], [.003, .448, -.031], .018, '#35956e')
    const large = sproutLeaf().scale(1.17, 1.12, 1.15)
    head.add(large, '#a6ef73', [0, .428, -.030], [.18, -.25, .10])
    head.add(sproutLeaf().scale(.98, 1.06, 1.08), '#52c879', [0, .420, -.03], [-.16, Math.PI + .24, -.13])
    head.capsule([-.029, .345, .09], [.029, .345, .09], .024, '#f5ba58')
  } else if (style === 1) {
    for (const side of [-1, 1]) {
      head.box([.086, .175, .106], [side * .177, .373, -.058], graphite, .024, [.20, 0, -side * .25])
      head.box([.080, .043, .102], [side * .193, .446, -.044], accent, .012, [.20, 0, -side * .25])
    }
  } else if (style === 2) {
    head.box([.596, .062, .488], [0, .25, .033], accent, .024)
    for (const x of [-.084, .084]) head.box([.056, .10, .198], [x, .335, -.041], enamel, .019)
  } else if (style === 3) {
    head.capsule([-.162, .30, -.07], [-.215, .453, -.074], .014, graphite)
    head.add(new THREE.IcosahedronGeometry(.055), accent, [-.215, .462, -.075])
    head.box([.108, .067, .102], [.151, .342, -.066], graphite, .017)
  } else {
    head.cylinder(.055, .07, .070, [0, .366, -.095], graphite)
    head.box([.31, .037, .10], [0, .409, -.095], accent, .014, [0, -.26, .05])
  }
  return head
}

function eyes(style: number, lamp: string) {
  const face = new ModelParts()
  for (const side of [-1, 1]) {
    const x = side * .10
    if (style === 1 || style === 3) {
      face.capsule([x - .024, side * -.015, 0], [x + .024, side * .015, 0], .015, lamp, 'light')
    } else {
      face.capsule([x, -.016, 0], [x, .020, 0], .022, lamp, 'light')
    }
  }
  return face
}

function chassis({ enamel, crown, accent, lamp }: Livery) {
  const body = new ModelParts()
  body.box([.279, .123, .224], [0, .238, 0], graphite, .043)
  body.box([.392, .266, .298], [0, .38, 0], enamel, .065)
  body.box([.271, .162, .046], [0, .403, .136], crown, .021)
  body.box([.162, .034, .014], [0, .420, .163], graphite, .006)
  for (const x of [-.047, 0, .047]) body.box([.026, .011, .006], [x, .422, .173], lamp, 0, [0, 0, 0], 'light')
  body.box([.338, .056, .275], [0, .278, .003], graphite, .018)
  body.box([.094, .047, .020], [0, .281, .144], accent, .009)
  body.cylinder(.093, .109, .076, [0, .525, 0], graphite)
  body.cylinder(.097, .099, .025, [0, .536, 0], crown)
  // Twin service cells on the backpack make turning away an identifiable pose.
  body.box([.263, .202, .086], [0, .386, -.158], graphite, .032)
  for (const side of [-1, 1]) {
    body.cylinder(.047, .047, .186, [side * .072, .39, -.218], accent)
    for (const height of [.30, .48]) body.cylinder(.051, .051, .030, [side * .072, height, -.218], graphite)
  }
  return body
}

function arm(side: number, { enamel, crown, accent }: Livery) {
  const parts = new ModelParts()
  parts.capsule([0, 0, 0], [side * .018, -.117, 0], .035, graphite)
  parts.box([.112, .098, .156], [side * .011, -.031, 0], crown, .038)
  parts.box([.043, .025, .075], [side * .066, -.033, 0], accent, .012)
  parts.add(new THREE.CylinderGeometry(.040, .040, .055, 12), enamel, [side * .017, -.116, 0], [0, 0, Math.PI / 2])
  return parts
}

function hand(side: number, { enamel }: Livery) {
  const parts = new ModelParts()
  parts.box([.104, .085, .112], [side * .007, -.047, .008], enamel, .026)
  for (const z of [-.027, .043]) {
    parts.capsule([side * .009, -.080, z], [-side * .006, -.127, z + .008], .020, graphite)
  }
  return parts
}

function leg({ enamel, crown, accent }: Livery) {
  const part = new ModelParts()
  part.capsule([0, -.009, 0], [0, -.086, 0], .047, graphite)
  part.box([.155, .096, .151], [0, -.111, -.008], enamel, .031)
  part.box([.174, .071, .211], [0, -.151, .031], crown, .026)
  part.box([.181, .042, .235], [0, -.18, .027], graphite, .018)
  part.box([.064, .014, .012], [0, -.146, .137], accent, .003)
  return part
}

function poseRobot(rig: RobotRig, action: RobotAction, seconds: number) {
  const stride = action === 'walk' ? Math.sin(seconds * Math.PI * 4) : 0
  const breathing = Math.sin(seconds * 2.6)
  const wave = action === 'wave'
  const tapping = action === 'work' ? (1 - Math.cos(seconds * 10)) / 2 : 0
  rig.spine.position.y = .005 * breathing + .019 * Math.abs(stride) - .030 * tapping
  rig.spine.rotation.set(tapping * .093, 0, stride * .042)
  rig.head.rotation.set(.016 * breathing + tapping * .30, Math.sin(seconds * 1.4) * .085, wave ? .105 : stride * -.048)
  // Set every joint from this pose, including blink, so replay scrubbing is reversible.
  const blink = (seconds + 1.6) % 3.86
  rig.eyes.scale.y = blink < .135 ? 1 - .9 * Math.sin(Math.PI * blink / .135) : 1
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const liftsHand = wave && side === 1
    rig.arms[i].position.z = liftsHand ? .080 : 0
    rig.arms[i].rotation.set(
      liftsHand ? -.38 : -.065 - stride * side * .67 - tapping * (side > 0 ? 1.16 : .86),
      liftsHand ? -.26 : 0,
      liftsHand ? 1.76 : side * (.11 + .04 * breathing + tapping * .14),
    )
    rig.hands[i].rotation.set(
      liftsHand ? -.4 : -.20 - tapping * (side > 0 ? .83 : .65),
      0,
      liftsHand ? .48 + Math.sin(seconds * 9) * .40 : 0,
    )
    rig.legs[i].rotation.x = stride * side * .61
  }
}

function makeBattery() {
  const parts = new ModelParts()
  parts.box([.324, .398, .253], [0, .246, 0], '#ffb539', .039)
  parts.box([.343, .064, .271], [0, .059, 0], graphite, .021)
  parts.box([.346, .049, .274], [0, .425, 0], '#ec8336', .017)
  parts.box([.320, .041, .252], [0, .461, 0], '#665044', .013)
  parts.box([.132, .055, .134], [0, .502, 0], '#ffdf91', .010)
  parts.box([.304, .018, .260], [0, .098, 0], '#fff397', .008, [0, 0, 0], 'light')
  // The dark lightning mark is readable at small board sizes.
  const bolt = new THREE.Shape()
  bolt.moveTo(.014, .105)
  bolt.lineTo(-.079, -.009)
  bolt.lineTo(-.009, -.008)
  bolt.lineTo(-.029, -.107)
  bolt.lineTo(.080, .024)
  bolt.lineTo(.017, .021)
  bolt.closePath()
  parts.add(new THREE.ShapeGeometry(bolt), '#75401e', [0, .257, .128])
  for (const side of [-1, 1]) {
    parts.box([.006, .196, .052], [side * .162, .255, -.027], '#fff2a0', 0, [0, 0, 0], 'light')
  }
  return parts
}

function makeExit() {
  const parts = new ModelParts()
  parts.cylinder(.441, .408, .073, [0, .040, 0], '#355767')
  parts.cylinder(.380, .402, .026, [0, .088, 0], '#153646')
  parts.cylinder(.263, .263, .012, [0, .105, 0], '#24635e')
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const angle = quadrant * Math.PI / 2
    const arc = new THREE.TorusGeometry(.335, .018, 5, 8, Math.PI * .41)
    arc.rotateX(-Math.PI / 2)
    arc.rotateY(angle)
    parts.add(arc, '#66fbe0', [0, .108, 0], [0, 0, 0], 'light')
  }
  for (const side of [-1, 1]) {
    parts.box([.049, .011, .172], [side * .053, .118, .014], '#acffdd', .004, [0, side * .70, 0], 'light')
  }
  return parts
}

function makeNumberLabel(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#3a242e'
  ctx.strokeStyle = '#ffcd9c'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(48, 48, 38, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#fff4d9'
  ctx.font = 'bold 54px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 48, 51, 60)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
}

export function createStationModels() {
  const geometries: THREE.BufferGeometry[] = []
  const materials = {
    shell: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .14 }),
    light: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }
  const templates = new Map<string, THREE.Group>()
  const labels = new Map<string, THREE.SpriteMaterial>()
  const rigs = new WeakMap<THREE.Group, RobotRig>()
  function instance(name: string, make: () => ModelParts) {
    let template = templates.get(name)
    if (!template) {
      template = make().bake(materials, geometries)
      template.name = name
      templates.set(name, template)
    }
    return template.clone()
  }
  function addNumber(model: THREE.Group, number: string, height: number) {
    let material = labels.get(number)
    if (!material) {
      material = makeNumberLabel(number)
      if (material) labels.set(number, material)
    }
    if (!material) return
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(.33, .33, 1)
    sprite.position.set(0, height, 0)
    model.add(sprite)
  }
  return {
    robot(enemy = false, index?: number, label?: string) {
      const style = enemy ? 1 + (index ?? 0) % (liveries.length - 1) : 0
      const colors = liveries[style]
      const robot = new THREE.Group()
      robot.name = enemy ? 'rival-' + style : 'sprout'
      const spine = instance(robot.name + '-chassis', () => chassis(colors))
      robot.add(spine)
      const head = instance(robot.name + '-helmet', () => helmet(style, colors))
      head.position.y = .554
      spine.add(head)
      const face = instance(robot.name + '-eyes', () => eyes(style, colors.lamp))
      face.position.set(0, .17, .255)
      head.add(face)
      const arms: THREE.Group[] = []
      const hands: THREE.Group[] = []
      const legs: THREE.Group[] = []
      for (const side of [-1, 1]) {
        const shoulder = instance(robot.name + '-arm-' + side, () => arm(side, colors))
        shoulder.position.set(side * .229, .452, 0)
        spine.add(shoulder)
        arms.push(shoulder)
        const elbow = instance(robot.name + '-hand-' + side, () => hand(side, colors))
        elbow.position.set(side * .017, -.116, 0)
        shoulder.add(elbow)
        hands.push(elbow)
        const boot = instance(robot.name + '-boot', () => leg(colors))
        boot.position.set(side * .115, .201, 0)
        robot.add(boot)
        legs.push(boot)
      }
      const rig = { spine, head, eyes: face, arms, hands, legs }
      rigs.set(robot, rig)
      poseRobot(rig, 'idle', 0)
      const number = label || (index === undefined ? '' : String(index + 1))
      if (enemy && number) addNumber(robot, number, 1.19)
      return robot
    },
    pose(robot: THREE.Group, action: RobotAction, seconds: number) {
      const rig = rigs.get(robot)
      if (rig) poseRobot(rig, action, seconds)
    },
    gesture(robot: THREE.Group, action: RobotGesture, progress: number, condition?: boolean) {
      const rig = rigs.get(robot)
      if (!rig) return
      poseRobot(rig, 'idle', 0)
      poseGesture(rig, action, progress, condition)
    },
    battery: () => instance('battery', makeBattery),
    device(device: BoardDevice) {
      const model = instance(device.kind + '-' + device.status, () => deviceModel(new ModelParts(), device))
      if (device.kind === 'chest') {
        const lid = instance('chest-lid', () => {
          const parts = new ModelParts()
          parts.box([.68, .17, .50], [0, 0, .22], '#e9a74e', .060)
          return parts
        })
        lid.position.set(0, .395, -.22)
        lid.rotation.x = device.status === 'open' ? -1.35 : 0
        model.add(lid)
      }
      if ('direction' in device) model.rotation.y = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 }[device.direction]
      if (device.kind === 'mirror') model.rotation.y = device.orientation === '/' ? Math.PI / 4 : -Math.PI / 4
      if (device.kind === 'bomb' && device.status === 'armed') addNumber(model, String(device.remaining), .78)
      return model
    },
    exit: () => instance('exit', makeExit),
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      for (const material of labels.values()) {
        material.map?.dispose()
        material.dispose()
      }
      geometries.length = 0
      labels.clear()
      templates.clear()
    },
  }
}

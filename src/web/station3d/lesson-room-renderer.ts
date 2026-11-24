import * as THREE from 'three'
import type { LessonRoomFamily } from './lessonRoom'
import { createRoomControlRig } from './room-control-rig'
import { initialRoomActivity, roomActivityReading, type RoomActivityState, type RoomTarget } from './roomActivity'
import { createStationModels } from './models'
import { Kit } from './workshop'

const steel = '#41636a'
const dark = '#263d47'
const brass = '#d89550'
const cream = '#e3d9b7'
const front: [number, number, number] = [Math.PI / 2, 0, 0]
export type RoomProp = 'lamp' | 'fan'
type HitTarget = RoomTarget | RoomProp
type ScreenPoint = { x: number; y: number }
const palette: Record<LessonRoomFamily, string> = {
  coding: '#9ce3c3', algorithms: '#8cd7c5', systems: '#a6c7e6', electronics: '#9ce59c',
  data: '#90d9e1', vision: '#8bdbef', ai: '#d7b3fb',
}

function roomShell() {
  const kit = new Kit()
  kit.box([0, 1.3, -1.68], [40, 7, .24], '#517172')
  // The warm worktop continues below both banks of equipment and the lesson screen.
  kit.box([0, .65, .05], [40, .22, 2.38], '#996947')
  kit.box([0, .766, .05], [40, .062, 2.42], '#d3ae78')
  kit.box([0, .607, 1.255], [40, .09, .055], '#976a4e')
  kit.box([0, .56, 1.21], [40, .055, .085], steel)
  kit.box([0, -.83, .06], [40, 2.74, 2.10], '#47656a')
  for (let i = -7; i < 8; i++) {
    const x = i * 2.70
    for (const y of [.33, -.08]) {
      kit.box([x, y, 1.13], [2.6, .35, .11], '#73928a')
      kit.box([x, y + .035, 1.22], [.64, .05, .08], dark)
    }
    kit.box([x, .822, .07], [.014, .007, 2.16], '#b9956a')
  }
  return kit
}

function workshopWindow() {
  const kit = new Kit()
  // A deep sill and two layers of rooftops sit inside the glazed opening.
  kit.casing([0, 1.94, -1.46], [5.45, 2.22, .17], dark, .065)
  kit.sky([0, 1.96, -1.355], 5.21, 1.98, '#739fba', '#f6c99a')
  kit.cylinder([-.82, 2.18, -1.326], .207, .207, .018, '#ffe2a7', front, 'glow', 40)
  const hills = new THREE.Shape()
  hills.moveTo(-2.60, 1.02)
  for (const [x, y] of [[-2.60, 1.74], [-2.38, 1.79], [-2.16, 1.95], [-1.77, 1.80], [-1.52, 1.89],
    [-1.19, 1.72], [-.73, 1.84], [-.40, 1.73], [-.13, 1.81], [.35, 1.66], [.90, 1.90],
    [1.15, 1.85], [1.43, 1.97], [1.95, 1.72], [2.36, 1.83], [2.60, 1.78], [2.60, 1.02]]) hills.lineTo(x, y)
  hills.closePath()
  kit.geometry(new THREE.ShapeGeometry(hills), [0, 0, -1.303], '#96aaa5', undefined, 'glow')
  for (let i = 0; i < 14; i++) {
    const x = -2.43 + i * .374
    const h = [.55, .41, .69, .53, .74, .57, .40][i % 7]
    kit.box([x, 1.08 + h / 2, -1.26], [.365, h, .048], i % 2 ? '#718e91' : '#7f9997', undefined, 'glow')
    kit.box([x - .134, 1.08 + h / 2, -1.224], [.080, h, .018], '#69878a', undefined, 'glow')
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) kit.box([x - .02 + col * .092, 1.08 + h - .10 - row * .13, -1.222],
        [.05, .055, .015], row === 0 && i % 3 === 0 ? '#ddc79b' : '#92a9a4', undefined, 'glow')
    }
    if (i % 4 === 0) kit.box([x, 1.10 + h + .105, -1.28], [.062, .21, .05], '#718e91', undefined, 'glow')
    if (i % 3 === 1) {
      kit.box([x - .045, 1.14 + h, -1.24], [.27, .067, .04], '#526e78', undefined, 'glow')
      kit.box([x - .045, 1.23 + h, -1.24], [.21, .14, .04], '#597985', undefined, 'glow')
    }
  }
  for (const x of [-2.61, -1.22, 1.22, 2.61]) kit.box([x, 1.96, -1.06], [.065, 2.05, .16], '#426269')
  kit.box([0, 2.49, -1.07], [5.21, .041, .13], '#516f71')
  kit.box([0, .964, -.99], [5.52, .13, .32], cream)
  return kit
}

function toolWall() {
  const kit = new Kit()
  kit.casing([0, 1.93, -1.38], [2.71, 1.65, .12], '#304c54', .05)
  kit.box([0, 1.93, -1.30], [2.58, 1.53, .052], '#64867d')
  for (let row = 0; row < 6; row++) for (let col = 0; col < 12; col++)
    kit.box([-1.16 + col * .211, 1.34 + row * .229, -1.259], [.031, .043, .026], '#3b5b5b')
  for (let i = 0; i < 3; i++) {
    const x = -.92 + i * .30, y = 2.24 + (i % 2) * .08
    kit.box([x, y, -1.15], [.09, .10, .19], brass)
    kit.rod([x, y, -1.038], [x + .095, y - .43, -1.038], .035, cream)
    kit.rod([x + .095, y - .43, -1.038], [x + .061, y - .53, -1.038], .032, cream)
    kit.rod([x + .095, y - .43, -1.038], [x + .174, y - .49, -1.038], .032, cream)
  }
  kit.box([.54, 2.09, -1.14], [.79, .105, .23], dark)
  for (const [i, color] of [brass, cream, '#c47758'].entries()) {
    const x = .28 + i * .24
    kit.cylinder([x, 2.19, -1.08], .060, .063, .25, color)
    kit.rod([x, 2.06, -1.08], [x, 1.77, -1.08], .020, '#bfd1c5')
  }
  return kit
}

function windowClouds() {
  const kit = new Kit()
  for (const [x, y, w] of [[-.21, 2.23, .57], [1.73, 2.18, .39], [-1.65, 2.14, .36]] as const) {
    kit.box([x, y, -1.32], [w, .026, .01], '#cfceba', undefined, 'glow')
    kit.box([x + .06, y + .04, -1.32], [w * .52, .032, .01], '#dcd6bf', undefined, 'glow')
  }
  return kit
}

function weatherBalloon() {
  const kit = new Kit()
  // Two curved fabric panels, cords and basket sit behind the window mullions.
  const envelope = new THREE.Shape()
  envelope.moveTo(0, .24)
  envelope.bezierCurveTo(-.29, .24, -.28, -.015, -.137, -.127)
  envelope.quadraticCurveTo(-.076, -.183, -.06, -.221)
  envelope.lineTo(.06, -.221)
  envelope.bezierCurveTo(.12, -.117, .234, -.09, .234, .05)
  envelope.quadraticCurveTo(.234, .24, 0, .24)
  const stripe = new THREE.Shape()
  stripe.moveTo(-.019, .24)
  stripe.bezierCurveTo(-.147, .18, -.148, .032, -.027, -.218)
  stripe.lineTo(.022, -.218)
  stripe.bezierCurveTo(.134, .014, .16, .188, .017, .24)
  stripe.closePath()
  kit.geometry(new THREE.ShapeGeometry(envelope), [0, 0, 0], '#b87d65', undefined, 'glow')
  kit.geometry(new THREE.ShapeGeometry(stripe), [0, 0, .002], '#ebc99c', undefined, 'glow')
  for (const side of [-1, 1]) kit.rod([side * .058, -.21, 0], [side * .042, -.286, 0], .009, '#746959', 'glow')
  kit.box([0, -.305, 0], [.10, .056, .018], '#94745e', undefined, 'glow')
  kit.box([0, -.281, .011], [.112, .019, .008], '#c69b72', undefined, 'glow')
  return kit
}

function anglepoise() {
  const kit = new Kit()
  kit.cylinder([0, .056, 0], .25, .30, .112, dark)
  kit.cylinder([0, .154, 0], .11, .14, .13, brass)
  kit.rod([0, .21, 0], [-.21, .92, -.06], .049, steel)
  kit.rod([.087, .22, 0], [-.124, .93, -.06], .030, brass)
  kit.rod([-.21, .92, -.06], [.36, 1.39, .0], .057, steel)
  kit.rod([-.12, .89, -.06], [.42, 1.34, .0], .025, brass)
  for (const [x, y] of [[0, .22], [-.18, .92], [.39, 1.36]])
    kit.cylinder([x, y, .037], .094, .094, .117, brass, front)
  kit.cylinder([.48, 1.28, .04], .115, .286, .26, '#d38c4d', [0, 0, .34])
  kit.cylinder([.53, 1.15, .04], .267, .27, .019, '#796e5b', [0, 0, .34])
  return kit
}

function servicePillar() {
  const kit = new Kit()
  kit.box([0, 1.56, -.97], [.29, 3.13, .46], steel)
  kit.box([.01, 1.57, -.71], [.22, 2.95, .085], '#98ab98')
  kit.box([0, 2.38, -.64], [.34, .30, .15], brass)
  for (const y of [1.02, 1.76, 2.69]) kit.box([0, y, -.61], [.26, .071, .12], dark)
  // A caged extractor and its trunking hang on the outside edge of the room.
  kit.casing([-.55, 2.05, -1.35], [.84, .84, .14], '#77938b', .07)
  kit.cylinder([-.55, 2.05, -1.24], .36, .36, .13, dark, front)
  kit.cylinder([-.55, 2.05, -1.105], .105, .105, .073, brass, front)
  kit.cylinder([-.23, 2.38, -1.24], .045, .045, .032, dark, front)
  kit.rod([-.50, 1.62, -1.28], [-.50, 1.28, -1.28], .038, steel)
  kit.rod([-.50, 1.28, -1.28], [.04, 1.28, -1.28], .038, steel)
  return kit
}

function extractorBlades() {
  const kit = new Kit()
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3
    kit.box([-.156 * Math.sin(angle), .156 * Math.cos(angle), 0],
      [.114, .234, .041], '#b4c3ae', [.22, 0, angle - .26])
  }
  return kit
}

export function createLessonRoomRenderer(canvas: HTMLCanvasElement, family: LessonRoomFamily, completed: boolean,
  events: {
    initialActivity?: RoomActivityState
    ready: () => void
    failed: () => void
    onPick: (target: RoomTarget) => void
    onToggle: (prop: RoomProp, on: boolean) => void
    onProject: (centres: Record<HitTarget, ScreenPoint>) => void
  }) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  gl.setClearColor('#45636a')
  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.shadowMap.enabled = true
  gl.shadowMap.type = THREE.PCFSoftShadowMap
  gl.shadowMap.autoUpdate = false

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 35)
  camera.position.set(0, 4.1, 10)
  camera.lookAt(0, 1.52, 0)
  scene.add(new THREE.HemisphereLight(0xe7f4f0, 0x698a89, 1.62))
  const sun = new THREE.DirectionalLight(0xffddaa, 2.25)
  sun.position.set(-4, 7, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 512)
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 4, bottom: -4, near: .4, far: 21 })
  sun.shadow.normalBias = .018
  sun.shadow.bias = -.0003
  const rim = new THREE.DirectionalLight(0x90d7ee, 1.25)
  rim.position.set(3, 4, -3)
  scene.add(sun, rim)

  const materials = {
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .73, metalness: .13 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }
  const geometries: THREE.BufferGeometry[] = []
  function build(kit: Kit) {
    const group = kit.finish(materials, geometries)
    scene.add(group)
    return group
  }
  build(roomShell())
  const windowFrame = build(workshopWindow())
  const pegboard = build(toolWall())
  const lamp = build(anglepoise())
  const pillar = build(servicePillar())
  const clouds = build(windowClouds())
  const balloon = build(weatherBalloon())
  balloon.position.set(1.75, 2.14, -1.314)
  windowFrame.add(clouds, balloon)
  const rotor = build(extractorBlades())
  rotor.position.set(-.55, 2.05, -1.15)
  rotor.traverse(object => { object.castShadow = false })
  pillar.add(rotor)
  const pilotKit = new Kit()
  pilotKit.cylinder([-.23, 2.38, -1.215], .034, .034, .020, '#92e8bf', front, 'glow')
  pilotKit.cylinder([-.55, 2.05, -1.088], .138, .138, .016, '#92e8bf', front, 'glow')
  // Keep the extractor's breathing light independent of the instrument readouts.
  const pilotLight = materials.glow.clone()
  const pilot = pilotKit.finish({ ...materials, glow: pilotLight }, geometries)
  pillar.add(pilot)
  const bulbKit = new Kit()
  bulbKit.cylinder([.53, 1.15, .04], .284, .292, .036, '#fff0bb', [0, 0, .34], 'glow')
  const bulb = build(bulbKit)
  const light = new THREE.SpotLight(0xffcf85, 6, 2.8, .65, .74)
  light.position.set(.55, 1.12, .04)
  light.target.position.set(.98, 0, .37)
  lamp.add(bulb, light, light.target)
  const propOn = { lamp: true, fan: true }
  const accent = palette[family]
  const rig = createRoomControlRig(family, accent, materials)
  const { groups } = rig
  scene.add(...Object.values(groups))
  const models = createStationModels()
  const hero = models.robot()
  hero.rotation.y = .39
  scene.add(hero)
  const targets: RoomTarget[] = ['sample', 'setting', 'run']
  const props: RoomProp[] = ['lamp', 'fan']
  const pickable = [...targets, ...props]
  const objects = { ...groups, lamp, fan: pillar }
  const anchors = { sample: new THREE.Vector3(0, .45, .10), setting: new THREE.Vector3(0, .49, .28), run: new THREE.Vector3(0, .67, .10),
    lamp: new THREE.Vector3(.48, 1.28, .04), fan: rotor.position.clone() }
  const hitBoxes = { sample: new THREE.Box3(), setting: new THREE.Box3(), run: new THREE.Box3(), lamp: new THREE.Box3(), fan: new THREE.Box3() }
  const raycaster = new THREE.Raycaster(), hitPoint = new THREE.Vector3(), pointerPosition = new THREE.Vector2()
  const dragPlane = new THREE.Plane(), dragOffset = new THREE.Vector3()
  const ghostMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .80, depthWrite: false, toneMapped: false })
  const haloGeometry = new THREE.TorusGeometry(.75, .025, 6, 48)
  const haloMaterial = new THREE.MeshBasicMaterial({ color: '#ffc37e', toneMapped: false })
  const halo = new THREE.Mesh(haloGeometry, haloMaterial)
  halo.rotation.x = -Math.PI / 2
  halo.scale.set(1.28, .69, 1)
  halo.visible = false
  scene.add(halo)
  let pressed: { id: number; target: HitTarget; x: number; y: number; canDrag: boolean } | undefined
  let ghost: THREE.Object3D | undefined, hover: HitTarget | undefined

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let disposed = false, first = true, done = completed, frame = 0
  let visible = false, idleTimer = 0
  let lastDraw: number | undefined, elapsed = 0
  let operationStart: number | undefined
  let lastTarget: RoomTarget | undefined
  let renderedActivity: RoomActivityState | undefined
  function draw(now: number) {
    frame = 0
    if (disposed || !visible || document.hidden) return
    if (!reduced.matches && lastDraw !== undefined) {
      const dt = Math.min(.25, (now - lastDraw) / 1000)
      elapsed += dt
      clouds.position.x = .36 * Math.sin(elapsed * .19)
      balloon.position.y = 2.14 + .082 * Math.sin(elapsed * .70)
      pilotLight.color.setScalar(.74 + .26 * Math.cos(elapsed * .96))
      if (propOn.fan) rotor.rotation.z -= dt * 1.35
    }
    lastDraw = now
    const progress = operationStart === undefined || reduced.matches ? 1 : Math.min(1, (now - operationStart) / 780)
    rig.animate(lastTarget, progress)
    if (lastTarget && progress < 1) {
      models.gesture(hero, lastTarget === 'sample' ? 'pick' : lastTarget === 'setting' ? 'step' : 'scan', progress)
    } else models.pose(hero, done ? 'wave' : 'work', .39)
    const marked = ghost ? 'run' : hover
    halo.visible = false
    if (marked && marked !== 'fan' && marked !== 'lamp') {
      halo.visible = true
      halo.position.copy(groups[marked].position)
      halo.position.y += .025
      halo.scale.set(marked === 'setting' ? .93 : 1.49, .83, 1)
      haloMaterial.color.set(ghost && hover === 'run' ? '#affeac' : '#ffc37e')
    }
    if (operationStart !== undefined) gl.shadowMap.needsUpdate = true
    try { gl.render(scene, camera) } catch { fail(); return }
    if (first) { first = false; events.ready() }
    if (progress < 1) redraw()
    else {
      operationStart = undefined
      if (!reduced.matches) idleTimer = window.setTimeout(redraw, 100)
    }
  }
  function redraw() {
    window.clearTimeout(idleTimer)
    if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw)
  }
  function visibilityChanged() {
    lastDraw = undefined
    window.clearTimeout(idleTimer)
    cancelAnimationFrame(frame)
    frame = 0
    redraw()
  }
  function toggleProp(prop: RoomProp) {
    if (disposed) return
    propOn[prop] = !propOn[prop]
    bulb.visible = propOn.lamp
    light.intensity = propOn.lamp ? 6 : 0
    pilot.visible = propOn.fan
    events.onToggle(prop, propOn[prop])
    redraw()
  }
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight
    if (!width || !height) return
    gl.setSize(width, height, false)
    const viewHeight = Math.max(2.84, 7.4 * height / width)
    const viewWidth = viewHeight * width / height
    camera.left = -viewWidth / 2
    camera.right = viewWidth / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const size = Math.min(1.34, viewWidth / 8.9)
    hero.position.set(-viewWidth * .397, .802, -.30)
    hero.scale.setScalar(size)
    groups.sample.position.set(-viewWidth * .245, .802, .38)
    groups.setting.position.set(viewWidth * .005, .802, .20)
    groups.run.position.set(viewWidth * .276, .802, .04)
    groups.sample.rotation.y = .13
    groups.run.rotation.y = -.15
    for (const target of targets) groups[target].scale.setScalar(size)
    lamp.position.set(-viewWidth * .45, .802, -.63)
    pillar.position.x = viewWidth * .444
    pegboard.position.x = hero.position.x + .18
    windowFrame.scale.x = Math.max(.62, viewWidth * .096)
    scene.updateMatrixWorld(true)
    const projected = {} as Record<HitTarget, ScreenPoint>
    for (const target of pickable) {
      const p = objects[target].localToWorld(anchors[target].clone()).project(camera)
      projected[target] = { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }
    }
    events.onProject(projected)
    hitBoxes.lamp.setFromCenterAndSize(anchors.lamp, new THREE.Vector3(.70, .49, .62)).applyMatrix4(lamp.matrixWorld)
    hitBoxes.fan.setFromCenterAndSize(anchors.fan, new THREE.Vector3(.83, .83, .24)).applyMatrix4(pillar.matrixWorld)
    refreshBounds()
    gl.shadowMap.needsUpdate = true
    redraw()
  }
  function refreshBounds() {
    for (const target of targets) hitBoxes[target].setFromObject(groups[target]).expandByScalar(.035)
  }
  function setActivity(state: RoomActivityState, action?: RoomTarget) {
    if (disposed || renderedActivity === state) return
    if (pressed) clearDrag()
    renderedActivity = state
    rig.update(state, roomActivityReading(family, state))
    rig.animate(undefined, 1)
    lastTarget = action
    operationStart = action && !reduced.matches ? performance.now() : undefined
    refreshBounds()
    gl.shadowMap.needsUpdate = true
    redraw()
  }
  function targetAt(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    pointerPosition.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2)
    raycaster.setFromCamera(pointerPosition, camera)
    let nearest = Infinity, picked: HitTarget | undefined
    for (const target of pickable) {
      if (raycaster.ray.intersectBox(hitBoxes[target], hitPoint)) {
        const distance = hitPoint.distanceToSquared(raycaster.ray.origin)
        if (distance < nearest) {
          nearest = distance
          picked = target
        }
      }
    }
    return picked
  }
  function setHover(target?: HitTarget) {
    if (target === hover && !ghost) return
    hover = target
    canvas.style.cursor = ghost ? 'grabbing' : target === 'sample' ? 'grab' : target ? 'pointer' : ''
    redraw()
  }
  function down(e: PointerEvent) {
    if (!e.isPrimary || e.button !== 0 || pressed) return
    const target = targetAt(e)
    if (!target) return
    pressed = { id: e.pointerId, target, x: e.clientX, y: e.clientY, canDrag: e.pointerType !== 'touch' && target === 'sample' }
    canvas.setPointerCapture(e.pointerId)
    if (pressed.canDrag) {
      dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(hitPoint), groups.sample.position)
      raycaster.ray.intersectPlane(dragPlane, dragOffset)
      dragOffset.sub(groups.sample.position)
    }
    setHover(target)
  }
  function move(e: PointerEvent) {
    if (!e.isPrimary || (pressed && e.pointerId !== pressed.id)) return
    const target = targetAt(e)
    if (pressed?.canDrag && (ghost || Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 6)) {
      if (!ghost) {
        ghost = groups.sample.clone()
        ghost.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.material = ghostMaterial
            obj.castShadow = false
          }
        })
        scene.add(ghost)
      }
      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) ghost.position.copy(hitPoint).sub(dragOffset)
      ghost.position.y += .14
      setHover(target)
    } else if (e.pointerType !== 'touch') setHover(target)
  }
  function clearDrag() {
    const id = pressed?.id
    pressed = undefined
    // Only the cloned hierarchy belongs to this drag. Its geometry and the
    // translucent material are shared with the rig and the next drag.
    ghost?.removeFromParent()
    ghost = undefined
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
    hover = undefined
    canvas.style.cursor = ''
    redraw()
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== pressed?.id) return
    const target = targetAt(e)
    let picked: HitTarget | undefined
    if (ghost) {
      if (target === 'run') picked = target
    } else if (target === pressed.target && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) <= 8) {
      picked = target
    }
    clearDrag()
    if (picked === 'lamp' || picked === 'fan') toggleProp(picked)
    else if (picked) events.onPick(picked)
  }
  function leave() { if (!ghost) setHover(undefined) }
  function cancel(e: PointerEvent) { if (pressed?.id === e.pointerId) clearDrag() }
  function motionChanged() {
    operationStart = undefined
    lastDraw = undefined
    gl.shadowMap.needsUpdate = true
    redraw()
  }
  function fail(event?: Event) {
    event?.preventDefault()
    if (disposed) return
    dispose()
    events.failed()
  }
  const observer = new ResizeObserver(resize)
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visibilityChanged() })
  function dispose() {
    if (disposed) return
    disposed = true
    observer.disconnect()
    visibility.disconnect()
    document.removeEventListener('visibilitychange', visibilityChanged)
    clearDrag()
    cancelAnimationFrame(frame)
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointerleave', leave)
    canvas.removeEventListener('pointercancel', cancel)
    canvas.removeEventListener('lostpointercapture', cancel)
    canvas.removeEventListener('webglcontextlost', fail)
    reduced.removeEventListener('change', motionChanged)
    rig.dispose()
    ghostMaterial.dispose()
    pilotLight.dispose()
    haloMaterial.dispose()
    haloGeometry.dispose()
    for (const geometry of geometries) geometry.dispose()
    for (const material of Object.values(materials)) material.dispose()
    sun.shadow.dispose()
    models.dispose()
    scene.clear()
    gl.dispose()
    if (!gl.getContext().isContextLost()) gl.forceContextLoss()
  }
  try {
    canvas.addEventListener('webglcontextlost', fail)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    reduced.addEventListener('change', motionChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
    setActivity(events.initialActivity ?? initialRoomActivity())
    observer.observe(canvas)
    visibility.observe(canvas)
    resize()
  } catch (error) { dispose(); throw error }
  return {
    dispose, setActivity, toggleProp,
    setCompleted(value: boolean) {
      if (done === value) return
      done = value
      gl.shadowMap.needsUpdate = true
      redraw()
    },
  }
}

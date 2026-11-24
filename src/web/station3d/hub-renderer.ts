import * as THREE from 'three'
import { createStationModels } from './models'
import { createWorkshopSet, workshopStations, type HubMachine } from './workshop'

export type WorkshopStop = 'learning' | 'arena'
export type HubCharacter = 'sprout' | 'rival'
type Landmark = WorkshopStop | HubCharacter | HubMachine
type HubCallbacks = {
  onVisit: (stop: WorkshopStop) => void
  canVisit: (stop: WorkshopStop) => boolean
  onGreet: (who: HubCharacter) => void
  onMachineChange: (machine: HubMachine, active: boolean) => void
  onReady: () => void
  onFailure: () => void
}

export function createHubRenderer(canvas: HTMLCanvasElement, variant: WorkshopStop, events: HubCallbacks) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
  gl.shadowMap.enabled = true
  gl.shadowMap.type = THREE.PCFSoftShadowMap
  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.toneMappingExposure = 1.05
  const scene = new THREE.Scene()
  const arena = variant === 'arena'
  scene.fog = new THREE.FogExp2(arena ? 0x344051 : 0x345765, 0.022)
  scene.add(new THREE.HemisphereLight(0xe2f8ff, 0x66829b, 1.55))
  const sunlight = new THREE.DirectionalLight(0xffe1ab, 2.35)
  sunlight.position.set(-4, 8, 5)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1024, 1024)
  Object.assign(sunlight.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 0.5, far: 25 })
  sunlight.shadow.normalBias = 0.018
  sunlight.shadow.bias = -0.0004
  const rim = new THREE.DirectionalLight(arena ? 0xffad76 : 0x8fd6fd, 1.9)
  rim.position.set(4, 5, -5)
  scene.add(sunlight, rim)

  const workshop = createWorkshopSet({ kind: 'lobby', variant: arena ? 'arena' : 'workshop' })
  const models = createStationModels()
  const hero = models.robot()
  const rival = models.robot(true, arena ? 1 : 0)
  const home = new THREE.Vector3(arena ? -0.55 : 0, 0, 1.06)
  hero.position.copy(home)
  hero.scale.setScalar(1.85)
  const homeFacing = 0.46
  hero.rotation.y = homeFacing
  rival.position.set(arena ? 1.9 : 2.75, 0, arena ? 0.77 : -0.20)
  rival.rotation.y = arena ? -0.26 : -0.52
  rival.scale.setScalar(arena ? 1.48 : 1.12)
  scene.add(workshop.group, rival, hero)
  const teammate = arena ? models.robot(true, 0) : undefined
  if (teammate) {
    teammate.position.set(-3.15, 0, 1.20)
    teammate.rotation.y = .62
    teammate.scale.setScalar(1.22)
    scene.add(teammate)
  }

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
  const target = new THREE.Vector3(-0.08, arena ? 1.10 : 1.27, -0.23)
  let yaw = arena ? 0.20 : 0.52
  let pitch = 0.33
  const startYaw = yaw
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const hitMaterial = new THREE.MeshBasicMaterial({ opacity: 0, transparent: true, depthWrite: false })
  const hitGeometry = new THREE.BoxGeometry(1, 1, 1)
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const landing = new THREE.Mesh(new THREE.RingGeometry(.15, .19, 32), new THREE.MeshBasicMaterial({
    color: 0xc5ffe2, transparent: true, opacity: .9, depthWrite: false, toneMapped: false,
  }))
  landing.rotation.x = -Math.PI / 2
  landing.visible = false
  scene.add(landing)
  function addHitbox(name: Landmark, parent: THREE.Object3D, point: THREE.Vector3, size: THREE.Vector3) {
    const box = new THREE.Mesh(hitGeometry, hitMaterial)
    box.name = name
    box.position.copy(point)
    box.scale.copy(size)
    box.visible = false
    parent.add(box)
    return box
  }
  const hits: THREE.Object3D[] = [
    addHitbox('sprout', hero, new THREE.Vector3(0, .53, 0), new THREE.Vector3(.79, 1.16, .6)),
    addHitbox('learning', scene, new THREE.Vector3(...workshopStations.learning), new THREE.Vector3(2.45, 1.7, 1.25)),
    addHitbox('arena', scene, new THREE.Vector3(...workshopStations.arena), new THREE.Vector3(2.0, 2.8, 1.18)),
  ]
  if (teammate) {
    for (const actor of [rival, teammate]) hits.push(addHitbox('rival', actor,
      new THREE.Vector3(0, .53, 0), new THREE.Vector3(.79, 1.16, .6)))
  }
  if (workshop.machines) hits.push(...workshop.machines.picks.keys())
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  let visible = true
  let disposed = false
  let presented = false
  let raf = 0
  let ambientTimer: ReturnType<typeof setTimeout> | undefined
  let lastFrame: number | undefined
  let ambientTime = 0
  let settle = performance.now() + 1250
  let wave: { start: number; who: HubCharacter } | undefined
  let journey: { stop?: WorkshopStop; start: number; duration: number; from: THREE.Vector3; to: THREE.Vector3 } | undefined
  let tripTimer: ReturnType<typeof setTimeout> | undefined
  let poseTimer: ReturnType<typeof setTimeout> | undefined
  let drag: { id: number; x: number; y: number; yaw: number; pitch: number; moved: boolean } | undefined

  function adjustCamera() {
    // Frame the workstations at opposite ends even when the viewport becomes portrait.
    const visibleHeight = Math.max(arena ? 4.70 : 4.27, 7.65 / camera.aspect)
    const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }

  function resize() {
    if (disposed) return
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight)
    gl.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    adjustCamera()
    redraw()
  }

  function draw(now: number) {
    raf = 0
    if (disposed || !visible || document.hidden) return
    const reduced = media.matches
    const dt = reduced || lastFrame === undefined ? 0 : Math.min((now - lastFrame) / 1000, .25)
    lastFrame = now
    ambientTime += dt
    let seconds = reduced ? 0 : ambientTime
    if (wave && now - wave.start >= 1800) wave = undefined
    const waveSeconds = wave && (reduced ? .55 : (now - wave.start) / 1000)
    if (journey) {
      const progress = reduced ? 1 : Math.min(1, (now - journey.start) / journey.duration)
      seconds = progress * journey.duration / 1000
      hero.position.lerpVectors(journey.from, journey.to, progress * progress * (3 - 2 * progress))
      hero.rotation.y = Math.atan2(journey.to.x - journey.from.x, journey.to.z - journey.from.z)
      models.pose(hero, progress < 1 ? 'walk' : 'work', seconds)
      if (progress === 1) { finishJourney(); if (disposed) return }
    } else if (wave?.who === 'sprout') {
      models.pose(hero, 'wave', waveSeconds ?? 0)
    } else {
      models.pose(hero, 'idle', seconds)
    }
    models.pose(rival, wave?.who === 'rival' ? 'wave' : arena ? 'idle' : 'work',
      wave?.who === 'rival' ? waveSeconds ?? 0 : seconds + .4)
    if (teammate) models.pose(teammate, wave?.who === 'rival' ? 'wave' : 'idle',
      wave?.who === 'rival' ? (waveSeconds ?? 0) + .1 : seconds + .9)
    workshop.update(reduced ? 0 : ambientTime)
    workshop.machines?.update(dt, reduced)
    try { gl.render(scene, camera) }
    catch { fail(); return }
    if (!presented) { presented = true; events.onReady() }
    if (!reduced && (journey || wave || now < settle)) redraw()
    else if (!reduced) ambientTimer = setTimeout(redraw, 100)
  }
  function redraw() {
    clearTimeout(ambientTimer)
    if (!disposed && visible && !document.hidden && !raf) raf = requestAnimationFrame(draw)
  }
  function operate(machine: HubMachine) {
    if (disposed || !workshop.machines) return
    events.onMachineChange(machine, workshop.machines.toggle(machine))
    settle = performance.now() + 900
    redraw()
  }
  function greet(who: HubCharacter = 'sprout') {
    clearTimeout(tripTimer)
    clearTimeout(poseTimer)
    landing.visible = false
    journey = undefined
    wave = { start: performance.now(), who }
    if (who === 'sprout') hero.rotation.y = yaw
    settle = wave.start + 1850
    events.onGreet(who)
    if (media.matches) poseTimer = setTimeout(() => { wave = undefined; redraw() }, 1800)
    redraw()
  }
  function finishJourney() {
    if (!journey) return
    clearTimeout(tripTimer)
    const { stop, to } = journey
    journey = undefined
    landing.visible = false
    hero.position.copy(stop ? home : to)
    hero.rotation.y = stop ? homeFacing : yaw
    if (stop) events.onVisit(stop)
    redraw()
  }
  function startWalk(to: THREE.Vector3, stop?: WorkshopStop) {
    clearTimeout(tripTimer)
    wave = undefined
    const duration = THREE.MathUtils.clamp(hero.position.distanceTo(to) * 355, 250, 1100)
    journey = { stop, start: performance.now(), duration, from: hero.position.clone(), to }
    landing.position.set(to.x, .06, to.z)
    landing.visible = !stop
    if (!visible || document.hidden || media.matches) finishJourney()
    else {
      tripTimer = setTimeout(finishJourney, duration)
      redraw()
    }
  }
  function visit(stop: WorkshopStop) {
    if (disposed || !events.canVisit(stop)) return
    startWalk(stop === 'learning' ? new THREE.Vector3(arena ? -1.65 : -2.05, 0, 1.02) : new THREE.Vector3(2.2, 0, -.46), stop)
  }
  function hitAt(event: PointerEvent): Landmark | undefined {
    const rect = canvas.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
    scene.updateMatrixWorld()
    raycaster.setFromCamera(pointer, camera)
    const underPointer = raycaster.intersectObjects(hits, false)
    const picks = workshop.machines?.picks
    const landmark = underPointer.find(hit => !picks?.has(hit.object))?.object
    if (landmark?.name === 'sprout' || landmark?.name === 'rival') return landmark.name
    if (picks && underPointer.some(hit => picks.has(hit.object))) {
      // A navigation hitbox has generous padding. A visible machine inside that
      // padding still responds, while the actual casing of a station occludes it.
      const surface = raycaster.intersectObject(workshop.group, true)[0]?.object
      const machine = surface && picks.get(surface)
      if (machine) return machine
    }
    if (!landmark) return
    const hit = landmark.name as WorkshopStop
    return events.canVisit(hit) ? hit : undefined
  }
  const floorBounds = new THREE.Box3(new THREE.Vector3(arena ? -1.52 : -3.14, -.01, arena ? 1.85 : .97),
    new THREE.Vector3(3.31, .09, 2.95))
  const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  function floorAtPointer() {
    const point = raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3())
    if (!point || !floorBounds.containsPoint(point)) return
    const surface = raycaster.intersectObject(workshop.group, true)[0]
    if (surface && surface.point.y <= .085) startWalk(point)
  }
  function walkWithKeys(event: KeyboardEvent) {
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    const delta = new THREE.Vector3(step[0], 0, step[1]).applyAxisAngle(floorPlane.normal, yaw).multiplyScalar(.57)
    const goal = (journey?.to ?? hero.position).clone().add(delta)
    startWalk(floorBounds.clampPoint(goal, goal))
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false }
    canvas.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) {
      if (event.pointerType === 'mouse') canvas.style.cursor = hitAt(event) ? 'pointer' : 'grab'
      return
    }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    canvas.style.cursor = 'grabbing'
    yaw = THREE.MathUtils.clamp(drag.yaw - dx * .006, -.59, .93)
    pitch = THREE.MathUtils.clamp(drag.pitch + dy * .0035, .10, .63)
    adjustCamera()
    redraw()
  }
  function up(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return
    const tap = !drag.moved
    drag = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    canvas.style.cursor = 'grab'
    if (!tap) return
    const hit = hitAt(event)
    if (hit === 'sprout' || hit === 'rival') greet(hit)
    else if (hit === 'fan' || hit === 'crane') operate(hit)
    else if (hit) visit(hit)
    else floorAtPointer()
  }
  function cancel(event: PointerEvent) {
    if (event.pointerId === drag?.id) { drag = undefined; canvas.style.cursor = 'grab' }
  }
  function resetCamera() { yaw = startYaw; pitch = .33; adjustCamera(); redraw() }
  function changeMotion() { settle = 0; lastFrame = undefined; redraw() }
  function changeVisibility() {
    if (!visible || document.hidden) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      clearTimeout(ambientTimer)
      lastFrame = undefined
      finishJourney()
    } else redraw()
  }
  const sizing = new ResizeObserver(resize)
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; changeVisibility() })
  function fail(event?: Event) {
    event?.preventDefault()
    if (disposed) return
    const destination = journey?.stop
    dispose()
    events.onFailure()
    if (destination) events.onVisit(destination)
  }
  function dispose() {
    if (disposed) return
    disposed = true
    clearTimeout(tripTimer)
    clearTimeout(poseTimer)
    clearTimeout(ambientTimer)
    cancelAnimationFrame(raf)
    sizing.disconnect()
    visibility.disconnect()
    document.removeEventListener('visibilitychange', changeVisibility)
    media.removeEventListener('change', changeMotion)
    canvas.removeEventListener('webglcontextlost', fail)
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointercancel', cancel)
    canvas.removeEventListener('lostpointercapture', cancel)
    canvas.removeEventListener('keydown', walkWithKeys)
    workshop.dispose()
    models.dispose()
    hitGeometry.dispose()
    hitMaterial.dispose()
    landing.geometry.dispose()
    landing.material.dispose()
    sunlight.shadow.dispose()
    scene.clear()
    gl.dispose()
    if (!gl.getContext().isContextLost()) gl.forceContextLoss()
  }
  try {
    canvas.addEventListener('webglcontextlost', fail)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    canvas.addEventListener('keydown', walkWithKeys)
    document.addEventListener('visibilitychange', changeVisibility)
    media.addEventListener('change', changeMotion)
    sizing.observe(canvas)
    visibility.observe(canvas)
    resize()
  } catch (error) { dispose(); throw error }
  return { dispose, visit, greet, operate, resetCamera }
}

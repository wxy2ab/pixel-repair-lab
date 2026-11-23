import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Position } from '../../shared/types'
import { gridOffsets } from '../../shared/gridDevices'
import { emittingRay, rayArms } from '../gridDeviceDisplay'
import { createStationModels } from './models'
import { createRobotSignals } from './robotActivity'
import { createWorkshopSet } from './workshop'
import type { StationCamera, StationFrame } from './types'

type RendererCallbacks = {
  onInspect: (cell: Position | undefined) => void
  onFailure: () => void
}
type Block = {
  x: number; y: number; z: number
  width: number; height: number; depth: number
  color: number
  cell?: Position
}
type Entity = {
  object: THREE.Group
  cell: Position
  from: THREE.Vector3
  to: THREE.Vector3
  started: number
  fromYaw: number
  toYaw: number
  activeAt: number
  workingAt?: number
  signature: string
}
const defaultYaw = 0.48
const defaultPitch = 0.80
const wallHeight = 0.46
const moveDuration = 210
const effectDuration = 460
const gestureDuration = 775
const positionKey = ({ x, y }: Position) => x + ',' + y
const sameCell = (a: Position | undefined, b: Position | undefined) => a?.x === b?.x && a?.y === b?.y

function deckLabels(columns: number, rows: number) {
  const surface = document.createElement('canvas')
  const width = columns + 1.06
  const depth = rows + 1.06
  const density = Math.min(92, 2048 / Math.max(width, depth))
  surface.width = Math.ceil(width * density)
  surface.height = Math.ceil(depth * density)
  const ctx = surface.getContext('2d')
  if (!ctx) return
  ctx.scale(surface.width / width, surface.height / depth)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#cfeef6'
  ctx.font = 'bold .21px monospace'
  // Draw in cell units. The front and left edges remain attached to their axes as the camera turns.
  for (let x = 0; x < columns; x++) ctx.fillText(String(x), 1.03 + x, depth - 0.25)
  for (let y = 0; y < rows; y++) ctx.fillText(String(y), 0.25, 1.03 + y)
  ctx.fillStyle = '#71f7d6'
  ctx.font = 'bold .25px monospace'
  ctx.fillText('X+', width - 0.63, depth - 0.25)
  ctx.fillText('Y+', 0.25, depth - 0.63)
  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function shadowTexture(deck: boolean) {
  const surface = document.createElement('canvas')
  surface.width = surface.height = 192
  const ctx = surface.getContext('2d')
  if (ctx) {
    if (deck) {
      ctx.filter = 'blur(9px)'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(22, 22, 148, 148)
    } else {
      const fade = ctx.createRadialGradient(96, 96, 0, 96, 96, 94)
      fade.addColorStop(0, 'white')
      fade.addColorStop(0.40, 'rgba(255,255,255,.94)')
      fade.addColorStop(0.75, 'rgba(255,255,255,.38)')
      fade.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = fade
      ctx.fillRect(0, 0, 192, 192)
    }
  }
  return new THREE.CanvasTexture(surface)
}

export function createStationRenderer(canvas: HTMLCanvasElement, initial: StationFrame, callbacks: RendererCallbacks) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  gl.setClearColor(0, 0)
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.toneMappingExposure = 1.12
  gl.shadowMap.type = THREE.PCFSoftShadowMap
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200)
  let cameraMode: StationCamera = 'overview'
  const backdrop = new THREE.Color(0x294254)
  scene.background = backdrop
  scene.fog = new THREE.FogExp2(backdrop, 0.018)
  scene.add(new THREE.HemisphereLight(0xe2f7ff, 0x697b9f, 1.7))
  const keyLight = new THREE.DirectionalLight(0xffefcb, 2.65)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.normalBias = 0.018
  keyLight.shadow.bias = -0.00035
  const rimLight = new THREE.DirectionalLight(0x83d9ff, 1.45)
  rimLight.position.set(4, 3, -6)
  scene.add(keyLight, keyLight.target, rimLight)

  const models = createStationModels()
  const box = new THREE.BoxGeometry()
  const bevel = new RoundedBoxGeometry(1, 1, 1, 1, 0.09)
  const plate = new THREE.MeshStandardMaterial({ roughness: 0.69, metalness: 0.18 })
  const light = new THREE.MeshBasicMaterial({ toneMapped: false })
  const terrain = new THREE.Group()
  const actors = new THREE.Group()
  const marks = new THREE.Group()
  const labelPlane = new THREE.PlaneGeometry(1, 1)
  const labelMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })
  const labels = new THREE.Mesh(labelPlane, labelMaterial)
  labels.rotation.x = -Math.PI / 2
  const deckShadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture(true), color: 0x030914, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false,
  })
  const deckShadow = new THREE.Mesh(labelPlane, deckShadowMaterial)
  deckShadow.rotation.x = -Math.PI / 2
  deckShadow.renderOrder = -2
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture(false), color: 0x06131b, transparent: true, opacity: 0.73, depthWrite: false, toneMapped: false,
  })
  const contactTransform = new THREE.Object3D()
  contactTransform.rotation.x = -Math.PI / 2
  let contacts: THREE.InstancedMesh | undefined
  const selection = new THREE.Group()
  const selectionMaterial = new THREE.MeshBasicMaterial({ color: 0xc7fff3, toneMapped: false })
  const markerMaterials = new Map<number, THREE.MeshBasicMaterial>()
  const shockwave = new THREE.RingGeometry(0.66, 1, 36)
  shockwave.rotateX(-Math.PI / 2)
  const pulses: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; start: number; playerToken?: object }[] = []
  const entities = new Map<string, Entity>()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reducedMotion = media.matches
  let frame = initial
  let actionToken: object | undefined
  let actionStarted = 0
  let openingLid: THREE.Object3D | undefined
  let signals: ReturnType<typeof createRobotSignals> | undefined
  let terrainKey = ''
  let environment: ReturnType<typeof createWorkshopSet> | undefined
  let environmentKey = ''
  let marksKey = ''
  let hazardKey = ''
  let hazardMesh: THREE.InstancedMesh | undefined
  let previousTrail: StationFrame['trailEdges']
  let trailMesh: THREE.InstancedMesh | undefined
  let request = 0
  let disposed = false
  let visible = true
  let exit: THREE.Group | undefined
  let selected: Position | undefined
  let yaw = defaultYaw
  let pitch = defaultPitch
  let magnification = 1
  let viewportWidth = 1
  let viewportHeight = 1
  let drag: { id: number; x: number; y: number; yaw: number; pitch: number; moved: boolean } | undefined
  scene.add(deckShadow, terrain, labels, actors, selection, marks)

  function outline(group: THREE.Group, material: THREE.Material, extent: number) {
    const half = extent / 2
    for (const sign of [-1, 1]) {
      const alongX = new THREE.Mesh(box, material)
      alongX.scale.set(extent, 0.025, 0.043)
      alongX.position.z = sign * half
      const alongZ = new THREE.Mesh(box, material)
      alongZ.scale.set(0.043, 0.025, extent)
      alongZ.position.x = sign * half
      group.add(alongX, alongZ)
    }
  }
  outline(selection, selectionMaterial, 0.91)
  selection.visible = false

  function cameraFit() {
    const columns = frame.tiles[0].length
    const rows = frame.tiles.length
    camera.aspect = viewportWidth / viewportHeight
    let cx = (columns - 1) / 2, cz = (rows - 1) / 2, height = 0.34
    let distance: number
    if (cameraMode === 'follow') {
      const player = entities.get('bot:player')?.object.position
      cx = player?.x ?? frame.playerPosition.x
      cz = player?.z ?? frame.playerPosition.y
      height = 0.57
      distance = 4.85 / (Math.min(camera.aspect, 1) * magnification)
    } else {
      // Fit each corner in perspective, including its depth relative to the lens.
      // This keeps the nearest edge visible for long, narrow imported maps as well.
      const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const spanX = (columns + 2.0) / 2, spanZ = (rows + 2.0) / 2
      let fit = 0
      for (const x of [-spanX, spanX]) for (const z of [-spanZ, spanZ]) for (const y of [-1, 1.35]) {
        const front = x * Math.sin(yaw) + z * Math.cos(yaw)
        const near = front * Math.cos(pitch) + y * Math.sin(pitch)
        const side = x * Math.cos(yaw) - z * Math.sin(yaw)
        const up = y * Math.cos(pitch) - front * Math.sin(pitch)
        fit = Math.max(fit, near + Math.abs(side) / (halfFov * camera.aspect), near + Math.abs(up) / halfFov)
      }
      distance = fit * 1.025 / magnification
    }
    camera.position.set(cx + distance * Math.sin(yaw) * Math.cos(pitch),
      height + distance * Math.sin(pitch), cz + distance * Math.cos(yaw) * Math.cos(pitch))
    camera.lookAt(cx, height, cz)
    camera.far = Math.max(100, distance + 3 * Math.max(columns, rows))
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    environment?.updateView(camera)
  }

  function resetCamera() {
    yaw = cameraMode === 'follow' ? 0.40 : defaultYaw
    pitch = cameraMode === 'follow' ? 0.55 : defaultPitch
    magnification = 1
    cameraFit()
    redraw()
  }

  function releaseTerrain() {
    for (const child of terrain.children) {
      if (child instanceof THREE.InstancedMesh) child.dispose()
    }
    terrain.clear()
  }

  function buildTerrain() {
    releaseTerrain()
    const columns = frame.tiles[0].length
    const rows = frame.tiles.length
    const cx = (columns - 1) / 2, cz = (rows - 1) / 2
    const gates = new Set((frame.gates ?? []).map(positionKey))
    const batches = { panels: [] as Block[], trim: [] as Block[], lamps: [] as Block[] }
    function part(batch: keyof typeof batches, x: number, y: number, z: number,
      width: number, height: number, depth: number, tint: number, cell?: Position) {
      batches[batch].push({ x, y, z, width, height, depth, color: tint, cell })
    }
    // Three layers of the chassis leave a continuous illuminated seam around the deck.
    part('panels', cx, -0.52, cz, columns + 0.79, 0.39, rows + 0.79, 0x203649)
    part('trim', cx, -0.34, cz, columns + 0.87, 0.09, rows + 0.87, 0x368b95)
    part('trim', cx, -0.20, cz, columns + 1.06, 0.24, rows + 1.06, 0x3b5867)
    for (const z of [-1.044, rows + 0.044]) part('lamps', cx, -0.28, z, columns + 0.22, 0.034, 0.026, 0x63d9e7)
    for (const x of [-1.044, columns + 0.044]) part('lamps', x, -0.28, cz, 0.026, 0.034, rows + 0.22, 0x63d9e7)
    for (const x of [-0.79, columns - 0.21]) for (const z of [-0.79, rows - 0.21]) {
      part('panels', x, -0.32, z, 0.42, 0.65, 0.42, 0x526773)
      part('lamps', x, 0.015, z, 0.19, 0.025, 0.12, 0x88fff4)
    }
    for (let x = 0; x < columns; x++) {
      for (const z of [-1.035, rows + 0.035]) {
        part('trim', x, -0.2, z, 0.65, 0.09, 0.026, 0x152e3e)
        part('lamps', x - 0.15, -0.20, z, 0.2, 0.026, 0.031, x % 4 === 0 ? 0xffc675 : 0x76e3ec)
      }
    }
    for (let z = 0; z < rows; z++) {
      for (const x of [-1.035, columns + 0.035]) {
        part('trim', x, -0.20, z, 0.026, 0.09, 0.65, 0x152e3e)
        part('lamps', x, -0.20, z - 0.15, 0.031, 0.026, 0.2, 0x76e3ec)
      }
    }
    frame.tiles.forEach((row, y) => [...row].forEach((tile, x) => {
      const cell = { x, y }
      const seed = x * 7 + y * 13
      const wall = tile === '#'
      const gate = gates.has(positionKey(cell))
      const interior = x > 0 && y > 0 && x < columns - 1 && y < rows - 1
      part('panels', x, -0.05, y, 0.977, 0.10, 0.977, wall ? 0x273746 :
        [0x315663, 0x365c68, 0x345865, 0x3b5e69][seed % 4], cell)
      if (wall) {
        const lid = gate ? 0xcd8552 : !interior ? 0x617994 : seed % 2 ? 0x779d9b : 0xb2a079
        part('panels', x, 0.18, y, 0.94, 0.36, 0.94, 0x374c60, cell)
        part('panels', x, 0.38, y, 0.96, 0.16, 0.96, lid, cell)
        if (gate) {
          for (const side of [-1, 1]) {
            part('trim', x, 0.21, y + side * 0.471, 0.83, 0.115, 0.022, 0x734939, cell)
            part('lamps', x, 0.21, y + side * 0.486, 0.52, 0.037, 0.014, 0xffb65f, cell)
          }
        } else if (interior && seed % 2) {
          // A service cabinet with drawer fronts, handles and a recessed top vent.
          for (const h of [0.14, 0.27]) {
            part('trim', x, h, y + 0.466, 0.72, 0.105, 0.033, 0x779995, cell)
            part('trim', x, h + 0.012, y + 0.492, 0.26, 0.023, 0.04, 0x253c49, cell)
          }
          for (const offset of [-0.20, -0.10, 0, 0.10]) {
            part('trim', x - 0.12, wallHeight + 0.006, y + offset, 0.46, 0.012, 0.039, 0x34505b, cell)
          }
        } else if (interior) {
          // Two straps wrap the lids and sides of the parts crates.
          for (const offset of [-0.28, 0.28]) {
            part('trim', x + offset, 0.235, y, 0.075, 0.46, 0.974, 0x516070, cell)
            part('trim', x + offset, 0.25, y + 0.491, 0.108, 0.090, 0.018, 0xc2cfce, cell)
          }
        } else {
          part('trim', x - 0.13, wallHeight + 0.006, y + 0.18, 0.44, 0.012, 0.037, 0x344f68, cell)
          part('trim', x - 0.13, wallHeight + 0.006, y + 0.27, 0.44, 0.012, 0.037, 0x344f68, cell)
        }
        part('lamps', x + 0.29, wallHeight + 0.009, y - 0.28, 0.115, 0.015, 0.054,
          seed % 5 === 0 ? 0xffc275 : 0x87d5df, cell)
      } else {
        part('trim', x - 0.34, 0.004, y - 0.35, 0.13, 0.01, 0.023, 0x7497a4, cell)
        part('trim', x + 0.34, 0.004, y + 0.35, 0.13, 0.01, 0.023, 0x7497a4, cell)
      }
      if (gate) {
        const top = wall ? wallHeight + 0.017 : 0.014
        for (const edge of [-0.39, 0.39]) {
          part('lamps', x + edge, top, y, 0.04, 0.022, 0.78, wall ? 0xffa365 : 0x75f1c4, cell)
        }
      }
    }))
    for (const kind of ['panels', 'trim', 'lamps'] as const) {
      const blocks = batches[kind]
      const mesh = new THREE.InstancedMesh(kind === 'panels' ? bevel : box, kind === 'lamps' ? light : plate, blocks.length)
      mesh.castShadow = kind === 'panels'
      mesh.receiveShadow = kind !== 'lamps'
      mesh.userData.cells = blocks.map(block => block.cell)
      blocks.forEach((block, index) => {
        matrix.makeScale(block.width, block.height, block.depth).setPosition(block.x, block.y, block.z)
        mesh.setMatrixAt(index, matrix)
        mesh.setColorAt(index, color.setHex(block.color))
      })
      mesh.computeBoundingSphere()
      terrain.add(mesh)
    }
    labelMaterial.map?.dispose()
    labelMaterial.map = deckLabels(columns, rows) ?? null
    labelMaterial.needsUpdate = true
    labels.visible = Boolean(labelMaterial.map)
    labels.scale.set(columns + 1.06, rows + 1.06, 1)
    labels.position.set(cx, -0.076, cz)
    deckShadow.scale.set((columns + 1.35) * 1.28, (rows + 1.35) * 1.28, 1)
    deckShadow.position.set(cx + 0.23, -0.89, cz + 0.12)
    cameraFit()
  }

  function cellTop(cell: Position) {
    return frame.tiles[cell.y]?.[cell.x] === '#' ? wallHeight : 0
  }
  function setSelection(cell: Position | undefined) {
    selected = cell && frame.tiles[cell.y]?.[cell.x] !== undefined ? cell : undefined
    selection.visible = Boolean(selected)
    if (selected) selection.position.set(selected.x, cellTop(selected) + 0.035, selected.y)
  }
  function inspectCell(cell: Position | undefined) {
    setSelection(cell)
    callbacks.onInspect(selected)
    redraw()
  }
  function updateMarks() {
    const key = JSON.stringify(frame.cellChanges ?? [])
    if (key === marksKey) return
    marksKey = key
    marks.clear()
    for (const { position, state } of frame.cellChanges ?? []) {
      const tint = { opened: 0x65ffbd, closed: 0xff8c72, blocked: 0xffcf75, relocated: 0x84d5ff }[state]
      let material = markerMaterials.get(tint)
      if (!material) {
        material = new THREE.MeshBasicMaterial({ color: tint, toneMapped: false })
        markerMaterials.set(tint, material)
      }
      const mark = new THREE.Group()
      outline(mark, material, 0.80)
      mark.position.set(position.x, cellTop(position) + 0.025, position.y)
      marks.add(mark)
    }
  }

  function updateHazards() {
    const mirrors = frame.devices?.filter(device => device.kind === 'mirror') ?? []
    const key = JSON.stringify([frame.hazards ?? [], mirrors])
    if (key === hazardKey) return
    hazardKey = key
    if (hazardMesh) {
      actors.remove(hazardMesh)
      hazardMesh.dispose()
      hazardMesh = undefined
    }
    const blocks: Block[] = []
    for (const device of frame.devices ?? []) {
      const emitter = emittingRay(device, frame.hazards)
      if (!emitter) continue
      const delta = gridOffsets[emitter.direction]
      const laser = emitter.kind === 'laser'
      blocks.push({ x: emitter.x + delta.x * .40, y: laser ? .26 : .34, z: emitter.y + delta.y * .40,
        width: delta.x ? .22 : .055, height: .045, depth: delta.y ? .22 : .055, color: laser ? 0xff77bf : 0xffc364, cell: emitter })
    }
    for (const cell of frame.hazards ?? []) {
      if (cell.kind === 'bomb') {
        for (const side of [-1, 1]) {
          blocks.push(
            { x: cell.x + side * .37, y: .046, z: cell.y, width: .07, height: .035, depth: .80, color: 0xff8b55, cell },
            { x: cell.x, y: .046, z: cell.y + side * .37, width: .80, height: .035, depth: .07, color: 0xff8b55, cell },
          )
        }
      } else {
        const laser = cell.kind === 'laser'
        for (const arm of rayArms(cell, mirrors.find(mirror => sameCell(mirror, cell)))) {
          const delta = gridOffsets[arm]
          const length = laser ? .51 : .34
          blocks.push({ x: cell.x + delta.x * .25, y: laser ? .26 : .34, z: cell.y + delta.y * .25,
            width: delta.x ? length : .055, height: .045, depth: delta.y ? length : .055, color: laser ? 0xff77bf : 0xffc364, cell })
        }
      }
    }
    if (!blocks.length) return
    const mesh = new THREE.InstancedMesh(box, light, blocks.length)
    mesh.userData.cells = blocks.map(block => block.cell)
    blocks.forEach((block, index) => {
      matrix.makeScale(block.width, block.height, block.depth).setPosition(block.x, block.y, block.z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.setHex(block.color))
    })
    mesh.computeBoundingSphere()
    actors.add(mesh)
    hazardMesh = mesh
  }

  function updateTrail() {
    const edges = frame.trailEdges
    if (edges === previousTrail) return
    previousTrail = edges
    if (!edges?.length) {
      if (trailMesh) trailMesh.count = 0
      return
    }
    const required = edges.length * 4
    if (!trailMesh || trailMesh.instanceMatrix.count < required) {
      const capacity = Math.max(required, (trailMesh?.instanceMatrix.count ?? 8) * 2)
      if (trailMesh) {
        scene.remove(trailMesh)
        trailMesh.dispose()
      }
      trailMesh = new THREE.InstancedMesh(box, light, capacity)
      trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      trailMesh.frustumCulled = false
      // Floor markings are visual only. Picking still reaches the tile or its contents.
      scene.add(trailMesh)
    }
    let count = 0
    for (const { from, to, recent } of edges) {
      const dx = to.x - from.x, dz = to.y - from.y
      const pieces = recent ? 1 : 4
      const length = recent ? 1.01 : .17
      const width = recent ? .13 : .075
      color.setHex(recent ? 0x67f196 : 0xa6b0b9)
      for (let part = 0; part < pieces; part++) {
        const offset = (part + .5) / pieces
        matrix.makeScale(dx ? length : width, .008, dz ? length : width)
          .setPosition(from.x + dx * offset, recent ? .022 : .017, from.y + dz * offset)
        trailMesh.setMatrixAt(count, matrix)
        trailMesh.setColorAt(count++, color)
      }
    }
    trailMesh.count = count
    trailMesh.instanceMatrix.needsUpdate = true
    if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true
  }

  function update(next: StationFrame) {
    if (disposed) return
    frame = next
    const columns = next.tiles[0].length, rows = next.tiles.length
    const location = next.location ?? 'workshop'
    const setKey = location + ':' + columns + 'x' + rows
    if (setKey !== environmentKey) {
      if (environment) { scene.remove(environment.group); environment.dispose() }
      environment = createWorkshopSet({ kind: 'field', variant: location, columns, rows })
      scene.add(environment.group)
      environmentKey = setKey
      const cx = (columns - 1) / 2, cz = (rows - 1) / 2
      const radius = Math.hypot(columns, rows) / 2 + 4
      gl.shadowMap.enabled = Math.max(columns, rows) <= 32
      keyLight.position.set(cx - radius * 0.75, radius * 1.65, cz + radius)
      keyLight.target.position.set(cx, 0, cz)
      Object.assign(keyLight.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, far: radius * 4 })
      keyLight.shadow.camera.updateProjectionMatrix()
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.11 / Math.max(9, rows, columns)
    }
    const tilesKey = next.tiles.join('|') + ':' + (next.gates ?? []).map(positionKey).join(';')
    if (tilesKey !== terrainKey) {
      terrainKey = tilesKey
      buildTerrain()
      marksKey = ''
      if (selected && frame.tiles[selected.y]?.[selected.x] === undefined) inspectCell(undefined)
      else setSelection(selected)
    }
    updateMarks()
    updateHazards()
    updateTrail()
    const now = performance.now()
    const newAction = next.activity?.token !== actionToken
    if (newAction) {
      if (openingLid) {
        openingLid.rotation.x = -1.35
        openingLid = undefined
      }
      actionToken = next.activity?.token
      actionStarted = now
      for (let i = pulses.length - 1; i >= 0; i--) {
        if (pulses[i].playerToken) removePulse(i)
      }
      if (next.activity?.pickupKind && !next.activity.failed) canvas.dataset.robotPickup = next.activity.pickupKind
      else delete canvas.dataset.robotPickup
      if (next.activity) canvas.dataset.robotAction = next.activity.failed ? 'failed' : next.activity.action
      else {
        delete canvas.dataset.robotAction
        delete canvas.dataset.robotMotion
      }
    }
    const seen = new Set<string>()
    function place(id: string, cell: Position, offsetX: number, offsetZ: number, scale: number,
      signature: string, model: () => THREE.Group) {
      seen.add(id)
      let entry = entities.get(id)
      if (entry && entry.signature !== signature) {
        actors.remove(entry.object)
        entities.delete(id)
        entry = undefined
      }
      const target = new THREE.Vector3(cell.x + offsetX, 0.012, cell.y + offsetZ)
      if (!entry) {
        const object = model()
        object.position.copy(target)
        entry = { object, cell, from: target.clone(), to: target, started: 0, fromYaw: 0, toYaw: 0, activeAt: now, signature }
        actors.add(object)
        entities.set(id, entry)
      } else if (!entry.to.equals(target)) {
        entry.from.copy(entry.object.position)
        entry.to.copy(target)
        entry.started = reducedMotion ? 0 : now
        entry.activeAt = now
        entry.workingAt = undefined
        if (id.startsWith('bot:') && !sameCell(entry.cell, cell)) {
          entry.fromYaw = entry.object.rotation.y
          const facing = Math.atan2(cell.x - entry.cell.x, cell.y - entry.cell.y)
          entry.toYaw = entry.fromYaw + Math.atan2(Math.sin(facing - entry.fromYaw), Math.cos(facing - entry.fromYaw))
        }
      }
      entry.object.userData.cell = cell
      entry.object.scale.setScalar(scale)
      entry.cell = cell
    }
    const bots = [{ cell: next.playerPosition, key: 'bot:player', label: undefined, index: undefined, enemy: false },
      ...next.opponents.map((bot, i) => ({ cell: bot, key: 'bot:rival:' + (bot.id ?? i), label: bot.label, index: bot.index ?? i, enemy: true }))]
    const occupied = new Map<string, typeof bots>()
    for (const bot of bots) {
      const key = positionKey(bot.cell)
      const group = occupied.get(key)
      if (group) group.push(bot)
      else occupied.set(key, [bot])
    }
    for (const group of occupied.values()) group.forEach((bot, i) => {
      const angle = 2 * Math.PI * i / group.length
      const radius = group.length > 1 ? 0.28 : 0
      place(bot.key, bot.cell, radius * Math.cos(angle), radius * Math.sin(angle),
        group.length > 1 ? Math.min(0.68, 1.45 / Math.sqrt(group.length)) : 1,
        bot.label ?? '', () => models.robot(bot.enemy, bot.index, bot.label))
    })
    for (const item of next.items) {
      const shared = occupied.has(positionKey(item))
      place('item:' + item.id, item, shared ? -0.29 : 0, shared ? 0.27 : 0, shared ? 0.65 : 1, '', () => models.battery())
    }
    for (const device of next.devices ?? []) {
      const signature = JSON.stringify(device)
      place('device:' + device.id, device, 0, 0, 1, signature, () => models.device(device))
      if (newAction && next.activity?.pickupKind === 'chest' && !next.activity.failed && next.activity.value === device.id) {
        openingLid = entities.get('device:' + device.id)?.object.getObjectByName('chest-lid')
      }
    }
    for (const [id, entry] of entities) if (!seen.has(id)) {
      actors.remove(entry.object)
      entities.delete(id)
      if (!reducedMotion && id.startsWith('item:')) {
        const nearby = occupied.get(positionKey(entry.cell))
        const playerAction = sameCell(next.playerPosition, entry.cell) ? next.activity : undefined
        if (playerAction && (playerAction.failed || playerAction.action !== 'pick') && nearby?.length === 1) continue
        // If several robots share the cell, the score panel identifies the picker.
        if (nearby?.length === 1) {
          const picker = entities.get(nearby[0].key)
          if (picker && !(nearby[0].key === 'bot:player' && next.activity)) {
            picker.workingAt = now
            picker.activeAt = now
          }
        }
        const mesh = new THREE.Mesh(shockwave, new THREE.MeshBasicMaterial({
          color: 0xffdb79, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
        }))
        mesh.position.set(entry.cell.x, 0.055, entry.cell.y)
        scene.add(mesh)
        pulses.push({ mesh, start: now, playerToken: playerAction?.action === 'pick' && !playerAction.failed ? playerAction.token : undefined })
      }
    }
    if (newAction) {
      const player = entities.get('bot:player')
      if (player) {
        player.activeAt = now
        player.workingAt = undefined
        // Seeking to a non-movement command puts the pose on its recorded cell immediately.
        if (next.activity?.action !== 'move' || next.activity?.failed) player.started = 0
      }
    }
    if (!contacts || contacts.instanceMatrix.count < entities.size) {
      if (contacts) { scene.remove(contacts); contacts.dispose() }
      contacts = new THREE.InstancedMesh(labelPlane, contactMaterial, Math.max(1, entities.size))
      contacts.frustumCulled = false
      contacts.renderOrder = -1
      contacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      scene.add(contacts)
    }
    contacts.count = entities.size
    if (next.exit) {
      if (!exit) { exit = models.exit(); actors.add(exit) }
      exit.visible = true
      exit.position.set(next.exit.x, 0.013, next.exit.y)
      exit.userData.cell = next.exit
    } else if (exit) exit.visible = false
    redraw()
  }

  function draw(now: number) {
    request = 0
    if (disposed || !visible) return
    let moving = false
    if (openingLid) {
      const fraction = reducedMotion ? 1 : THREE.MathUtils.clamp((now - actionStarted) / 420, 0, 1)
      openingLid.rotation.x = -1.35 * fraction * (2 - fraction)
      if (fraction < 1) moving = true
      else openingLid = undefined
    }
    let contactIndex = 0
    if (signals) signals.group.visible = false
    for (const [id, entry] of entities) {
      const robot = id.startsWith('bot:')
      const step = !reducedMotion && entry.started ? THREE.MathUtils.clamp((now - entry.started) / moveDuration, 0, 1) : 1
      if (step < 1) {
        entry.object.position.lerpVectors(entry.from, entry.to, step * step * (3 - 2 * step))
        entry.object.position.y += Math.sin(step * Math.PI) * (robot ? .024 : .07)
        moving = true
      } else {
        entry.object.position.copy(entry.to)
        entry.started = 0
      }
      if (robot) {
        entry.object.rotation.y = THREE.MathUtils.lerp(entry.fromYaw, entry.toYaw, Math.min(1, step * 2.3))
        const workSeconds = entry.workingAt === undefined ? Infinity : Math.max(0, now - entry.workingAt) / 1000
        const idleSeconds = reducedMotion ? 0 : Math.min(1.2, Math.max(0, now - entry.activeAt) / 1000)
        const action = id === 'bot:player' ? frame.activity : undefined
        const gesture = action?.failed ? 'failed' : action?.pickupKind === 'chest' ? 'open-chest'
          : action?.pickupKind === 'key' && step >= 1 ? 'collect-key' : action && action.action !== 'move' ? action.action : undefined
        const progress = Math.max(0, (now - actionStarted) / gestureDuration)
        if (action) {
          const animating = gesture ? progress < 1 : step < 1
          const motion = reducedMotion ? 'still' : animating ? 'playing' : 'done'
          if (canvas.dataset.robotMotion !== motion) canvas.dataset.robotMotion = motion
        }
        if (gesture && (reducedMotion || progress < 1)) {
          const moment = reducedMotion ? .47 : progress
          models.gesture(entry.object, gesture, moment, action?.flow?.condition)
          signals ??= createRobotSignals()
          if (signals.group.parent !== entry.object) entry.object.add(signals.group)
          signals.show(gesture, moment, action?.flow?.condition)
          if (!reducedMotion) moving = true
        } else if (step < 1) models.pose(entry.object, 'walk', step * .5)
        else if (!action && !reducedMotion && workSeconds < Math.PI / 5) {
          models.pose(entry.object, 'work', workSeconds)
          moving = true
        } else {
          models.pose(entry.object, 'idle', idleSeconds)
          if (!reducedMotion && idleSeconds < 1.2) moving = true
        }
      }
      const radius = entry.object.scale.x * (id.startsWith('item:') ? 0.71 : 0.98)
      contactTransform.position.set(entry.object.position.x + 0.067, 0.016, entry.object.position.z - 0.045)
      contactTransform.scale.set(radius, radius * 0.85, 1)
      contactTransform.updateMatrix()
      contacts?.setMatrixAt(contactIndex++, contactTransform.matrix)
    }
    if (contacts) contacts.instanceMatrix.needsUpdate = true
    for (let i = pulses.length - 1; i >= 0; i--) {
      const { mesh, start } = pulses[i]
      const life = reducedMotion ? 1 : Math.max(0, now - start) / effectDuration
      if (life < 1) {
        mesh.scale.setScalar(0.10 + life * 0.48)
        mesh.material.opacity = 1 - life
        moving = true
      } else removePulse(i)
    }
    if (cameraMode === 'follow') cameraFit()
    try {
      gl.render(scene, camera)
    } catch {
      dispose()
      callbacks.onFailure()
      return
    }
    if (moving) redraw()
  }
  function redraw() {
    if (!request && !disposed && visible) request = requestAnimationFrame(draw)
  }
  function removePulse(index: number) {
    const { mesh } = pulses[index]
    scene.remove(mesh)
    mesh.material.dispose()
    pulses.splice(index, 1)
  }
  function resize() {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight)
    if (width !== viewportWidth || height !== viewportHeight) {
      viewportWidth = width
      viewportHeight = height
      gl.setSize(width, height, false)
      cameraFit()
    }
    redraw()
  }
  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
    scene.updateMatrixWorld()
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects([terrain, actors], true)
    for (const hit of hits) {
      if (hit.instanceId !== undefined) {
        const cell = hit.object.userData.cells?.[hit.instanceId] as Position | undefined
        if (cell) return inspectCell(cell)
        return inspectCell(undefined)
      }
      let object: THREE.Object3D | null = hit.object
      while (object && object !== actors) {
        if (object.visible && object.userData.cell) return inspectCell(object.userData.cell)
        object = object.parent
      }
    }
    inspectCell(undefined)
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || drag) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false }
    canvas.setPointerCapture(event.pointerId)
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    yaw = drag.yaw - dx * 0.009
    pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.007, 0.49, 1.38)
    cameraFit()
    redraw()
  }
  function pointerUp(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return
    const clicked = !drag.moved
    drag = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (clicked) pick(event)
  }
  function cancelDrag(event: PointerEvent) {
    if (drag?.id === event.pointerId) drag = undefined
  }
  function motionChanged() { reducedMotion = media.matches; redraw() }
  function lost(event: Event) {
    event.preventDefault()
    if (!disposed) { dispose(); callbacks.onFailure() }
  }
  const size = new ResizeObserver(resize)
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) redraw()
  })
  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(request)
    size.disconnect()
    visibility.disconnect()
    media.removeEventListener('change', motionChanged)
    canvas.removeEventListener('webglcontextlost', lost)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('pointermove', pointerMove)
    canvas.removeEventListener('pointerup', pointerUp)
    canvas.removeEventListener('pointercancel', cancelDrag)
    canvas.removeEventListener('lostpointercapture', cancelDrag)
    releaseTerrain()
    environment?.dispose()
    keyLight.shadow.dispose()
    for (const { mesh } of pulses) mesh.material.dispose()
    for (const material of markerMaterials.values()) material.dispose()
    signals?.dispose()
    delete canvas.dataset.robotAction
    delete canvas.dataset.robotPickup
    delete canvas.dataset.robotMotion
    models.dispose()
    contacts?.dispose()
    hazardMesh?.dispose()
    trailMesh?.dispose()
    deckShadowMaterial.map?.dispose()
    deckShadowMaterial.dispose()
    contactMaterial.map?.dispose()
    contactMaterial.dispose()
    labelMaterial.map?.dispose()
    for (const resource of [box, bevel, plate, light, shockwave, selectionMaterial, labelPlane, labelMaterial]) resource.dispose()
    scene.clear()
    gl.dispose()
    if (!gl.getContext().isContextLost()) gl.forceContextLoss()
  }
  try {
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', cancelDrag)
    canvas.addEventListener('lostpointercapture', cancelDrag)
    media.addEventListener('change', motionChanged)
    size.observe(canvas)
    visibility.observe(canvas)
    resize()
    update(initial)
  } catch (error) {
    dispose()
    throw error
  }
  return {
    update,
    inspectCell,
    zoom(factor: number) { magnification = THREE.MathUtils.clamp(magnification * factor, 0.65, 2.5); cameraFit(); redraw() },
    rotate(radians: number) { yaw += radians; cameraFit(); redraw() },
    setCamera(mode: StationCamera) { cameraMode = mode; resetCamera() },
    resetCamera,
    dispose,
  }
}

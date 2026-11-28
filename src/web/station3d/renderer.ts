import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Direction, Position } from '../../shared/types'
import { gridOffsets } from '../../shared/gridDevices'
import { emittingRay, rayArms } from '../gridDeviceDisplay'
import { createStationModels } from './models'
import { createRobotSignals } from './robotActivity'
import { makeCargoArrival } from './cargoArrival'
import { createArenaPulses } from './arenaPulses'
import { arenaTravel, fadeDisabledRobot, poseArenaRobot } from './arenaRobotMotion'
import { arenaElapsed } from '../arenaTurnMotion'
import { createBoardScenery, type BoardSceneryProp } from './boardScenery'
import { createWorkshopSet } from './workshop'
import { visibleMapFloor } from './mapFootprint'
import { cargoArrivalDuration, type StationCamera, type StationFrame, type WarehouseArrival } from './types'

type RendererCallbacks = {
  onInspect: (cell: Position | undefined) => void
  onFailure: () => void
  onMapFootprint?: (points: Position[]) => void
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
  travelMs: number
  wreck?: { actorId: string; scale: number }
  fade?: ReturnType<typeof fadeDisabledRobot>
  fromYaw: number
  toYaw: number
  activeAt: number
  workingAt?: number
  parked?: boolean
  pushing?: boolean
  signature: string
}
const defaultYaw = 0.48
const defaultPitch = 0.80
const wallHeight = 0.46
const moveDuration = 210
const effectDuration = 460
const gestureDuration = 775
const touchDuration = 760
type TouchKind = 'robot' | 'crate' | 'item'
type SceneHit = { prop: BoardSceneryProp } | { cell: Position; object?: THREE.Object3D } | undefined
type BoardRobot = { key: string; cell: Position; label?: string; index?: number; enemy: boolean }
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
  let volley: ReturnType<typeof createArenaPulses> | undefined
  let arenaMotion: StationFrame['arenaMotion']
  let deliverySeal: ReturnType<typeof makeCargoArrival> | undefined
  let delivering: WarehouseArrival | undefined
  let deliveryTimer: number | undefined
  let terrainKey = ''
  let environment: ReturnType<typeof createWorkshopSet> | undefined
  let scenery: ReturnType<typeof createBoardScenery> | undefined
  let sceneryBounds: THREE.Box3[] = []
  let sceneryInView = false
  let scenerySeconds = 0
  let lastSceneryDraw: number | undefined
  let touch: { object: THREE.Object3D; kind: TouchKind; at: number } | undefined
  let touchTimer: number | undefined
  let environmentKey = ''
  let marksKey = ''
  let hazardKey = ''
  let hazardMesh: THREE.InstancedMesh | undefined
  let previousTrail: StationFrame['trailEdges']
  let trailMesh: THREE.InstancedMesh | undefined
  let request = 0
  let idleFrame = false
  let idleTimer: number | undefined
  let hoverTimer: number | undefined
  let hoverPoint: { x: number; y: number } | undefined
  let disposed = false
  let visible = true
  let exit: THREE.Group | undefined
  let selected: Position | undefined
  const overviewYaw = () => frame.warehouse ? .13 : defaultYaw
  let yaw = overviewYaw()
  let pitch = defaultPitch
  let magnification = 1
  let mapNavigation = false
  // A jump from follow mode keeps its close lens while detaching the camera from Sprout.
  let pinnedLens: StationCamera | undefined
  const mapFrustum = new THREE.Frustum()
  const projectionView = new THREE.Matrix4()
  const lastProjectionView = new THREE.Matrix4()
  let lastFootprint: Position[] | undefined
  let inlineCamera: { mode: StationCamera; yaw: number; pitch: number; magnification: number } | undefined
  let offsetX = 0, offsetZ = 0
  let focusX = 0, focusZ = 0, unitsPerPixel = 1
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

  function reportFootprint(columns: number, rows: number) {
    if (!mapNavigation || !callbacks.onMapFootprint) return
    const previous = lastFootprint
    if (previous && projectionView.equals(lastProjectionView)) return
    lastProjectionView.copy(projectionView)
    const points = visibleMapFloor(mapFrustum, columns, rows)
    if (previous && points.length === previous.length && points.every((p, i) =>
      Math.abs(p.x - previous[i].x) <= .0001 && Math.abs(p.y - previous[i].y) <= .0001)) return
    lastFootprint = points
    callbacks.onMapFootprint(points)
  }

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
    }
    if ((pinnedLens ?? cameraMode) === 'follow') {
      height = 0.57
      distance = 4.85 / (Math.min(camera.aspect, 1) * magnification)
    } else {
      // Fit each corner in perspective, including its depth relative to the lens.
      // This keeps the nearest edge visible for long, narrow imported maps as well.
      const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const margin = frame.warehouse ? .65 : 2
      const spanX = (columns + margin) / 2, spanZ = (rows + margin) / 2
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
    if (pinnedLens) {
      // Aim at the selected floor tile without changing the camera's height above the floor.
      distance += height / Math.sin(pitch)
      height = 0
    }
    focusX = cx
    focusZ = cz
    if (mapNavigation) {
      cx = THREE.MathUtils.clamp(cx + offsetX, 0, columns - 1)
      cz = THREE.MathUtils.clamp(cz + offsetZ, 0, rows - 1)
      unitsPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / viewportHeight
      canvas.dataset.cameraCenter = cx.toFixed(2) + ',' + cz.toFixed(2)
      canvas.dataset.cameraZoom = String(magnification)
    }
    camera.position.set(cx + distance * Math.sin(yaw) * Math.cos(pitch),
      height + distance * Math.sin(pitch), cz + distance * Math.cos(yaw) * Math.cos(pitch))
    camera.lookAt(cx, height, cz)
    camera.far = Math.max(100, distance + 3 * Math.max(columns, rows))
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    mapFrustum.setFromProjectionMatrix(projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    checkSceneryInView()
    environment?.updateView(camera)
    reportFootprint(columns, rows)
  }
  function checkSceneryInView() {
    sceneryInView = sceneryBounds.some(bounds => mapFrustum.intersectsBox(bounds))
    if (!sceneryInView) lastSceneryDraw = undefined
  }

  function resetCamera() {
    pinnedLens = undefined
    yaw = cameraMode === 'follow' ? 0.40 : overviewYaw()
    pitch = cameraMode === 'follow' ? 0.55 : defaultPitch
    magnification = 1
    offsetX = offsetZ = 0
    cameraFit()
    redraw()
  }

  function swipeDirection(dx: number, dy: number): Direction | undefined {
    // Project the grid axes at Sprout's feet, where the child sees the move.
    const { x, y } = frame.playerPosition
    const project = (column: number, row: number) => new THREE.Vector3(column, 0, row).project(camera)
    const origin = project(x, y)
    if (Math.abs(origin.z) > 1) return
    const alignment = (end: THREE.Vector3) => {
      const horizontal = (end.x - origin.x) * viewportWidth
      const vertical = (origin.y - end.y) * viewportHeight
      return (dx * horizontal + dy * vertical) / Math.hypot(horizontal, vertical)
    }
    const column = alignment(project(x + 1, y)), row = alignment(project(x, y + 1))
    if (!Number.isFinite(column) || !Number.isFinite(row)) return
    if (Math.abs(column) > Math.abs(row)) return column > 0 ? 'right' : 'left'
    return row > 0 ? 'down' : 'up'
  }

  function pan(dx: number, dy: number) {
    if (!mapNavigation) return
    const horizontal = dx * unitsPerPixel
    const vertical = dy * unitsPerPixel / Math.sin(pitch)
    offsetX = THREE.MathUtils.clamp(offsetX + horizontal * Math.cos(yaw) + vertical * Math.sin(yaw), -focusX, frame.tiles[0].length - 1 - focusX)
    offsetZ = THREE.MathUtils.clamp(offsetZ - horizontal * Math.sin(yaw) + vertical * Math.cos(yaw), -focusZ, frame.tiles.length - 1 - focusZ)
    cameraFit()
    redraw()
  }

  function centerMapOn(cell: Position): StationCamera {
    if (!mapNavigation) return cameraMode
    const columns = frame.tiles[0].length, rows = frame.tiles.length
    pinnedLens ??= cameraMode
    cameraMode = 'overview'
    offsetX = THREE.MathUtils.clamp(cell.x, 0, columns - 1) - (columns - 1) / 2
    offsetZ = THREE.MathUtils.clamp(cell.y, 0, rows - 1) - (rows - 1) / 2
    cameraFit()
    redraw()
    return cameraMode
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
    const loadingPads = new Set(frame.warehouse?.targets.map(positionKey))
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
        const lid = gate ? 0xcd8552 : !interior || frame.warehouse ? 0x617994 : seed % 2 ? 0x779d9b : 0xb2a079
        part('panels', x, 0.18, y, 0.94, 0.36, 0.94, 0x374c60, cell)
        part('panels', x, 0.38, y, 0.96, 0.16, 0.96, lid, cell)
        if (gate) {
          for (const side of [-1, 1]) {
            part('trim', x, 0.21, y + side * 0.471, 0.83, 0.115, 0.022, 0x734939, cell)
            part('lamps', x, 0.21, y + side * 0.486, 0.52, 0.037, 0.014, 0xffb65f, cell)
          }
        } else if (interior && !frame.warehouse && seed % 2) {
          // A service cabinet with drawer fronts, handles and a recessed top vent.
          for (const h of [0.14, 0.27]) {
            part('trim', x, h, y + 0.466, 0.72, 0.105, 0.033, 0x779995, cell)
            part('trim', x, h + 0.012, y + 0.492, 0.26, 0.023, 0.04, 0x253c49, cell)
          }
          for (const offset of [-0.20, -0.10, 0, 0.10]) {
            part('trim', x - 0.12, wallHeight + 0.006, y + offset, 0.46, 0.012, 0.039, 0x34505b, cell)
          }
        } else if (interior && !frame.warehouse) {
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
        if (loadingPads.has(positionKey(cell))) {
          part('trim', x, .015, y, .88, .025, .88, 0x246467, cell)
          for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
            part('lamps', x + dx * .29, .04, y + dz * .40, .27, .02, .057, 0x9ef8e3, cell)
            part('lamps', x + dx * .40, .04, y + dz * .29, .057, .02, .27, 0x9ef8e3, cell)
          }
          part('lamps', x, .04, y, .13, .02, .13, 0x9ef8e3, cell)
        }
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
  function clearTouch() {
    window.clearTimeout(touchTimer)
    if (touch && touch.kind !== 'robot') touch.object.rotation.z = 0
    touch = undefined
  }
  function touchObject(object: THREE.Object3D | undefined) {
    const kind: TouchKind | undefined = object?.userData.touchKind
    if (!object || !kind) return
    clearTouch()
    touch = { object, kind, at: performance.now() }
    // The still pose also needs a final draw when reduced motion disables idle frames.
    touchTimer = window.setTimeout(redraw, touchDuration + 10)
    redraw()
  }
  function activateCell(cell: Position) {
    const entity = actors.children.find(object => object.userData.touchKind && sameCell(object.userData.cell, cell))
    touchObject(entity)
    inspectCell(cell)
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
    const stillShots = frame.arenaMotion ? undefined : frame.arenaShots
    const emitters = stillShots?.map(shot => frame.arenaIntegrity?.find(actor => actor.id === shot.actorId))
    const key = JSON.stringify([frame.hazards ?? [], mirrors, stillShots, emitters?.map(actor => actor && [actor.x, actor.y])])
    if (key === hazardKey) return
    hazardKey = key
    if (hazardMesh) {
      actors.remove(hazardMesh)
      hazardMesh.dispose()
      hazardMesh = undefined
    }
    const blocks: Block[] = []
    for (const [index, shot] of (stillShots ?? []).entries()) {
      if (!shot.direction) continue
      const delta = gridOffsets[shot.direction]
      const horizontal = delta.x !== 0
      const tint = shot.actorId === 'player' ? 0x54ffe2 : 0xff78a6
      const source = emitters?.[index]
      if (source) {
        blocks.push({ x: source.x + .42 * delta.x, y: .46, z: source.y + .42 * delta.y,
          width: horizontal ? .32 : .17, height: .14, depth: horizontal ? .17 : .32, color: tint, cell: source })
      }
      for (const cell of shot.path ?? []) {
        blocks.push({ x: cell.x, y: .39, z: cell.y, width: horizontal ? .90 : .16, height: .10,
          depth: horizontal ? .16 : .90, color: tint, cell })
      }
    }
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
    const previous = frame
    frame = next
    const now = performance.now()
    const motion = next.arenaMotion && arenaElapsed(next.arenaMotion, now) < next.arenaMotion.durationMs
      ? next.arenaMotion : undefined
    // Visibility changes rebase the clock of the same volley. Keep its muzzle origins and rigs.
    const newMotion = motion?.events !== arenaMotion?.events
    arenaMotion = motion
    if (newMotion) {
      if (motion && !volley) {
        volley = createArenaPulses()
        scene.add(volley.group)
      }
      volley?.prepare(motion)
    }
    const columns = next.tiles[0].length, rows = next.tiles.length
    const location = next.location ?? 'workshop'
    const setKey = location + ':' + columns + 'x' + rows
    if (setKey !== environmentKey) {
      lastFootprint = undefined
      clearTouch()
      scenery?.dispose()
      scenery = createBoardScenery(columns, rows)
      scene.add(scenery.root)
      if (environment) { scene.remove(environment.group); environment.dispose() }
      environment = createWorkshopSet({ kind: 'field', variant: location, columns, rows })
      scene.add(environment.group)
      sceneryBounds = [...scenery.ambientBounds, ...environment.fieldMotionBounds]
      checkSceneryInView()
      scenerySeconds = 0
      lastSceneryDraw = undefined
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
      + ':' + (next.warehouse?.targets.map(positionKey).join(';') ?? '')
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
    const newAction = next.activity?.token !== actionToken
    if (newAction) {
      clearTouch()
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
        if (touch?.object === entry.object) clearTouch()
        entry.fade?.restore()
        actors.remove(entry.object)
        entities.delete(id)
        entry = undefined
      }
      const target = new THREE.Vector3(cell.x + offsetX, 0.012, cell.y + offsetZ)
      if (!entry) {
        const object = model()
        if (id.startsWith('bot:')) object.userData.touchKind = 'robot'
        else if (id.startsWith('cargo:')) object.userData.touchKind = 'crate'
        else if (id.startsWith('item:')) object.userData.touchKind = 'item'
        object.position.copy(target)
        entry = { object, cell, from: target.clone(), to: target, started: 0, travelMs: moveDuration, fromYaw: 0, toYaw: 0, activeAt: now, signature }
        actors.add(object)
        entities.set(id, entry)
      } else if (!entry.to.equals(target)) {
        if (touch?.object === entry.object) clearTouch()
        entry.from.copy(entry.object.position)
        entry.to.copy(target)
        const animateTravel = location === 'arena' ? motion && (!reducedMotion || id.startsWith('bot:')) : !reducedMotion
        entry.started = animateTravel ? motion?.startedAt ?? now : 0
        entry.travelMs = motion ? Math.max(1, motion.moveMs) : moveDuration
        if (id.startsWith('cargo:') && Math.abs(entry.cell.x - cell.x) + Math.abs(entry.cell.y - cell.y) !== 1) entry.started = 0
        entry.activeAt = now
        entry.workingAt = undefined
        if (id.startsWith('bot:') && !sameCell(entry.cell, cell)) {
          entry.fromYaw = entry.object.rotation.y
          const facing = Math.atan2(cell.x - entry.cell.x, cell.y - entry.cell.y)
          entry.toYaw = entry.fromYaw + Math.atan2(Math.sin(facing - entry.fromYaw), Math.cos(facing - entry.fromYaw))
          if (id === 'bot:player' && next.warehouse) {
            const ahead = { x: 2 * cell.x - entry.cell.x, y: 2 * cell.y - entry.cell.y }
            entry.pushing = previous.warehouse?.boxes.some((box, i) => sameCell(box, cell) && sameCell(next.warehouse?.boxes[i], ahead))
          }
        }
      }
      if (location === 'arena' && !motion) entry.started = 0
      if (entry.fade && (!motion || newMotion)) {
        entry.fade.restore()
        entry.fade = undefined
      }
      entry.object.userData.cell = cell
      entry.object.scale.setScalar(scale)
      entry.cell = cell
      return entry
    }
    const bots: BoardRobot[] = [...(next.playerDown ? [] : [{ cell: next.playerPosition, key: 'bot:player', enemy: false }]),
      ...next.opponents.map((bot, i) => ({ cell: bot, key: 'bot:rival:' + (bot.id ?? i), label: bot.label, index: bot.index ?? i, enemy: true }))]
    if (motion) {
      // The engine already settled damage. Keep newly disabled robots on the board until the pulse arrives.
      motion.to.forEach((actor, index) => {
        if (actor.hp !== 0 || !motion.from.some(before => before.id === actor.id && before.hp !== 0)) return
        const player = actor.id === 'player'
        bots.push({ cell: actor, key: player ? 'bot:player' : 'bot:rival:' + actor.id,
          label: player ? undefined : String(index), index: player ? undefined : index - 1, enemy: !player })
      })
    }
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
      const entry = place(bot.key, bot.cell, radius * Math.cos(angle), radius * Math.sin(angle),
        group.length > 1 ? Math.min(0.68, 1.45 / Math.sqrt(group.length)) : 1,
        bot.label ?? '', () => models.robot(bot.enemy, bot.index, bot.label))
      const actorId = bot.enemy ? bot.key.slice('bot:rival:'.length) : 'player'
      const hull = next.arenaIntegrity?.find(actor => actor.id === actorId)
      models.setRobotDamaged(entry.object, hull?.hp !== undefined && next.arenaMaxHealth !== undefined && hull.hp < next.arenaMaxHealth)
      if (newMotion && motion && !entry.started) {
        const source = motion.from.find(actor => actor.id === actorId)
        if (source && !sameCell(source, bot.cell)) {
          entry.from.set(source.x, entry.to.y, source.y)
          entry.started = motion.startedAt
          entry.travelMs = Math.max(1, motion.moveMs)
        }
      }
    })
    // Wrecks are scenery. An active robot or a pickup can still use the same square.
    const wreckCells = new Map<string, number[]>()
    const roster = next.arenaIntegrity ?? []
    roster.forEach((actor, index) => {
      if (actor.hp !== 0) return
      const cell = positionKey(actor)
      const group = wreckCells.get(cell) ?? []
      group.push(index)
      wreckCells.set(cell, group)
    })
    for (const [cell, indices] of wreckCells) indices.forEach((index, slot) => {
      const actor = roster[index]
      const shared = indices.length > 1 || next.items.some(item => sameCell(item, actor))
        || roster.some(other => other.hp !== 0 && sameCell(other, actor))
      const angle = slot * 2 * Math.PI / indices.length + Math.PI / 4
      const radius = shared ? .31 : 0
      const scale = shared ? .62 : 1
      const entry = place('wreck:' + actor.id, actor, radius * Math.cos(angle), radius * Math.sin(angle), scale,
        String(index), () => models.robotWreck(index !== 0, index ? index - 1 : undefined, index ? String(index) : undefined))
      entry.wreck = { actorId: actor.id, scale }
      entry.object.userData.actorId = actor.id
    })
    for (const event of motion?.events ?? next.arenaShots ?? []) {
      if (!event.direction || !(event.action === 'shoot' || (event.action === 'move' && event.blocked))) continue
      const bot = entities.get(event.actorId === 'player' ? 'bot:player' : 'bot:rival:' + event.actorId)
      if (!bot) continue
      const direction = gridOffsets[event.direction]
      if (!motion || newMotion) {
        const facing = Math.atan2(direction.x, direction.y)
        bot.fromYaw = motion ? bot.object.rotation.y : facing
        bot.toYaw = bot.fromYaw + Math.atan2(Math.sin(facing - bot.fromYaw), Math.cos(facing - bot.fromYaw))
      }
    }
    for (const item of next.items) {
      const shared = occupied.has(positionKey(item))
      if (next.arenaSwitches?.some(control => control.itemId === item.id)) {
        place('item:' + item.id, item, shared ? -.29 : 0, shared ? .27 : 0, shared ? .72 : 1, 'switch',
          () => models.device({ ...item, kind: 'switch', status: 'off' }))
        continue
      }
      const chip = next.arenaBuffs?.find(buff => buff.id === item.id)
      const target = next.arenaTargetIds?.includes(item.id) ?? false
      place('item:' + item.id, item, shared ? -0.29 : 0, shared ? 0.27 : 0, shared ? 0.65 : 1,
        chip?.kind ?? (next.arenaBuffs ? (target ? 'parcel' : 'token') : 'battery'),
        () => chip ? models.chip(chip.kind) : next.arenaBuffs ? models.arenaLoot(target) : models.battery())
    }
    const warehouse = next.warehouse
    warehouse?.boxes.forEach((cell, index) => {
      const entry = place('cargo:' + index, cell, 0, 0, 1, 'cargo', models.cargoCrate)
      entry.parked = warehouse.targets.some(target => sameCell(target, cell))
    })
    const arrival = next.warehouseArrival
    const liveArrival = arrival && now - arrival.id < cargoArrivalDuration && warehouse?.boxes.some(box => sameCell(box, arrival))
      && warehouse.targets.some(pad => sameCell(pad, arrival)) ? arrival : undefined
    if (liveArrival?.id !== delivering?.id) {
      window.clearTimeout(deliveryTimer)
      delivering = liveArrival
      if (liveArrival) {
        if (!deliverySeal) {
          deliverySeal = makeCargoArrival()
          scene.add(deliverySeal.group)
        }
        // A static reduced-motion frame also needs a last redraw when the seal expires.
        deliveryTimer = window.setTimeout(redraw, Math.max(0, liveArrival.id + cargoArrivalDuration - now) + 5)
      } else if (deliverySeal) {
        deliverySeal.group.visible = false
        delete canvas.dataset.cargoArrival
      }
    }
    for (const device of next.devices ?? []) {
      const signature = JSON.stringify(device)
      place('device:' + device.id, device, 0, 0, 1, signature, () => models.device(device))
      if (newAction && next.activity?.pickupKind === 'chest' && !next.activity.failed && next.activity.value === device.id) {
        openingLid = entities.get('device:' + device.id)?.object.getObjectByName('chest-lid')
      }
    }
    for (const [id, entry] of entities) if (!seen.has(id)) {
      if (touch?.object === entry.object) clearTouch()
      entry.fade?.restore()
      actors.remove(entry.object)
      entities.delete(id)
      if (!reducedMotion && (location !== 'arena' || motion) && id.startsWith('item:')) {
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
        if (!motion && (next.activity?.action !== 'move' || next.activity?.failed)) player.started = 0
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
      const ferryDock = Boolean(next.ferryDock)
      if (!exit || exit.userData.ferryDock !== ferryDock) {
        if (exit) actors.remove(exit)
        exit = models.exit(ferryDock)
        exit.userData.ferryDock = ferryDock
        actors.add(exit)
      }
      exit.visible = true
      exit.position.set(next.exit.x, 0.013, next.exit.y)
      exit.userData.cell = next.exit
    } else if (exit) exit.visible = false
    redraw()
  }

  function wristPosition(actorId: string, out: THREE.Vector3) {
    const entry = entities.get(actorId === 'player' ? 'bot:player' : 'bot:rival:' + actorId)
    const muzzle = entry && models.robotRig(entry.object)?.hands[1]
    if (muzzle) muzzle.localToWorld(out.set(0, -.145, .015))
  }

  function draw(now: number) {
    request = 0
    if (disposed || !visible || document.hidden) return
    const ambient = sceneryInView && !reducedMotion
    const elapsed = ambient && lastSceneryDraw !== undefined ? Math.max(0, now - lastSceneryDraw) / 1000 : 0
    lastSceneryDraw = ambient ? now : undefined
    scenerySeconds += elapsed
    environment?.update(scenerySeconds)
    let moving = scenery?.update(now, reducedMotion, elapsed, scenerySeconds) ?? false
    if (idleFrame) {
      // The hangar runs between game turns. Reuse the board pose and its shadow map.
      if (render(false)) scheduleIdle()
      return
    }
    const touchProgress = touch ? Math.max(0, (now - touch.at) / touchDuration) : 1
    if (touch && touchProgress >= 1) clearTouch()
    if (openingLid) {
      const fraction = reducedMotion ? 1 : THREE.MathUtils.clamp((now - actionStarted) / 420, 0, 1)
      openingLid.rotation.x = -1.35 * fraction * (2 - fraction)
      if (fraction < 1) moving = true
      else openingLid = undefined
    }
    let contactIndex = 0
    if (signals) signals.group.visible = false
    const turn = arenaMotion
    const turnTime = turn ? arenaElapsed(turn, now) : 0
    const liveTurn = !!turn && turnTime < turn.durationMs
    if (volley) volley.group.visible = liveTurn
    for (const [id, entry] of entities) {
      const robot = id.startsWith('bot:')
      let shadowScale = 1
      const travelTime = robot && liveTurn ? turnTime : now - entry.started
      const step = entry.started && (!reducedMotion || (robot && liveTurn)) ? THREE.MathUtils.clamp(travelTime / entry.travelMs, 0, 1) : 1
      if (step < 1) {
        const arenaStep = robot && liveTurn
        entry.object.position.lerpVectors(entry.from, entry.to, arenaStep ? arenaTravel(step) : step * step * (3 - 2 * step))
        if (!arenaStep && entry.parked === undefined) entry.object.position.y += Math.sin(step * Math.PI) * (robot ? .024 : .07)
        moving = true
      } else {
        entry.object.position.copy(entry.to)
        entry.started = 0
      }
      if (entry.parked !== undefined) entry.object.userData.parkedBadge.visible = entry.parked && step >= .85
      const tapped = touch?.object === entry.object && step === 1
      if (robot) {
        const actorId = id === 'bot:player' ? 'player' : id.slice('bot:rival:'.length)
        const event = liveTurn ? turn.events.find(action => action.actorId === actorId) : undefined
        const knockedOut = turn?.to.find(actor => actor.id === actorId)?.hp === 0
        if (knockedOut && !liveTurn) {
          if (touch?.object === entry.object) clearTouch()
          entry.fade?.restore()
          actors.remove(entry.object)
          entities.delete(id)
          continue
        }
        entry.object.rotation.x = entry.object.rotation.z = 0
        const turning = liveTurn && (event?.action === 'shoot' || event?.action === 'move')
          ? THREE.MathUtils.smoothstep(turnTime, 0, event.action === 'shoot' ? turn.fireAtMs * .88 : turn.moveMs * .49)
          : Math.min(1, step * 2.3)
        entry.object.rotation.y = THREE.MathUtils.lerp(entry.fromYaw, entry.toYaw, turning)
        const workSeconds = entry.workingAt === undefined ? Infinity : Math.max(0, now - entry.workingAt) / 1000
        const idleSeconds = reducedMotion ? 0 : Math.min(1.2, Math.max(0, now - entry.activeAt) / 1000)
        const action = id === 'bot:player' ? frame.activity : undefined
        const gesture = action?.failed ? 'failed' : action?.pickupKind === 'chest' ? 'open-chest'
          : action?.pickupKind === 'key' && step >= 1 ? 'collect-key' : action && action.action !== 'move' ? action.action : undefined
        const physical = action && ['move', 'shoot', 'guard', 'pick', 'wait'].some(name => name === action.action)
        const progress = frame.location === 'arena' && physical && !liveTurn ? 1 : Math.max(0, (now - actionStarted) / gestureDuration)
        if (action) {
          const animating = gesture ? progress < 1 : step < 1
          const motion = reducedMotion && !liveTurn ? 'still' : animating ? 'playing' : 'done'
          if (canvas.dataset.robotMotion !== motion) canvas.dataset.robotMotion = motion
        }
        if (event?.action === 'shoot' || event?.action === 'move') {
          models.pose(entry.object, 'idle', idleSeconds)
        } else if (event?.action === 'guard' || (event?.action === 'pick' && !action)) {
          const moment = Math.min(1, turnTime / turn!.durationMs)
          models.gesture(entry.object, event.action, moment)
        } else if (gesture && (progress < 1 || (reducedMotion && !tapped))) {
          const moment = reducedMotion ? .47 : progress
          models.gesture(entry.object, gesture, moment, action?.flow?.condition)
          signals ??= createRobotSignals()
          if (signals.group.parent !== entry.object) entry.object.add(signals.group)
          signals.show(gesture, moment, action?.flow?.condition)
          if (!reducedMotion) moving = true
        } else if (step < 1) models.pose(entry.object, entry.pushing ? 'push' : 'walk', step * .5)
        else if (!action && !reducedMotion && workSeconds < Math.PI / 5) {
          models.pose(entry.object, 'work', workSeconds)
          moving = true
        } else if (tapped) {
          models.pose(entry.object, 'wave', reducedMotion ? .3 : touchProgress * 1.2)
          if (!reducedMotion) moving = true
        } else {
          models.pose(entry.object, 'idle', idleSeconds)
          if (!reducedMotion && idleSeconds < 1.2) moving = true
        }
        const rig = liveTurn && models.robotRig(entry.object)
        if (liveTurn && rig) {
          const shutdown = poseArenaRobot(entry.object, rig, turn, turnTime, event, volley?.impacts.get(actorId), volley?.shutdowns.get(actorId))
          if (shutdown > .45) {
            entry.fade ??= fadeDisabledRobot(entry.object)
            entry.fade.draw(shutdown)
            shadowScale = 1 - THREE.MathUtils.smoothstep(shutdown, .45, 1)
          }
        }
      } else if (entry.wreck) {
        const downAt = liveTurn ? volley?.shutdowns.get(entry.wreck.actorId) : undefined
        const reveal = !turn || downAt === undefined ? 1 : THREE.MathUtils.smoothstep((turnTime - downAt) / turn.shutdownMs, .42, .94)
        entry.object.visible = reveal > 0
        if (!entry.object.visible) continue
        entry.object.scale.setScalar(entry.wreck.scale * reveal)
      } else if (tapped) {
        const lift = reducedMotion ? 1 : Math.sin(touchProgress * Math.PI)
        if (touch?.kind === 'item') entry.object.position.y += lift * .18
        entry.object.rotation.z = reducedMotion ? .09 : .16 * Math.sin(touchProgress * Math.PI * 4) * lift
        if (!reducedMotion) moving = true
      }
      const radius = shadowScale * entry.object.scale.x * (id.startsWith('item:') ? 0.71 : 0.98)
      contactTransform.position.set(entry.object.position.x + 0.067, 0.016, entry.object.position.z - 0.045)
      contactTransform.scale.set(radius, radius * 0.85, 1)
      contactTransform.updateMatrix()
      contacts?.setMatrixAt(contactIndex++, contactTransform.matrix)
    }
    if (contacts) {
      contacts.count = contactIndex
      contacts.instanceMatrix.needsUpdate = true
    }
    // The charge stays on the posed hand; tick the volley only after every robot's joints are updated.
    if (liveTurn && volley) {
      const phase = volley.draw(turn, turnTime, wristPosition)
      if (canvas.dataset.arenaMotion !== phase) canvas.dataset.arenaMotion = phase
      moving = true
    } else if (canvas.dataset.arenaMotion !== undefined) delete canvas.dataset.arenaMotion
    if (turn && !liveTurn) {
      arenaMotion = undefined
      volley?.prepare()
    }
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
    if (deliverySeal && delivering) {
      if (deliverySeal.draw(delivering, now, camera.quaternion, reducedMotion)) moving = true
      if (deliverySeal.group.visible) {
        const location = positionKey(delivering)
        if (canvas.dataset.cargoArrival !== location) canvas.dataset.cargoArrival = location
      } else {
        delivering = undefined
        delete canvas.dataset.cargoArrival
      }
    }
    if (!render(true)) return
    if (moving) redraw()
    else scheduleIdle()
  }
  function render(updateShadows: boolean) {
    try {
      gl.shadowMap.autoUpdate = updateShadows
      gl.render(scene, camera)
      return true
    } catch {
      dispose()
      callbacks.onFailure()
      return false
    }
  }
  function scheduleIdle() {
    if (reducedMotion || !sceneryInView) return
    idleTimer = window.setTimeout(() => {
      if (!request && visible && !document.hidden && !disposed) {
        idleFrame = true
        request = requestAnimationFrame(draw)
      }
    }, 80)
  }
  function redraw() {
    idleFrame = false
    window.clearTimeout(idleTimer)
    if (!request && !disposed && visible && !document.hidden) request = requestAnimationFrame(draw)
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
  function hitAt(x: number, y: number, hover = false): SceneHit {
    const rect = canvas.getBoundingClientRect()
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2)
    scene.updateMatrixWorld()
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects([actors, ...(scenery?.hitTargets ?? [])], true)
    // Most of a large map is floor. Only check its instances on hover if a prop is in the ray.
    if (hover && !hits.length) return
    raycaster.intersectObject(terrain, true, hits)
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object
      let cellObject: THREE.Object3D | undefined
      while (node && node.visible) {
        if (node.userData.cell) cellObject = node
        node = node.parent
      }
      if (node) continue
      const prop = scenery?.targetOf(hit.object)
      if (prop) return { prop }
      if (cellObject) return { cell: cellObject.userData.cell, object: cellObject }
      if (hit.instanceId !== undefined) {
        const cell = hit.object.userData.cells?.[hit.instanceId] as Position | undefined
        return cell ? { cell } : undefined
      }
    }
  }
  function pick(event: PointerEvent) {
    const hit = hitAt(event.clientX, event.clientY)
    if (event.pointerType !== 'touch') showHover(hit)
    if (hit && 'prop' in hit) {
      scenery?.activate(hit.prop, performance.now())
      redraw()
    } else {
      touchObject(hit?.object)
      inspectCell(hit?.cell)
    }
  }
  function stopHover() {
    window.clearTimeout(hoverTimer)
    hoverTimer = undefined
    hoverPoint = undefined
    delete canvas.dataset.touchTarget
  }
  function updateHover() {
    hoverTimer = undefined
    if (!hoverPoint || disposed || !visible || document.hidden) return
    showHover(hitAt(hoverPoint.x, hoverPoint.y, true))
  }
  function showHover(hit: SceneHit) {
    const target = hit && ('prop' in hit ? hit.prop : hit.object?.userData.touchKind)
    if (target) canvas.dataset.touchTarget = target
    else delete canvas.dataset.touchTarget
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || drag) return
    stopHover()
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false }
    canvas.setPointerCapture(event.pointerId)
  }
  function pointerMove(event: PointerEvent) {
    if (!drag) {
      if (event.pointerType !== 'touch') {
        hoverPoint = { x: event.clientX, y: event.clientY }
        hoverTimer ??= window.setTimeout(updateHover, 85)
      }
      return
    }
    if (drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    if (mapNavigation) {
      drag.x = event.clientX
      drag.y = event.clientY
      pan(-dx, -dy)
      return
    }
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
  function motionChanged() {
    reducedMotion = media.matches
    lastSceneryDraw = undefined
    update(frame)
  }
  function visibilityChanged() {
    if (visible && !document.hidden) redraw()
    else {
      lastSceneryDraw = undefined
      cancelAnimationFrame(request)
      request = 0
      window.clearTimeout(idleTimer)
      stopHover()
    }
  }
  function lost(event: Event) {
    event.preventDefault()
    if (!disposed) { dispose(); callbacks.onFailure() }
  }
  const size = new ResizeObserver(resize)
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    visibilityChanged()
  })
  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(request)
    window.clearTimeout(idleTimer)
    stopHover()
    clearTouch()
    size.disconnect()
    visibility.disconnect()
    media.removeEventListener('change', motionChanged)
    document.removeEventListener('visibilitychange', visibilityChanged)
    canvas.removeEventListener('webglcontextlost', lost)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('pointermove', pointerMove)
    canvas.removeEventListener('pointerleave', stopHover)
    canvas.removeEventListener('pointerup', pointerUp)
    canvas.removeEventListener('pointercancel', cancelDrag)
    canvas.removeEventListener('lostpointercapture', cancelDrag)
    releaseTerrain()
    environment?.dispose()
    scenery?.dispose()
    keyLight.shadow.dispose()
    for (const { mesh } of pulses) mesh.material.dispose()
    for (const material of markerMaterials.values()) material.dispose()
    signals?.dispose()
    volley?.dispose()
    for (const entry of entities.values()) entry.fade?.restore()
    delete canvas.dataset.arenaMotion
    window.clearTimeout(deliveryTimer)
    deliverySeal?.dispose()
    delete canvas.dataset.cargoArrival
    delete canvas.dataset.robotAction
    delete canvas.dataset.robotPickup
    delete canvas.dataset.robotMotion
    delete canvas.dataset.cameraZoom
    delete canvas.dataset.cameraCenter
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
    canvas.addEventListener('pointerleave', stopHover)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', cancelDrag)
    canvas.addEventListener('lostpointercapture', cancelDrag)
    media.addEventListener('change', motionChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
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
    activateCell,
    swipeDirection,
    zoom(factor: number) { magnification = THREE.MathUtils.clamp(magnification * factor, 0.65, mapNavigation ? 5 : 2.5); cameraFit(); redraw() },
    pan,
    centerMapOn,
    setMapNavigation(active: boolean) {
      if (mapNavigation === active) return cameraMode
      mapNavigation = active
      lastFootprint = undefined
      pinnedLens = undefined
      offsetX = offsetZ = 0
      if (active) {
        inlineCamera = { mode: cameraMode, yaw, pitch, magnification }
        cameraMode = 'overview'
        resetCamera()
      } else if (inlineCamera) {
        cameraMode = inlineCamera.mode
        yaw = inlineCamera.yaw
        pitch = inlineCamera.pitch
        magnification = inlineCamera.magnification
        inlineCamera = undefined
        delete canvas.dataset.cameraZoom
        delete canvas.dataset.cameraCenter
        cameraFit()
        redraw()
      }
      return cameraMode
    },
    rotate(radians: number) { yaw += radians; cameraFit(); redraw() },
    setCamera(mode: StationCamera) { cameraMode = mode; resetCamera() },
    resetCamera,
    dispose,
  }
}

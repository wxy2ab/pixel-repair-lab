import * as THREE from 'three'
import { Kit } from './workshop'
import type { ModelBuilder } from './teaching-model-types'

export function createTeachingRenderer<State>(canvas: HTMLCanvasElement, notes: HTMLDivElement,
  build: ModelBuilder<State>, callbacks: { ready: () => void; failed: () => void }) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7))
  gl.setClearColor(0, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera()
  scene.add(new THREE.HemisphereLight(0xf4faf6, 0x496774, 1.8))
  const key = new THREE.DirectionalLight(0xffe9bf, 2.1)
  key.position.set(-3, 7, 5)
  scene.add(key)
  const materials = {
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .12 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }
  let model: THREE.Group | undefined
  const resources: THREE.BufferGeometry[] = []
  const labels: { element: HTMLSpanElement; point: THREE.Vector3; size: number; onlyIn?: 'angled' }[] = []
  const hits: { id: string; box: THREE.Box3 }[] = []
  const bounds = new THREE.Box3()
  const raycaster = new THREE.Raycaster()
  let overhead = false, disposed = false, visible = false, frame = 0
  let lastWidth = 0, lastHeight = 0

  function draw() {
    frame = 0
    const width = canvas.clientWidth, height = canvas.clientHeight
    if (disposed || !model || !width || !height || bounds.isEmpty()) return
    if (width !== lastWidth || height !== lastHeight) {
      gl.setSize(width, height, false)
      lastWidth = width
      lastHeight = height
    }
    const centre = bounds.getCenter(new THREE.Vector3())
    const span = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1)
    const direction = overhead ? new THREE.Vector3(0, 10, .05) : new THREE.Vector3(3, 4, 7)
    camera.position.copy(direction.normalize().multiplyScalar(span * 2)).add(centre)
    camera.lookAt(centre)
    camera.near = .02
    camera.far = span * 4
    camera.updateMatrixWorld()
    let halfHeight = .35
    const aspect = width / height
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = camera.worldToLocal(new THREE.Vector3(x, y, z))
        halfHeight = Math.max(halfHeight, Math.abs(point.y), Math.abs(point.x) / aspect)
      }
    }
    halfHeight *= 1.12
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.right = halfHeight * aspect
    camera.left = -camera.right
    camera.updateProjectionMatrix()
    try { gl.render(scene, camera) } catch { fail(); return }
    for (const { element, point, size, onlyIn } of labels) {
      element.hidden = overhead && onlyIn === 'angled'
      if (element.hidden) continue
      const screen = point.clone().project(camera)
      element.style.left = (screen.x + 1) * 50 + '%'
      element.style.top = (1 - screen.y) * 50 + '%'
      element.style.fontSize = Math.min(20, Math.max(10, size * height / (halfHeight * 2))) + 'px'
    }
    if (!visible) { visible = true; callbacks.ready() }
  }
  function redraw() { if (!disposed && !frame) frame = requestAnimationFrame(draw) }
  function clearModel() {
    if (model) scene.remove(model)
    model = undefined
    for (const resource of resources.splice(0)) resource.dispose()
    labels.length = 0
    hits.length = 0
    notes.replaceChildren()
  }
  function update(state: State) {
    if (disposed) return
    clearModel()
    try {
      const kit = new Kit()
      const fragment = document.createDocumentFragment()
      build(state, kit, {
        label(text, position, size = .22, onlyIn) {
          const element = document.createElement('span')
          element.textContent = text
          fragment.append(element)
          labels.push({ element, point: new THREE.Vector3(...position), size, onlyIn })
        },
        pick(id, centre, size) {
          hits.push({ id, box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...centre), new THREE.Vector3(...size)) })
        },
      })
      model = kit.finish(materials, resources)
      scene.add(model)
      bounds.setFromObject(model)
      for (const label of labels) bounds.expandByPoint(label.point)
      notes.append(fragment)
      redraw()
    } catch { fail() }
  }
  function pick(clientX: number, clientY: number) {
    if (!visible || disposed || !hits.length) return
    // The pointer must use the same camera and model as the displayed frame.
    if (frame) { cancelAnimationFrame(frame); draw() }
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    raycaster.setFromCamera(new THREE.Vector2(
      (clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2,
    ), camera)
    let nearest = Infinity, selected: string | undefined
    for (const hit of hits) {
      const point = raycaster.ray.intersectBox(hit.box, new THREE.Vector3())
      if (!point) continue
      const distance = point.distanceToSquared(raycaster.ray.origin)
      if (distance < nearest) { nearest = distance; selected = hit.id }
    }
    return selected
  }
  const observer = new ResizeObserver(redraw)
  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    observer.disconnect()
    canvas.removeEventListener('webglcontextlost', fail)
    clearModel()
    for (const material of Object.values(materials)) material.dispose()
    scene.clear()
    gl.dispose()
    if (!gl.getContext().isContextLost()) gl.forceContextLoss()
  }
  function fail(event?: Event) {
    event?.preventDefault()
    if (!disposed) { dispose(); callbacks.failed() }
  }
  canvas.addEventListener('webglcontextlost', fail)
  observer.observe(canvas)
  return { update, pick, dispose, setOverhead(value: boolean) { overhead = value; redraw() } }
}

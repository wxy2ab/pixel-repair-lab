import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

type XYZ = [number, number, number]
type Surface = 'metal' | 'glow'
type WorkshopOptions = { kind: 'lobby' | 'field'; columns?: number; rows?: number; variant?: 'workshop' | 'arena' }

export const workshopStations: Record<'learning' | 'arena', XYZ> = {
  learning: [-2.7, 1.55, 0],
  arena: [2.55, 1.65, -1.45],
}

const ink = '#182e3a'
const steel = '#365964'
const slate = '#547781'
const enamel = '#8fb6b3'
const ivory = '#d3dcca'
const mint = '#71f1d2'
const amber = '#ffbe64'
const ochre = '#c5823f'
const origin: XYZ = [0, 0, 0]

// All architecture is static within its own coordinate system. A whole station section
// needs at most two draws, even when it contains hundreds of individual fasteners.
export class Kit {
  private surfaces: Record<Surface, THREE.BufferGeometry[]> = { metal: [], glow: [] }

  geometry(geo: THREE.BufferGeometry, at: XYZ, tint: string, rotation: XYZ = origin, surface: Surface = 'metal') {
    const mesh = geo.index ? geo.toNonIndexed() : geo
    if (mesh !== geo) geo.dispose()
    mesh.deleteAttribute('uv')
    mesh.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)))
    mesh.translate(...at)
    const count = mesh.getAttribute('position').count
    const rgb = new THREE.Color(tint)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i)
    mesh.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.surfaces[surface].push(mesh)
  }

  box(at: XYZ, size: XYZ, tint: string, rotation: XYZ = origin, surface: Surface = 'metal') {
    this.geometry(new THREE.BoxGeometry(...size), at, tint, rotation, surface)
  }

  casing(at: XYZ, size: XYZ, tint: string, radius: number, rotation: XYZ = origin) {
    this.geometry(new RoundedBoxGeometry(...size, 1, radius), at, tint, rotation)
  }

  sky(at: XYZ, width: number, height: number, zenith: string, horizon: string) {
    const plane = new THREE.PlaneGeometry(width, height).toNonIndexed()
    plane.deleteAttribute('uv')
    const light = new THREE.Color(horizon), dark = new THREE.Color(zenith)
    const vertices = plane.getAttribute('position')
    const colors = new Float32Array(vertices.count * 3)
    for (let i = 0; i < vertices.count; i++) (vertices.getY(i) < 0 ? light : dark).toArray(colors, i * 3)
    plane.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    plane.translate(...at)
    this.surfaces.glow.push(plane)
  }

  cylinder(at: XYZ, top: number, base: number, height: number, tint: string, rotation: XYZ = origin, surface: Surface = 'metal', sides = 16) {
    this.geometry(new THREE.CylinderGeometry(top, base, height, sides), at, tint, rotation, surface)
  }

  rod(from: XYZ, to: XYZ, radius: number, tint: string, surface: Surface = 'metal') {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const delta = b.clone().sub(a)
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 8)
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()))
    this.geometry(geometry, a.lerp(b, .5).toArray(), tint, origin, surface)
  }

  ring(at: XYZ, radius: number, tube: number, tint: string, surface: Surface = 'metal', arc = 2 * Math.PI, start = 0) {
    const geometry = new THREE.TorusGeometry(radius, tube, 5, 48, arc)
    geometry.rotateX(-Math.PI / 2)
    geometry.rotateY(start)
    this.geometry(geometry, at, tint, origin, surface)
  }

  finish(materials: Record<Surface, THREE.Material>, resources: THREE.BufferGeometry[]) {
    const group = new THREE.Group()
    for (const surface of ['metal', 'glow'] as const) {
      const parts = this.surfaces[surface]
      if (!parts.length) continue
      const geometry = mergeGeometries(parts)
      for (const part of parts) part.dispose()
      if (!geometry) throw Error('Could not assemble workshop geometry')
      resources.push(geometry)
      const mesh = new THREE.Mesh(geometry, materials[surface])
      mesh.castShadow = mesh.receiveShadow = surface === 'metal'
      group.add(mesh)
    }
    return group
  }
}

function bench(kit: Kit) {
  // The freestanding diagnostics desk, with a live oscilloscope above the controls.
  for (const x of [-1.14, 1.14]) {
    kit.box([x, .46, 0], [.23, .89, .76], steel)
    kit.box([x, .075, 0], [.41, .15, .94], ink)
  }
  kit.box([0, .42, -.27], [2.27, .56, .41], enamel)
  kit.box([0, .84, 0], [2.72, .16, 1.08], ink)
  kit.casing([0, .96, 0], [2.78, .12, 1.10], ivory, .05)
  kit.box([-.58, .56, .08], [1.01, .39, .51], slate)
  for (const y of [.48, .65]) {
    kit.box([-.58, y, .345], [.91, .122, .031], '#a2beba')
    kit.box([-.57, y + .018, .373], [.31, .037, .05], ink)
  }
  kit.cylinder([-.32, 1.11, -.32], .22, .29, .16, steel)
  kit.box([-.32, 1.30, -.36], [.16, .33, .19], ink)
  kit.casing([-.32, 1.70, -.34], [1.54, .84, .18], enamel, .07)
  kit.casing([-.32, 1.71, -.235], [1.43, .72, .06], ink, .029)
  kit.box([-.32, 1.71, -.192], [1.26, .56, .03], '#174747', origin, 'glow')
  for (let i = 0; i < 4; i++) kit.box([-.8 + i * .24, 1.70, -.172], [.008, .47, .005], '#27635e', origin, 'glow')
  for (const y of [1.53, 1.67, 1.81]) kit.box([-.32, y, -.172], [1.2, .008, .006], '#27635e', origin, 'glow')
  const wave = [[-.87, 1.65], [-.68, 1.65], [-.61, 1.75], [-.48, 1.52], [-.36, 1.92], [-.27, 1.61], [-.16, 1.7], [.20, 1.7]]
  for (let i = 1; i < wave.length; i++) kit.rod([wave[i - 1][0], wave[i - 1][1], -.16], [wave[i][0], wave[i][1], -.16], .015, mint, 'glow')
  kit.box([-.25, 1.048, .18], [1.23, .046, .37], slate)
  for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) {
    kit.box([-.73 + c * .15, 1.082, .11 + r * .13], [.105, .035, .071], r === 1 && c === 6 ? ochre : ivory)
  }
  // Small bench lamp with an adjustable arm.
  kit.cylinder([.93, 1.065, -.12], .15, .19, .09, steel)
  kit.rod([.93, 1.10, -.12], [1.07, 1.65, -.16], .035, ink)
  kit.rod([1.07, 1.65, -.16], [.70, 1.92, -.12], .035, steel)
  kit.cylinder([.67, 1.87, -.12], .12, .205, .19, ochre, [0, 0, -.24])
  kit.cylinder([.65, 1.78, -.12], .179, .181, .02, '#fff2b8', [0, 0, -.24], 'glow')
}

function reactor(kit: Kit, accent: string) {
  // Tall caged charging column with a luminous energy cell and a control pedestal.
  kit.cylinder([0, .10, 0], 1.02, 1.10, .20, ink, origin, 'metal', 8)
  kit.cylinder([0, .26, 0], .88, 1.0, .19, slate, origin, 'metal', 8)
  kit.cylinder([0, .49, 0], .72, .85, .33, ochre, origin, 'metal', 8)
  kit.cylinder([0, 1.35, 0], .41, .41, 1.65, '#764b38')
  kit.cylinder([0, 1.37, 0], .47, .47, 1.63, accent, origin, 'glow')
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4
    const x = .68 * Math.cos(a), z = .68 * Math.sin(a)
    kit.rod([x, .47, z], [x, 2.37, z], .07, i % 2 ? steel : ochre)
    if (i % 2 === 0) kit.box([x * 1.13, 1.33, z * 1.13], [.09, 1.39, .085], ivory)
  }
  for (const h of [.61, .80, 1.12, 1.55, 1.96, 2.19]) {
    kit.ring([0, h, 0], .555, .034, h === 1.12 || h === 1.96 ? accent : '#e6ab70', 'glow')
  }
  kit.cylinder([0, 2.30, 0], .87, .78, .23, ochre, origin, 'metal', 8)
  kit.cylinder([0, 2.49, 0], .62, .81, .18, ivory, origin, 'metal', 8)
  kit.cylinder([0, 2.64, 0], .45, .61, .14, steel, origin, 'metal', 8)
  kit.cylinder([0, 2.75, 0], .24, .40, .11, accent, origin, 'glow')
  kit.box([.52, .44, .91], [.28, .85, .27], steel)
  kit.casing([.52, .89, 1.0], [.67, .18, .47], ink, .045, [.19, 0, 0])
  kit.box([.52, .98, 1.0], [.49, .028, .29], '#76d7d1', [.19, 0, 0], 'glow')
}

function crane(kit: Kit) {
  // A segmented cantilever with concentric joints, paired links and a two-pronged gripper.
  kit.cylinder([0, .16, 0], .61, .73, .32, steel, origin, 'metal', 8)
  kit.cylinder([0, .42, 0], .39, .53, .21, ochre)
  kit.rod([0, .44, 0], [0, 1.13, 0], .26, '#c78e4e')
  const path: XYZ[] = [[0, 1.07, 0], [-.47, 2.60, .18], [.44, 3.11, .55], [.84, 2.83, .88]]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    for (const dz of [-.091, .091]) kit.rod([a[0], a[1], a[2] + dz], [b[0], b[1], b[2] + dz], .105, i === 1 ? ochre : '#e7ae58')
    kit.rod([a[0] + .115, a[1], a[2]], [b[0] + .115, b[1], b[2]], .045, steel)
  }
  for (const p of path) {
    kit.cylinder(p, .188, .188, .37, ink, [Math.PI / 2, 0, 0])
    kit.cylinder([p[0], p[1], p[2] + .20], .12, .12, .043, ivory, [Math.PI / 2, 0, 0])
  }
  kit.rod([.84, 2.83, .88], [.84, 2.48, .88], .068, steel)
  kit.cylinder([.84, 2.40, .88], .16, .19, .15, ochre)
  for (const side of [-1, 1]) {
    kit.rod([.84 + side * .11, 2.36, .88], [.84 + side * .23, 2.18, .88], .055, ivory)
    kit.rod([.84 + side * .23, 2.18, .88], [.84 + side * .11, 2.04, .88], .051, graphiteGrey)
  }
}

const graphiteGrey = '#354552'

function crates(kit: Kit, x: number, y: number, z: number, count: number) {
  for (let i = 0; i < count; i++) {
    const h = y + i * .43
    kit.casing([x, h + .19, z], [.87, .38, .61], i % 2 ? ochre : enamel, .035)
    for (const dx of [-.27, .27]) kit.box([x + dx, h + .19, z], [.073, .40, .64], steel)
    kit.box([x, h + .381, z], [.91, .047, .66], slate)
    kit.box([x, h + .21, z + .316], [.14, .082, .025], ink)
  }
}

function lobbyShell(kit: Kit, isArena: boolean) {
  const accent = isArena ? amber : mint
  // Shallow bevels and an exposed sandwich edge give the cutaway a heavy base.
  kit.box([0, -.44, 0], [10.5, .47, 7.02], ink)
  kit.box([0, -.27, 0], [10.56, .14, 7.07], steel)
  kit.box([0, -.19, 0], [10.44, .046, 6.99], '#60c8c1', origin, 'glow')
  kit.box([0, -.13, 0], [10.58, .13, 7.07], slate)
  for (let x = 0; x < 5; x++) for (let z = 0; z < 3; z++) {
    kit.box([-4.19 + x * 2.095, -.056, -2.31 + z * 2.31], [2.075, .095, 2.291], (x + z) % 3 ? '#578086' : '#61858a')
  }
  for (const x of [-4.98, 4.98]) kit.box([x, .002, 0], [.043, .014, 6.69], '#abd7bb', origin, 'glow')
  // Coaxial recessed service hatch and guidance paint on the foreground floor.
  if (isArena) {
    for (const x of [-1.57, .55, 2.66]) {
      for (let i = 0; i < 5; i++) kit.box([x, .018, .32 + i * .40], [.034,.012,.27], '#aebc99')
    }
    for (let row = 0; row < 2; row++) for (let i = 0; i < 20; i++) {
      kit.box([-1.44 + i * .208, .024, 2.05 + row*.183], [.208,.018,.183], (row+i)%2 ? '#29414e' : '#e6d7b4')
    }
    // Start gantry cantilevers across the track from the pit wall.
    kit.cylinder([-2.30,.08,1.35], .30,.36,.16,steel,origin,'metal',8)
    kit.box([-2.30,1.14,1.35], [.16,2.19,.16], ochre)
    kit.box([-1.69,2.23,1.35], [1.37,.122,.141], ochre)
    kit.rod([-2.30,1.75,1.35], [-1.82,2.20,1.35], .047, steel)
    kit.casing([-1.33,2.18,1.35], [1.15,.49,.23], ink, .078)
    for (let i = 0; i < 3; i++) {
      const at = -1.66 + .33*i
      kit.cylinder([at,2.18,1.482], .133,.133,.08,steel,[Math.PI/2,0,0])
      kit.cylinder([at,2.18,1.529], .096,.109,.035, ['#c46759','#f3ab68','#96f3ba'][i], [Math.PI/2,0,0], 'glow')
    }
  } else {
    kit.cylinder([0, .009, .8], 1.43, 1.43, .030, steel, origin, 'metal', 48)
    kit.ring([0, .035, .8], 1.37, .023, '#9aaea1')
    for (let i = 0; i < 6; i++) kit.ring([0, .039, .8], 1.19, .023, mint, 'glow', .68, i * Math.PI / 3 + .14)
  }
  for (let i = 0; i < 8; i++) {
    kit.box([-3.94 + i * .31, -.001, 2.66], [.108, .026, .25], '#cad0a5', [0, -.48, 0])
    kit.box([2.01 + i * .31, -.001, 2.66], [.108, .026, .25], ochre, [0, -.48, 0])
  }
  // A real, shallow cityscape of roof antennas, lit windows, layered clouds and a sunset.
  kit.box([0, 1.87, -3.52], [10.15, 3.74, .24], '#527b8a')
  kit.sky([0, 2.12, -3.34], 9.63, 2.56, isArena ? '#333d62' : '#29516c', isArena ? '#c49e93' : '#89b9b1')
  kit.cylinder([-.12, 2.56, -3.21], .47, .47, .028, isArena ? '#ffd5a1' : '#ffda98', [Math.PI / 2, 0, 0], 'glow', 48)
  for (const [x,y,w] of [[-.59,2.63,.80],[.12,2.39,1.0],[1.04,2.70,.69],[2.9,2.50,.75],[-3.6,2.15,.63]]) {
    kit.box([x, y, -3.18], [w, .043, .022], '#a2c4be', origin, 'glow')
  }
  for (let i = 0; i < 24; i++) {
    const x = -4.59 + i * .393
    const h = .24 + ((13 * i + 3) % 8) * .114
    const tint = i % 3 === 0 ? '#386678' : '#45778a'
    kit.box([x, .93 + h / 2, -3.15], [.25 + .045 * (i % 3), h, .11], tint, origin, 'glow')
    if (i % 3 === 1) kit.rod([x, .93 + h, -3.15], [x, 1.16 + h, -3.15], .012, tint, 'glow')
    for (let j = 0; j < Math.floor(h * 3.7); j++) {
      kit.box([x - .045, 1.08 + j * .17, -3.082], [.045, .039, .01], j % 3 ? '#97b8b2' : '#edc796', origin, 'glow')
    }
  }
  kit.box([0, .47, -3.03], [10.40, .94, .50], enamel)
  kit.box([0, .91, -2.98], [10.44, .15, .61], ink)
  kit.box([0, 3.48, -3.08], [10.4, .34, .55], enamel)
  kit.box([0, 3.62, -3.06], [10.49, .14, .62], steel)
  for (const x of [-5, -2.96, -.90, 1.24, 3.40, 5]) {
    kit.box([x, 2.11, -3.00], [.13, 2.37, .40], steel)
    kit.box([x, 3.09, -2.88], [.19, .52, .31], enamel, [0, 0, -.15])
  }
  kit.box([.15, 3.29, -2.90], [8.70, .033, .09], '#b1f4df', origin, 'glow')
  for (const x of [-4.35, -2.80, -1.25, .30, 1.85, 3.40]) {
    kit.box([x, .58, -2.76], [1.19, .35, .06], slate)
    for (let j = 0; j < 7; j++) kit.box([x - .43 + j * .14, .59, -2.717], [.045, .20, .023], steel, [0, 0, -.3])
  }
  // Left return wall carries the supply rack and a power manifold.
  kit.box([-5.02, .87, -.12], [.29, 1.75, 5.95], enamel)
  kit.box([-5.02, 1.79, -.15], [.38, .16, 6.07], steel)
  for (const z of [-2.88, -.89, 1.02, 2.74]) {
    kit.box([-4.87, .89, z], [.24, 1.78, .20], steel)
    kit.box([-4.80, 1.42, z], [.22, .71, .25], slate)
  }
  for (const y of [.81, 1.14]) {
    kit.rod([-4.78, y, -2.92], [-4.78, y, 2.62], .078, y < 1 ? ochre : slate)
    for (const z of [-2.20, -.58, 1.08, 2.48]) kit.cylinder([-4.78,y,z], .114, .114, .10, ink, [Math.PI / 2, 0, 0])
  }
  for (const z of [-1.68, -1.02, -.36]) {
    kit.box([-4.54, .55, z], [.63, 1.10, .61], steel)
    kit.box([-4.18, .61, z], [.075, .83, .49], enamel)
    kit.box([-4.135, .74, z], [.035, .20, .17], ink)
    kit.box([-4.108, .76, z], [.02, .078, .10], accent, origin, 'glow')
  }
  crates(kit, -4.16, 0, 1.95, 2)
  crates(kit, 3.80, 0, -1.57, 2)
  crates(kit, 4.39, 0, -.80, 1)
}

function rail(kit: Kit, from: XYZ, to: XYZ) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
  const posts = Math.max(2, Math.round(a.distanceTo(b) / 1.05) + 1)
  for (let i = 0; i < posts; i++) {
    const {x,y,z} = a.clone().lerp(b, i / (posts - 1))
    kit.box([x, y + .18, z], [.076, .36, .076], steel)
    kit.box([x, y + .36, z], [.092, .055, .092], ivory)
  }
  for (const dy of [.18, .37]) kit.rod([from[0], from[1] + dy, from[2]], [to[0], to[1] + dy, to[2]], dy > .2 ? .037 : .018, dy > .2 ? '#9db5a6' : slate)
}

function fieldShell(kit: Kit, columns: number, rows: number, isArena: boolean) {
  const x = (columns - 1) / 2, z = (rows - 1) / 2
  const width = columns + 6.8, depth = rows + 6.6
  const near = z + depth / 2, far = z - depth / 2
  const left = x - width / 2, right = x + width / 2
  const floor = -1.28
  kit.box([x, floor - .24, z], [width, .46, depth], '#263d48')
  kit.box([x, floor - .03, z], [width + .12, .12, depth + .12], isArena ? '#514d56' : '#45636a')
  // Clear lanes surround the existing raised play deck, kept below the sight line.
  for (const edge of [left + .72, right - .72]) {
    kit.box([edge, floor + .042, z], [.056, .014, depth - .57], isArena ? '#ffb666' : '#94b8aa', origin, 'glow')
    kit.rod([edge, floor + .145, far + .40], [edge, floor + .145, near - .40], .095, steel)
    for (let i = far + .48; i < near - .15; i += 1.47) {
      kit.cylinder([edge, floor + .146, i], .126, .126, .12, ochre, [Math.PI/2, 0, 0])
    }
  }
  for (const edge of [near - .86, far + .67]) {
    kit.box([x, floor + .048, edge], [width - .58, .018, .073], isArena ? '#d4aa72' : '#8aada9')
    for (let i = left + .42; i < right - .30; i += .71) {
      kit.box([i, floor + .054, edge - .30], [.11, .02, .25], isArena ? '#d5a369' : '#859f97', [0, -.35, 0])
    }
  }
  for (const edge of [left + .22, right - .22]) rail(kit, [edge, floor + .04, far + .14], [edge, floor + .04, near - .40])
  for (const edge of [near - .21, far + .20]) {
    rail(kit, [left + .32, floor + .04, edge], [x - .85, floor + .04, edge])
    rail(kit, [x + .85, floor + .04, edge], [right - .32, floor + .04, edge])
  }
  // Recessed service access on the front, opposite a working cargo gantry.
  for (let i = 0; i < 4; i++) {
    kit.box([x, floor - .16 * i, near + i * .21], [1.46, .15, .30], steel)
    kit.box([x, floor + .075 - .16 * i, near + i * .21 + .09], [1.32, .017, .035], i ? enamel : mint, origin, i ? 'metal' : 'glow')
  }
  if (isArena) {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      kit.box([x + (i - 7.5)*.26, floor+.047, near-1.15-j*.26], [.26,.022,.26], (i+j)%2 ? '#2f3645' : '#e1c89a')
    }
    for (const lane of [left+1.50,right-1.50]) {
      for (let p = far+1.6; p < near-1.30; p += 1.3) {
        for (const s of [-1,1]) kit.box([lane+.105*s,floor+.056,p], [.085,.018,.29], '#ffb45c', [0,-.67*s,0], 'glow')
      }
    }
  } else {
    for (const lane of [-1.9, 1.9]) {
      kit.box([x+lane*.61,floor+.047,near-1.20], [Math.abs(lane)*1.2,.024,.042], '#71beba', origin,'glow')
      kit.ring([x+lane*1.22,floor+.063,near-1.20], .15,.025,mint,'glow')
    }
  }
  for (const at of [left + .75, right - .75]) {
    kit.box([at, floor + .75, far + .42], [.32, 1.45, .35], steel)
    kit.box([at, floor + .41, far + .42], [.48, .52, .55], ochre)
    kit.box([at, floor + 1.51, far + .42], [.59, .21, .53], enamel)
  }
  const length = width - 1.32
  kit.box([x, floor + 1.59, far + .42], [length, .23, .29], steel)
  kit.box([x, floor + 1.71, far + .42], [length + .17, .10, .37], ochre)
  for (let i = left + 1; i < right - 1; i += .9) {
    kit.box([i, floor + 1.59, far + .58], [.37, .041, .029], '#abd2c8', origin, 'glow')
  }
  kit.box([x + .45, floor + 1.50, far + .46], [.78, .3, .51], '#c58749')
  for (const dx of [-.19,.19]) kit.rod([x+.45+dx, floor+1.38, far+.49], [x+.45+dx, floor+.73, far+.49], .021, ink)
  kit.box([x+.45, floor+.69, far+.49], [.57,.13,.25], ivory)
  // The actual booths on the gantry identify the bay from across the track.
  const boothX = x - Math.min(2.2, width*.18)
  kit.casing([boothX,floor+1.23,far+.54], [1.55,.55,.235], ink, .06)
  if (isArena) {
    for (let i=0; i<3; i++) {
      const bx = boothX + (i-1)*.445
      kit.cylinder([bx,floor+1.23,far+.69], .18,.18,.10,ochre,[Math.PI/2,0,0])
      kit.cylinder([bx,floor+1.23,far+.756], .144,.153,.045,['#eb7971',amber,'#dffbad'][i],[Math.PI/2,0,0],'glow')
    }
  } else {
    kit.box([boothX,floor+1.23,far+.67],[1.33,.36,.036],'#235455',origin,'glow')
    const points = [[-.59,0],[-.37,0],[-.24,.09],[-.09,-.09],[.02,.10],[.17,-.04],[.28,0],[.58,0]]
    for (let i = 1; i < points.length; i++) {
      kit.rod([boothX+points[i-1][0],floor+1.23+points[i-1][1],far+.70],[boothX+points[i][0],floor+1.23+points[i][1],far+.70], .021,mint,'glow')
    }
  }
  crates(kit, right - 1.36, floor + .03, near - 1.00, 2)
  crates(kit, right - 2.37, floor + .03, near - 1.00, 1)
  crates(kit, left + 1.27, floor + .03, far + 1.03, 2)
}

// A cutaway wall has an inner rail, window reveals and actual three-dimensional
// service equipment behind the glass. All four walls share this local +Z-facing design.
function hangarWall(kit: Kit, span: number, height: number, isArena: boolean) {
  const bays = Math.max(2, Math.min(15, Math.round(span / 2.65)))
  const pitch = span / bays
  const top = height
  const sill = .83
  const glassHeight = top - sill - .27
  kit.box([0, -.12, -.12], [span + .14, .31, .62], ink)
  kit.box([0, sill / 2, -.11], [span, sill, .49], '#65848a')
  kit.box([0, sill, .05], [span + .08, .14, .54], steel)
  kit.box([0, top - .13, -.06], [span, .29, .51], isArena ? '#a67752' : '#689196')
  kit.box([0, top + .044, -.10], [span + .10, .11, .65], ink)
  for (let i = 0; i < bays; i++) {
    const x = -span/2 + pitch * (i + .5)
    // The rear casing is set back so camera motion reveals the raised pipework and mullions.
    kit.box([x, sill + glassHeight / 2, -.32], [pitch - .10, glassHeight, .15], isArena ? '#4c526a' : i % 3 ? '#395e70' : '#416575', origin, 'glow')
    kit.box([x, sill + glassHeight * .21, -.22], [pitch - .15, glassHeight * .42, .022], isArena ? '#746677' : '#476f7d', origin, 'glow')
    if (i % 3 === 1) {
      for (const dx of [-.23, .23]) {
        const w = Math.min(pitch * .15, .40)
        const h = glassHeight * .61
        kit.cylinder([x + dx * pitch, sill + h/2, -.061], w * .56, w * .56, h, '#53838a')
        kit.cylinder([x + dx * pitch, sill + h, -.061], w * .30, w * .57, w * .47, '#8ca59a')
        kit.rod([x + dx*pitch, sill+h, -.061], [x+dx*pitch, top-.35, -.061], .038, '#94afa6')
        kit.cylinder([x + dx * pitch, sill + h * .61, -.061], w * .59, w * .59, .048, '#80beb0', origin, 'glow')
      }
    } else {
      for (let j = 0; j < 3; j++) {
        const px = x + (j - 1) * pitch * .24
        const h = glassHeight * (.27 + ((j*3 + i) % 4) * .085)
        kit.box([px, sill + h/2, -.090], [pitch * .20, h, .14], j % 2 ? '#416372' : '#345969')
        for (let n = 0; n < 3; n++) kit.box([px - .055 + n*.054, sill + h*.61, -.013], [.023,.045,.016], n % 2 ? '#a7d2ba' : '#85b9b0', origin,'glow')
      }
    }
    kit.box([x, top-.27, .15], [pitch * .63, .037, .10], isArena ? amber : i%3 === 0 ? '#f2bf76' : '#93d5cb', origin, 'glow')
    if (isArena && i % 3 === 1) {
      // Illuminated directional fletches line the upper track behind the racing lanes.
      for (const dx of [-.21,.18]) {
        const sy = sill + glassHeight*.71
        kit.box([x+dx,sy+.092,.079], [.078,.27,.035],amber,[0,0,.63],'glow')
        kit.box([x+dx,sy-.092,.079], [.078,.27,.035],amber,[0,0,-.63],'glow')
      }
    }
    if (i % 2 === 0) {
      kit.box([x, .44, .16], [pitch * .65, .35, .068], slate)
      for (let j = 0; j < 6; j++) kit.box([x + (j-2.5)*pitch*.086, .44, .20], [.042,.215,.024], ink, [0,0,-.31])
    } else {
      kit.box([x, .44, .158], [pitch * .60, .38, .07], '#63858b')
      kit.box([x, .45, .204], [pitch * .35, .043, .035], '#d0b490')
    }
  }
  for (let i = 0; i <= bays; i++) {
    const x = -span / 2 + pitch*i
    kit.box([x, top/2, .057], [.14, top, .34], steel)
    kit.box([x, top-.51, .16], [.21, .59, .41], '#78989a')
    kit.box([x, .39, .18], [.23, .76, .42], '#52747a')
    kit.box([x, .32, .41], [.13,.117,.036], ochre)
  }
}

export function createWorkshopSet({ kind, columns = 8, rows = 8, variant = 'workshop' }: WorkshopOptions) {
  const group = new THREE.Group()
  group.name = kind === 'lobby' ? 'Workshop interior' : 'Service hangar'
  const materials = {
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .73, metalness: .19 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }
  const resources: THREE.BufferGeometry[] = []
  function section(build: (kit: Kit) => void, at: XYZ = origin, scale = 1) {
    const kit = new Kit()
    build(kit)
    const unit = kit.finish(materials, resources)
    unit.position.set(...at)
    unit.scale.setScalar(scale)
    group.add(unit)
    return unit
  }
  let rotor: THREE.Group | undefined
  const walls: { unit: THREE.Group; normal: THREE.Vector3 }[] = []
  const cameraDirection = new THREE.Vector3()
  if (kind === 'lobby') {
    const coreColor = variant === 'arena' ? '#ff945e' : '#ffcb75'
    section(kit => lobbyShell(kit, variant === 'arena'))
    const diagnostics = section(bench, [-2.72, 0, -.12])
    diagnostics.userData.station = 'learning'
    const core = section(kit => reactor(kit, coreColor), [2.55, 0, -1.52])
    core.userData.station = 'arena'
    section(crane, [-1.1, 0, -1.96], .98)
    // The rotor is the only moving machine. Its concentric coils orbit without
    // rotating the feet, cage, or cap of the charging column.
    rotor = section(kit => {
      for (let i = 0; i < 3; i++) {
        kit.ring([0, i * .31, 0], .575, .025, '#ffe5a4', 'glow', 1.89, i * 1.37)
      }
    }, [2.55, 1.09, -1.52])
    rotor.userData.station = 'arena'
  } else {
    const isArena = variant === 'arena'
    section(kit => fieldShell(kit, columns, rows, isArena))
    const cx = (columns - 1) / 2, cz = (rows - 1) / 2
    const width = columns + 6.8, depth = rows + 6.6
    const h = Math.min(3.9, 2.48 + Math.min(rows, columns) * .10)
    for (const [dx, dz, angle, span] of [[0,-1,0,width], [-1,0,Math.PI/2,depth], [0,1,Math.PI,width], [1,0,-Math.PI/2,depth]]) {
      const at: XYZ = [cx + dx*width/2, -1.26, cz + dz*depth/2]
      const wall = section(kit => hangarWall(kit, span, h, isArena), at)
      wall.rotation.y = angle
      wall.visible = dx < 0 || dz < 0
      walls.push({ unit: wall, normal: new THREE.Vector3(-dx, 0, -dz) })
    }
    const diagnostics = section(bench, [-2.55, -1.25, (rows - 1) * .51], .78)
    diagnostics.rotation.y = Math.PI / 2
    section(kit => reactor(kit, isArena ? '#ffb668' : '#83ddc7'), [columns + 1.65, -1.24, .38], .69)
    if (isArena && rows >= 4) section(kit => reactor(kit, '#ff985e'), [columns + 1.65, -1.24, (rows-1)*.74], .63)
    section(crane, [-2.65, -1.23, rows + .97], .65)
  }
  return {
    group,
    update(seconds: number) { if (rotor) rotor.rotation.y = seconds * .46 },
    updateView(camera: THREE.Camera) {
      if (!walls.length) return
      camera.getWorldDirection(cameraDirection)
      for (const wall of walls) wall.unit.visible = cameraDirection.dot(wall.normal) < -.08
    },
    dispose() {
      group.removeFromParent()
      group.clear()
      for (const geometry of resources) geometry.dispose()
      materials.metal.dispose()
      materials.glow.dispose()
    },
  }
}

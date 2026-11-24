import * as THREE from 'three'
import { ModelParts } from './models'
import { createDeckBelt } from './deckBelt'

export type BoardSceneryProp = 'fan' | 'conveyor'

const graphite = '#253f50'
const steel = '#78939a'
const enamel = '#35a69d'
const mint = '#adffdd'
const amber = '#ffbd61'
const halfPi = Math.PI / 2

// Both machines sit on the outside lip of the deck. Their coordinates are visual only.
export function createBoardScenery(columns: number, rows: number) {
  const root = new THREE.Group()
  root.name = 'Deck equipment'
  const geometries: THREE.BufferGeometry[] = []
  const materials = {
    shell: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .60, metalness: .18 }),
    light: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }
  const scannerGlow = materials.light.clone()
  function assemble(parent: THREE.Object3D, build: (parts: ModelParts) => void, light = materials.light) {
    const parts = new ModelParts()
    build(parts)
    const unit = parts.bake({ shell: materials.shell, light }, geometries)
    parent.add(unit)
    return unit
  }

  const fan = new THREE.Group()
  fan.name = 'Cooling fan'
  fan.position.set((columns - 1) * .28, -.08, -.94)
  root.add(fan)
  const flowMeterX = -.91
  assemble(fan, parts => {
    parts.box([1.27, .10, .65], [0, .045, 0], graphite, .04)
    parts.box([1.16, .12, .53], [0, .12, 0], enamel, .04)
    for (const x of [-.42, .42]) {
      parts.box([.11, .32, .25], [x, .25, -.025], steel, .025)
    }
    parts.box([.53, .11, .37], [-.72, .07, 0], graphite, .025)
    parts.cylinder(.22, .26, .12, [flowMeterX, .15, 0], enamel)
    parts.cylinder(.035, .035, .87, [flowMeterX, .62, 0], steel)
    parts.cylinder(.085, .09, .07, [flowMeterX, 1.045, 0], graphite)
  })
  const flowRotor = assemble(fan, parts => {
    parts.cylinder(.084, .084, .125, [0, 0, 0], graphite)
    parts.add(new THREE.TorusGeometry(.225, .038, 6, 18), amber, [0, 0, 0], [halfPi, 0, 0])
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3
      parts.box([.21, .047, .089], [.135 * Math.cos(angle), 0, -.135 * Math.sin(angle)],
        i === 0 ? '#f7e5b8' : enamel, .013, [0, angle, .22])
    }
  })
  flowRotor.name = 'Airflow indicator'
  flowRotor.position.set(flowMeterX, .66, 0)
  const fanFace = new THREE.Group()
  fanFace.position.set(0, .65, -.045)
  fanFace.rotation.x = -.34
  fan.add(fanFace)
  assemble(fanFace, parts => {
    parts.add(new THREE.CylinderGeometry(.56, .52, .18, 24), graphite, [0, 0, -.09], [halfPi, 0, 0])
    parts.add(new THREE.TorusGeometry(.503, .048, 6, 28), enamel, [0, 0, .04])
    parts.add(new THREE.TorusGeometry(.511, .015, 5, 28), '#cdf7df', [0, 0, .076])
  })
  const blades = assemble(fanFace, parts => {
    // A swept, tapered vane exposes the dark intake between consecutive blades.
    const outline = new THREE.Shape()
    outline.moveTo(.035, .075)
    outline.quadraticCurveTo(.02, .30, -.14, .405)
    outline.quadraticCurveTo(-.015, .49, .132, .421)
    outline.quadraticCurveTo(.225, .235, .103, .055)
    outline.closePath()
    for (let i = 0; i < 4; i++) {
      parts.add(new THREE.ExtrudeGeometry(outline, { depth: .024, bevelEnabled: false, curveSegments: 4 }),
        i === 0 ? '#ebbc72' : '#95dacd', [0, 0, .017], [0, 0, i * halfPi])
    }
    parts.add(new THREE.CylinderGeometry(.104, .12, .072, 16), steel, [0, 0, .058], [halfPi, 0, 0])
    parts.add(new THREE.CylinderGeometry(.064, .064, .016, 12), mint, [0, 0, .103], [halfPi, 0, 0], 'light')
  })
  const gauge = assemble(fan, parts => {
    parts.box([.37, .042, .085], [.185, 0, 0], mint, .012, [0, 0, 0], 'light')
  })
  gauge.position.set(-.185, .19, .20)
  gauge.scale.x = .40

  const conveyor = new THREE.Group()
  conveyor.name = 'Parcel conveyor'
  conveyor.position.set(columns - .035, -.08, (rows - 1) * .55)
  conveyor.rotation.y = halfPi
  root.add(conveyor)
  assemble(conveyor, parts => {
    parts.box([1.90, .10, .69], [0, .045, 0], graphite, .04)
    for (const x of [-.68, .68]) {
      parts.box([.20, .20, .48], [x, .17, 0], steel, .025)
    }
    parts.box([1.85, .15, .57], [0, .28, 0], graphite, .065)
    for (const side of [-1, 1]) {
      parts.box([1.82, .088, .06], [0, .305, side * .295], enamel, .025)
      parts.box([.105, .45, .085], [0, .54, side * .285], enamel, .02)
    }
    parts.box([.13, .095, .66], [0, .77, 0], steel, .025)
    for (let i = -5; i <= 5; i++) {
      parts.add(new THREE.CylinderGeometry(.063, .063, .47, 8), '#78909a', [i * .157, .314, 0], [halfPi, 0, 0])
    }
  })
  const sample = assemble(conveyor, parts => {
    parts.box([.35, .24, .32], [0, .12, 0], '#d88945', .03)
    parts.box([.37, .06, .33], [0, .22, 0], amber, .02)
    parts.box([.082, .018, .33], [.045, .255, 0], '#ffe4ac', .005)
  })
  const end = .64
  sample.position.set(-end, .379, 0)
  const scannerLamp = assemble(conveyor, parts => {
    parts.box([.119, .026, .53], [0, 0, 0], mint, .006, [0, 0, 0], 'light')
    for (const x of [-.067, .067]) {
      parts.box([.014, .051, .51], [x, -.051, 0], mint, .005, [0, 0, 0], 'light')
    }
  }, scannerGlow)
  scannerLamp.position.y = .824

  const belt = createDeckBelt(columns, rows)
  root.add(belt.mesh)
  const hitTargets = [fan, conveyor]
  const ambientBounds = [...hitTargets.map(target => new THREE.Box3().setFromObject(target)), ...belt.bounds]
  function targetOf(object: THREE.Object3D): BoardSceneryProp | undefined {
    for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
      if (node === fan) return 'fan'
      if (node === conveyor) return 'conveyor'
    }
  }

  let boostStarted = -Infinity
  let gaugeWide = false
  let shuttleStarted = -Infinity
  let shuttleFrom = -end
  let shuttleTo = -end
  function activate(id: BoardSceneryProp, timeMs: number) {
    if (id === 'fan') {
      boostStarted = timeMs
      gaugeWide = !gaugeWide
    } else {
      shuttleFrom = sample.position.x
      shuttleTo = -shuttleTo
      shuttleStarted = timeMs
    }
  }

  function update(timeMs: number, reducedMotion: boolean, elapsed: number, idleSeconds: number) {
    const boost = Math.max(0, 1 - (timeMs - boostStarted) / 1800)
    if (!reducedMotion) {
      belt.update(idleSeconds)
      blades.rotation.z -= elapsed * (.62 + boost * 11)
      flowRotor.rotation.y += elapsed * (.56 + boost * 1.25)
      flowRotor.position.y = .66 + .14 * Math.sin(idleSeconds * 1.35)
    }
    gauge.scale.x = reducedMotion ? (gaugeWide ? 1 : .40) : .40 + .60 * boost

    const progress = reducedMotion ? 1 : THREE.MathUtils.smoothstep(timeMs - shuttleStarted, 0, 1050)
    sample.position.x = THREE.MathUtils.lerp(shuttleFrom, shuttleTo, progress)
    const scanning = Math.abs(sample.position.x) < .23
    scannerLamp.scale.z = scanning ? 1.15 : 1
    scannerGlow.color.setScalar(scanning ? 1 : reducedMotion ? .68 : .62 + .29 * Math.sin(idleSeconds * 1.05))
    // The board schedules idle frames at a lower rate than a child's tap response.
    return !reducedMotion && (boost > 0 || progress < 1)
  }

  function dispose() {
    root.removeFromParent()
    for (const geometry of geometries) geometry.dispose()
    materials.shell.dispose()
    materials.light.dispose()
    scannerGlow.dispose()
    belt.dispose()
  }
  return { root, hitTargets, ambientBounds, targetOf, activate, update, dispose }
}

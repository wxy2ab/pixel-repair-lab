import * as THREE from 'three'
import type { LessonRoomFamily } from './lessonRoom'
import type { RoomActivityReading, RoomActivityState, RoomTarget } from './roomActivity'
import { lessonRoomEquipment } from './lesson-room-equipment'
import { Kit } from './workshop'

type Surfaces = Parameters<Kit['finish']>[0]
const ink = '#243e46', enamel = '#7da6a3', ivory = '#f2dbaf', brass = '#e6ac65'
const mint = '#9df6cd', amber = '#ffc37e'
const cellColors = ['#ecaf68', '#75b9a9', '#cb8e79', '#9baccb']
const forward: [number, number, number] = [Math.PI / 2, 0, 0]
const clamp = THREE.MathUtils.clamp
const slot = (i: number, n: number) => (i - (n - 1) / 2) * Math.min(.54, 1.58 / n)

function cell(value: number, color: string) {
  const kit = new Kit()
  const h = .33 + clamp(value / 9, 0, 1) * .61
  kit.casing([0, h / 2, 0], [.33, h, .35], color, .05)
  kit.casing([0, h + .022, 0], [.16, .056, .19], ivory, .013)
  kit.box([0, .10, .179], [.24, .045, .016], ink)
  kit.box([0, h - .09, .179], [.11, .026, .014], ivory)
  kit.box([0, h - .09, .18], [.026, .09, .014], ivory)
  return kit
}

function inputTray() {
  const kit = new Kit()
  kit.casing([0, .09, 0], [1.98, .18, .83], ink, .055)
  kit.casing([0, .21, 0], [1.89, .085, .76], enamel, .035)
  for (const x of [-.93, .93]) kit.box([x, .28, 0], [.085, .13, .75], ivory)
  kit.box([0, .125, .433], [.85, .055, .03], brass)
  return kit
}

function selector() {
  const kit = new Kit()
  kit.casing([0, .08, 0], [1.31, .16, .83], ink, .045)
  kit.casing([0, .49, -.08], [1.19, .84, .38], enamel, .09)
  kit.casing([0, .49, .12], [1.06, .71, .05], ivory, .035)
  kit.cylinder([0, .49, .18], .283, .30, .075, ink, forward)
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * .40
    kit.box([Math.sin(a) * .36, .49 + Math.cos(a) * .36, .161], [.026, .066, .02], ink, [0, 0, -a])
  }
  return kit
}

function knob() {
  const kit = new Kit()
  kit.cylinder([0, 0, 0], .205, .232, .16, brass, forward, 'metal', 24)
  kit.cylinder([0, 0, .084], .175, .184, .016, '#efc58a', forward, 'metal', 24)
  kit.box([0, .101, .102], [.047, .137, .022], ink)
  return kit
}

// A small emissive screen keeps numeric readings legible when the viewport is narrow.
function instrumentScreen(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 144
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const geometry = new THREE.PlaneGeometry(width, height)
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  const mesh = new THREE.Mesh(geometry, material)
  const paint = (reading: RoomActivityReading) => {
    const { input, output, mode, kind } = reading
    const w = canvas.width
    const h = canvas.height
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#173f46'
    ctx.fillRect(0, 0, w, h)
    const graph = kind === 'data' || kind === 'statistics' || kind === 'array' || kind === 'table' || kind === 'query'
    if (graph) {
      const series = mode === 'series' && output ? output : input
      const max = Math.max(1, ...input, ...series, ...(output ?? []))
      const stride = w / series.length
      for (let i = 0; i < series.length; i++) {
        const size = series[i] / max * (h - 48)
        ctx.fillStyle = !output ? '#89bdb5' : mode === 'mask' && !output[i] ? '#516b72' : mint
        ctx.fillRect(i * stride + stride * .23, h - size - 9, stride * .54, size)
      }
      if (output && mode === 'scalar') {
        ctx.strokeStyle = amber
        ctx.lineWidth = 5
        ctx.beginPath()
        if (kind === 'statistics' && reading.setting === 1) {
          // A range spans the smallest and largest readings.
          const y1 = h - 9 - Math.max(...input) / max * (h - 48)
          const y2 = h - 9 - Math.min(...input) / max * (h - 48)
          ctx.moveTo(w - 23, y1)
          ctx.lineTo(w - 10, y1)
          ctx.lineTo(w - 10, y2)
          ctx.lineTo(w - 23, y2)
        } else {
          const y = h - 9 - output[0] / max * (h - 48)
          ctx.moveTo(2, y)
          ctx.lineTo(w - 2, y)
        }
        ctx.stroke()
        ctx.font = 'bold 36px monospace'
        ctx.fillStyle = amber
        ctx.textAlign = 'right'
        ctx.fillText(String(output[0]), w - 10, 34)
      }
    } else if (kind === 'coding') {
      ctx.strokeStyle = mint
      ctx.lineWidth = 5
      ctx.strokeRect(14, 37, 235, 73)
      ctx.fillStyle = mint
      ctx.fillRect(249, 57, 9, 32)
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = output && i < output[0] ? mint : '#34585b'
        ctx.fillRect(23 + i * 28, 45, 23, 57)
      }
      ctx.font = 'bold 86px monospace'
      ctx.fillStyle = output ? mint : '#789899'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(output ? String(output[0]) : '—', 315, h / 2)
    } else {
      const value = output ? output.join(' ') : '—'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 102px monospace'
      ctx.fillStyle = output ? mint : '#789899'
      ctx.fillText(value, w / 2, h / 2 + 4, w - 14)
    }
    texture.needsUpdate = true
  }
  return {
    mesh,
    paint,
    dispose() {
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}

export function createRoomControlRig(family: LessonRoomFamily, accent: string, materials: Surfaces) {
  const resources: THREE.BufferGeometry[] = []
  const dynamic: THREE.BufferGeometry[] = []
  const groups = { sample: new THREE.Group(), setting: new THREE.Group(), run: new THREE.Group() }
  groups.sample.add(inputTray().finish(materials, resources))
  groups.setting.add(selector().finish(materials, resources))
  const dial = knob().finish(materials, resources)
  dial.position.set(0, .49, .23)
  groups.setting.add(dial)
  const device = lessonRoomEquipment(family, accent).finish(materials, resources)
  device.position.y = .11
  groups.run.add(device)
  const plinth = new Kit()
  plinth.casing([0, .05, .04], [2.13, .10, 1.2], ink, .045)
  plinth.casing([.80, .14, .44], [.34, .10, .26], brass, .035)
  plinth.box([.80, .196, .44], [.18, .017, .10], ivory)
  groups.run.add(plinth.finish(materials, resources))
  const screen = family === 'coding' || family === 'data' || family === 'systems'
    ? instrumentScreen(family === 'systems' ? .65 : 1.30, family === 'systems' ? .37 : .63) : undefined
  if (screen) {
    screen.mesh.position.set(0, .74, family === 'systems' ? .181 : .091)
    device.add(screen.mesh)
  }
  const sampleData = new THREE.Group(), sceneData = new THREE.Group()
  groups.sample.add(sampleData)
  device.add(sceneData)
  const sorting: { model: THREE.Group; from: number; to: number }[] = []
  let settingTurn = 0, priorTurn = 0

  function update(state: RoomActivityState, reading: RoomActivityReading) {
    sampleData.clear()
    sceneData.clear()
    for (const geometry of dynamic) geometry.dispose()
    dynamic.length = 0
    sorting.length = 0
    priorTurn = dial.rotation.z
    const { input, output, kind } = reading
    settingTurn = (['vision', 'ai', 'query', 'pixels'].includes(kind) ? [0, -1.00, 1.00] : [.95, -.95])[state.setting]
    const pack = family === 'coding' || family === 'algorithms' || family === 'ai'
    const piece = (kit: Kit, parent: THREE.Group) => {
      const group = kit.finish(materials, dynamic)
      parent.add(group)
      return group
    }
    const samples = new Kit()
    input.forEach((value, i) => {
      const x = slot(i, input.length), z = -.04
      if (pack) {
        const item = piece(cell(value, cellColors[i % 4]), sampleData)
        item.position.set(x, .26, z)
      } else if (family === 'electronics' || kind === 'systems') {
        samples.casing([x, .34, 0], [.45, .16, .53], ink, .035)
        samples.casing([x, .47, .012], [.32, .17, .41], value ? mint : brass, .03, [value ? -.40 : .40, 0, 0])
      } else if (family === 'vision') {
        const level = kind === 'pixels' ? value / 255 : value / 100
        const color = kind === 'pixels' ? new THREE.Color('rgb(' + [value, value, value].join(',') + ')') : new THREE.Color(cellColors[i])
        samples.casing([x, .46, 0], [.40, .39, .21], '#c4c6b3', .025)
        samples.box([x, .47, .12], [.32, .30, .025], '#' + color.getHexString())
        if (kind !== 'pixels') samples.box([x - .14 + .14 * level, .321, .142], [.28 * level, .026, .016], mint)
      } else {
        const height = .13 + Math.min(1, value / Math.max(...input, 8)) * .68
        samples.casing([x, .26 + height / 2, 0], [.34, height, .34], cellColors[i % 4], .035)
      }
      if (reading.mode === 'mask' && output?.[i]) {
        const w = .426, bottom = .25, top = family === 'vision' ? .69 : 1.12
        for (const side of [-1, 1]) samples.box([x + side * w / 2, (bottom + top) / 2, .205], [.026, top - bottom, .021], mint, undefined, 'glow')
        for (const y of [bottom, top]) samples.box([x, y, .205], [w, .025, .021], mint, undefined, 'glow')
      }
    })
    piece(samples, sampleData)
    if (family === 'algorithms') {
      const used = new Set<number>()
      input.forEach((value, i) => {
        const model = piece(cell(value, cellColors[i % 4]), sceneData)
        const toIndex = output && reading.mode === 'series' ? output.findIndex((v, j) => v === value && !used.has(j)) : i
        used.add(toIndex)
        const from = slot(i, input.length), to = slot(toIndex, input.length)
        model.position.set(to, .30 + (reading.mode === 'mask' && output?.[i] ? .17 : 0), -.055)
        if (reading.mode === 'series') sorting.push({ model, from, to })
      })
    } else if (family === 'electronics') {
      const light = new Kit()
      const color = output?.[0] ? '#c5ff85' : '#637e69'
      light.cylinder([.066, .74, .10], .17, .19, .22, color, undefined, output?.[0] ? 'glow' : 'metal')
      light.cylinder([.066, .87, .10], .08, .17, .074, color, undefined, output?.[0] ? 'glow' : 'metal')
      light.box([.066 + (reading.setting ? .155 : -.155), .73, .104], [.023, .20, .16], ink)
      // The power pilot stays on while testing, even when the reversed LED stays dark.
      light.box([-.64, .17, .503], [.19, .085, .025], output ? amber : '#546568', undefined, 'glow')
      piece(light, sceneData)
    } else if (family === 'vision' || family === 'ai') {
      const contacts = new Kit()
      contacts.casing([-.05, .11, .49], [1.26, .18, .15], ink, .035)
      input.forEach((_, i) => {
        const checked = output?.[i]
        const color = checked === undefined ? '#6c7d81' : checked ? (kind === 'pixels' ? '#fcf9ed' : mint) : '#1b242a'
        contacts.box([-.05 + slot(i, input.length) * .72, .11, .575], [.22, .115, .024], color, undefined, 'glow')
      })
      piece(contacts, sceneData)
    }
    screen?.paint(reading)
  }
  function animate(target: RoomTarget | undefined, p: number) {
    const ease = p * p * (3 - 2 * p)
    const bounce = Math.sin(p * Math.PI)
    sampleData.position.y = target === 'sample' ? bounce * .14 : 0
    dial.rotation.z = target === 'setting' ? priorTurn + (settingTurn - priorTurn) * ease : settingTurn
    device.rotation.y = target === 'run' && (family === 'vision' || family === 'ai') ? bounce * .20 : 0
    for (const { model, from, to } of sorting) {
      model.position.x = target === 'run' ? from + (to - from) * ease : to
      model.position.y = .30 + (target === 'run' && from !== to ? bounce * (.14 + Math.abs(to - from) * .16) : 0)
    }
  }
  return {
    groups, update, animate, dispose() {
      screen?.dispose()
      for (const geometry of [...resources, ...dynamic]) geometry.dispose()
      for (const group of Object.values(groups)) group.clear()
    }
  }
}

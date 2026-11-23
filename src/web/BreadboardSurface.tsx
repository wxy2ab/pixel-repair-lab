import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { measureBreadboardMeter, type MeterMode } from '../engine/breadboardMeter'
import type { UnoState } from '../engine/arduino'
import { canPlaceBreadboardPart, isBreadboardPin, isBreadboardSocket, type BreadboardMode, type BreadboardPart, type BreadboardPartKind, type BreadboardWire } from '../shared/breadboard'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { BreadboardPartsTray, partLabel, PartBody } from './BreadboardParts'
import { BreadboardMeter, BreadboardProbeLead, type BreadboardMeterRecall, type BreadboardMeterSample, type Probe, type ProbePins } from './BreadboardMeter'
import './breadboard-surface.css'

type Props = {
  mode: BreadboardMode; locale: Locale; wires: BreadboardWire[]; selectedPin?: string | null
  onPin: (pin: string) => void; closed: boolean; onToggle: () => void
  powered: boolean; tripped?: boolean; ledOn: boolean; currentPath: string[]; inputPath: string[]
  parts: BreadboardPart[]; onInstall: (part: BreadboardPart) => void
  onRemovePart: (kind: BreadboardPartKind) => void; onFlipLed: () => void
  onBeginPartEdit?: () => void; unoState?: UnoState; editLocked?: boolean
  onMeterReading?: (sample: BreadboardMeterSample | undefined) => void
  onProbeSetupChange?: (setup: ProbePins & { mode: MeterMode }, origin: 'manual' | 'recall') => void
  meterRecall?: BreadboardMeterRecall
}

type Point = { x: number; y: number }
export const rows = ['A', 'B', 'C', 'D', 'E']
export const columns = [1, 2, 3, 4, 5, 6]
export const holeX = (col: number) => 68 + (col - 1) * 67
export const holeY = (row: number) => 64 + row * 45
export const wireColors = ['#b65c38', '#157497', '#6c589a', '#237e65', '#b57d1f', '#46639a']

export function socketLabel(pin: string, locale: Locale) {
  if (pin === '5V') return tr(locale, '电源正极 5V', 'Supply positive 5V')
  if (pin === 'GND') return tr(locale, '地线 GND', 'Ground GND')
  if (pin.startsWith('uno-')) return tr(locale, 'Arduino 引脚 ', 'Arduino pin ') + pin.slice(4)
  return locale === 'zh' ? pin + ' 接线孔' : 'Socket ' + pin
}

export function pinPoint(pin: string, mode: BreadboardMode): Point {
  if (pin === 'GND') return { x: mode === 'series' ? 400 : 135, y: 342 }
  if (pin === '5V' || pin === 'uno-D2') return { x: 68, y: 342 }
  if (pin === 'uno-D13') return { x: 211, y: 342 }
  const row = rows.indexOf(pin[0])
  if (row >= 0 && /^[A-E][1-6]$/.test(pin)) return { x: holeX(Number(pin[1])), y: holeY(row) }
  throw new Error('Unknown ' + mode + ' breadboard terminal ' + pin)
}

// Give jumpers a little slack. The curve is identical when followed in reverse.
export function jumperPath(from: Point, to: Point, index: number) {
  const fromPort = from.y === 342
  const toPort = to.y === 342
  if (fromPort !== toPort) {
    // Keep leads from the power supply between the columns so the other sockets stay visible.
    const port = fromPort ? from : to
    const hole = fromPort ? to : from
    const side = port.x === hole.x ? (hole.x <= 234 ? -1 : 1) : Math.sign(port.x - hole.x)
    const lane = hole.x + side * (19 + index % 3 * 3)
    return fromPort
      ? `M${port.x} ${port.y} C${port.x} 315 ${lane} 306 ${lane} 282 V${hole.y + 16} Q${lane} ${hole.y} ${hole.x} ${hole.y}`
      : `M${hole.x} ${hole.y} Q${lane} ${hole.y} ${lane} ${hole.y + 16} V282 C${lane} 306 ${port.x} 315 ${port.x} ${port.y}`
  }
  const bow = Math.min(43, Math.abs(to.x - from.x) * 0.25 + 12 + index % 3 * 4)
  const rise = fromPort ? -bow : bow
  const side = Math.abs(from.x - to.x) < 30 ? 18 + (index % 3) * 6 : 0
  const c1 = { x: from.x + side, y: from.y + rise }
  const c2 = { x: to.x + side, y: to.y + rise }
  return `M${from.x} ${from.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`
}

// Keep the body between hole columns so the surrounding sockets can still be reached.
export function mounting(part: BreadboardPart, mode: BreadboardMode, bodies: Point[]) {
  const [a, b] = part.pins.map(pin => pinPoint(pin, mode))
  const firstLeft = a.x < b.x || (a.x === b.x && a.y < b.y)
  const midX = (a.x + b.x) / 2
  const x = columns.some(col => holeX(col) === midX) ? midX + (midX === holeX(6) ? -1 : 1) * 33.5 : midX
  const preferredY = (a.y + b.y) / 2 - 13
  // Three parts on separate holes can share a midpoint. Bend their legs to give
  // each body its own clickable space in the lane between the hole columns.
  const possibleY = Array.from({ length: 17 }, (_, i) => preferredY + Math.ceil(i / 2) * (i % 2 ? -22 : 22))
  const y = possibleY.find(value => value >= 44 && value <= 248
    && bodies.every(other => Math.abs(other.x - x) >= 56 || Math.abs(other.y - value) >= 38)) ?? preferredY
  const width = part.kind === 'led' ? 6 : part.kind === 'button' ? 18 : 23
  const first = { x: x + (firstLeft ? -width : width), y: y + (part.kind === 'led' ? 14 : 0) }
  const second = { x: 2 * x - first.x, y: first.y }
  const lead = (pin: Point, contact: Point) => {
    const lane = pin.x + Math.sign(contact.x - pin.x) * 12
    return [pin, { x: lane, y: pin.y }, { x: lane, y: contact.y }, contact]
  }
  const leg1 = lead(a, first), leg2 = lead(b, second)
  return { x, y, firstLeft, leads: through(leg1) + ' ' + through(leg2), leg1, leg2 }
}

type FittedPart = { part: BreadboardPart; shape: ReturnType<typeof mounting> }

function through(points: Point[]) {
  return points.map(({ x, y }, index) => (index ? 'L' : 'M') + x + ' ' + y).join(' ')
}

function currentTrack(fromId: string, toId: string, wires: BreadboardWire[], fitted: FittedPart[], mode: BreadboardMode) {
  const a = pinPoint(fromId, mode)
  const b = pinPoint(toId, mode)
  const wireIndex = wires.findIndex(([start, end]) =>
    (start === fromId && end === toId) || (end === fromId && start === toId))
  if (wireIndex !== -1) return jumperPath(a, b, wireIndex)
  const component = fitted.find(({ part }) => part.pins[0][1] !== part.pins[1][1] && part.pins.includes(fromId) && part.pins.includes(toId))
  if (component) {
    const { part, shape } = component
    const [enter, exit] = part.pins[0] === fromId ? [shape.leg1, shape.leg2] : [shape.leg2, shape.leg1]
    return through([...enter, { x: enter[3].x, y: shape.y }, { x: exit[3].x, y: shape.y }, ...exit.slice().reverse()])
  }
  return `M${a.x} ${a.y} L${b.x} ${b.y}`
}

function droppedPart(kind: BreadboardPartKind, anchor: string, mounted?: BreadboardPart): BreadboardPart {
  const col = Number(anchor[1]), row = rows.indexOf(anchor[0])
  let other = anchor[0] + (col === 6 ? 5 : col + 1)
  if (mounted) {
    // Sliding a fitted part preserves the spacing and orientation of its leads.
    const [a, b] = mounted.pins
    const endRow = row + rows.indexOf(b[0]) - rows.indexOf(a[0])
    const endCol = col + Number(b[1]) - Number(a[1])
    other = endRow >= 0 && endRow < rows.length && columns.includes(endCol) ? rows[endRow] + endCol : ''
  }
  return { kind, pins: [anchor, other] }
}

function onKeyActivate(event: KeyboardEvent<SVGGElement>, run: () => void) {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    if (!event.repeat) run()
  }
}

export default function BreadboardSurface({ mode, locale, wires, selectedPin, onPin, closed, onToggle,
  powered, tripped = false, ledOn, currentPath, inputPath, parts, onInstall, onRemovePart, onFlipLed, onBeginPartEdit,
  unoState, editLocked = false, onMeterReading, onProbeSetupChange, meterRecall }: Props) {
  const id = useId()
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const uno = mode === 'call-lamp'
  const ports = uno ? ['uno-D2', 'GND', 'uno-D13'] : ['5V', 'GND']
  const selectedColumn = selectedPin && /^[A-E][1-6]$/.test(selectedPin) ? Number(selectedPin[1]) : undefined
  const switchText = uno ? (closed ? t('松开按钮', 'Release button') : t('按下按钮', 'Press button'))
    : (closed ? t('断开开关', 'Open switch') : t('闭合开关', 'Close switch'))
  const lampText = ledOn ? t('外接 LED 亮', 'External LED on') : t('外接 LED 灭', 'External LED off')
  const url = (name: string) => 'url(#' + id + name + ')'
  const [editing, setEditing] = useState<{ kind: BreadboardPartKind; first?: string }>()
  const [dragging, setDragging] = useState<BreadboardPartKind>()
  const [hover, setHover] = useState<string>()
  const [invalid, setInvalid] = useState(false)
  const [meterMode, setMeterMode] = useState<MeterMode>('continuity')
  const [probePins, setProbePins] = useState<ProbePins>({})
  const [chosenProbe, setChosenProbe] = useState<Probe | undefined>(editLocked ? 'red' : undefined)
  const [dragProbe, setDragProbe] = useState<Probe>()
  const [lastEditLock, setLastEditLock] = useState(editLocked)
  if (lastEditLock !== editLocked) {
    // Once a diagnosis is recorded, holes take jumpers again. The probes stay at their contacts.
    setLastEditLock(editLocked)
    setChosenProbe(editLocked ? 'red' : undefined)
  }
  const [appliedRecall, setAppliedRecall] = useState<number>()
  const recalledPins = useRef<ProbePins | undefined>(undefined)
  if (meterRecall && meterRecall.id !== appliedRecall) {
    // Apply the entire saved setup before the meter can publish a reading for the new button state.
    setAppliedRecall(meterRecall.id)
    if (isBreadboardPin(mode, meterRecall.red, []) && isBreadboardPin(mode, meterRecall.black, [])) {
      finishEdit()
      setDragProbe(undefined)
      setMeterMode(meterRecall.mode)
      const pins = { red: meterRecall.red, black: meterRecall.black }
      recalledPins.current = pins
      setProbePins(pins)
      setChosenProbe('red')
    }
  }
  const probePointer = useRef<{ id: number; probe: Probe } | undefined>(undefined)
  const suppressClick = useRef(false)
  const meterReading = useMemo(() => measureBreadboardMeter({
    mode: meterMode, boardMode: mode, build: { parts, wires }, closed, powered, uno: unoState, ...probePins,
  }), [meterMode, mode, parts, wires, closed, powered, unoState, probePins])
  const publishProbeSetup = useEffectEvent(() => {
    onProbeSetupChange?.({ mode: meterMode, ...probePins }, recalledPins.current === probePins ? 'recall' : 'manual')
    recalledPins.current = undefined
  })
  useEffect(() => { publishProbeSetup() }, [meterMode, probePins])
  const dragged = parts.find(part => part.kind === dragging)
  const preview = hover && dragging ? droppedPart(dragging, hover, dragged)
    : hover && editing?.first ? { kind: editing.kind, pins: [editing.first, hover] as [string, string] } : undefined
  const fits = preview && canPlaceBreadboardPart(parts, wires, preview)
  const fitted: FittedPart[] = []
  for (const part of parts) fitted.push({ part, shape: mounting(part, mode, fitted.map(item => item.shape)) })

  function finishEdit() {
    setEditing(undefined)
    setDragging(undefined)
    setHover(undefined)
    setInvalid(false)
  }

  function beginDrag(event: DragEvent, kind: BreadboardPartKind) {
    if (editLocked) return
    setChosenProbe(undefined)
    setEditing(undefined)
    setDragging(kind)
    setInvalid(false)
    onBeginPartEdit?.()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', kind)
  }

  function endDrag() {
    setDragging(undefined)
    setHover(undefined)
  }

  function choose(kind: BreadboardPartKind) {
    if (editLocked) return
    setChosenProbe(undefined)
    onBeginPartEdit?.()
    setInvalid(false)
    setHover(undefined)
    setEditing(editing?.kind === kind ? undefined : { kind })
  }

  function install(candidate: BreadboardPart) {
    if (editLocked) return
    if (!canPlaceBreadboardPart(parts, wires, candidate)) {
      setInvalid(true)
      return
    }
    finishEdit()
    onInstall(candidate)
  }

  function chooseProbe(probe: Probe) {
    finishEdit()
    onBeginPartEdit?.()
    setChosenProbe(probe)
  }

  function dragProbeStart(event: DragEvent, probe: Probe) {
    chooseProbe(probe)
    setDragProbe(probe)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', probe)
  }

  function dragProbeEnd() {
    setDragProbe(undefined)
    setHover(undefined)
  }

  function probePointerStart(event: PointerEvent, probe: Probe) {
    if (event.isPrimary && event.button === 0) probePointer.current = { id: event.pointerId, probe }
  }

  function probePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const gesture = probePointer.current
    if (!gesture || gesture.id !== event.pointerId) return
    probePointer.current = undefined
    // Touch and auto-scrolling a long board can complete without native HTML drag events.
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-bread-contact]')
    const pin = target?.getAttribute('data-bread-contact')
    if (target && pin && event.currentTarget.contains(target)) {
      chooseProbe(gesture.probe)
      setProbeAt(gesture.probe, pin)
      suppressClick.current = true
    }
  }

  function setProbeAt(probe: Probe, pin: string) {
    setProbePins(previous => ({ ...previous, [probe]: pin }))
    const other = probe === 'red' ? 'black' : 'red'
    setChosenProbe(probePins[other] ? probe : other)
    setDragProbe(undefined)
    setHover(undefined)
  }

  function selectPin(pin: string) {
    if (chosenProbe) {
      setProbeAt(chosenProbe, pin)
      return
    }
    if (editLocked) return
    if (!editing) {
      setInvalid(false)
      onPin(pin)
      return
    }
    if (!isBreadboardSocket(pin) || wires.some(wire => wire.includes(pin))
      || parts.some(part => part.kind !== editing.kind && part.pins.includes(pin))) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (editing.first) install({ kind: editing.kind, pins: [editing.first, pin] })
    else setEditing({ ...editing, first: pin })
  }

  function terminal(pin: string, port = false) {
    const point = pinPoint(pin, mode)
    const mounted = parts.some(part => part.pins.includes(pin))
    const connected = wires.some(([a, b]) => a === pin || b === pin)
    const selected = selectedPin === pin || editing?.first === pin
    const label = socketLabel(pin, locale)
    const interactive = Boolean(chosenProbe) || (!editLocked && (!mounted || Boolean(editing)))
    const probeTarget = dragProbe && hover === pin ? dragProbe : undefined
    return <g key={pin} transform={`translate(${point.x} ${point.y})`} className="bread-terminal"
      data-testid={'bread-pin-' + pin} data-bread-contact={pin} data-port={port} data-mounted={mounted}
      data-connected={connected} data-selected={selected} data-probe-target={probeTarget} data-preview={preview?.pins.includes(pin) ? fits ? 'valid' : 'invalid' : undefined}
      role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label : undefined} aria-pressed={interactive ? chosenProbe ? probePins[chosenProbe] === pin : selected : undefined}
      onPointerEnter={() => { if (editing && !port) setHover(pin) }} onPointerLeave={() => { if (editing) setHover(undefined) }}
      onClick={interactive ? () => selectPin(pin) : undefined} onKeyDown={interactive ? event => onKeyActivate(event, () => selectPin(pin)) : undefined}
      onDragOver={event => { if (dragProbe || (dragging && !port)) { event.preventDefault(); setHover(pin) } }}
      onDrop={event => {
        if (dragProbe) {
          event.preventDefault()
          setProbeAt(dragProbe, pin)
          return
        }
        if (!dragging || port) return
        event.preventDefault()
        install(droppedPart(dragging, pin, dragged))
      }}>
      <title>{mounted ? label + ' · ' + t('已插入元件', 'Component fitted') : label}</title>
      <circle r={port ? 23 : 18} fill="transparent" />
      <circle className="bread-focus-ring" r={port ? 15 : 12} />
      {port ? <>
        <circle r="11" fill="#112d30" stroke="#a9c4b8" strokeWidth="2" />
        <circle r="7" fill={pin === '5V' ? '#be6445' : pin === 'GND' ? '#53696f' : '#548b89'} />
        <circle r="3.8" fill="#14262a" />
      </> : <>
        <rect x="-6.3" y="-6.3" width="12.6" height="12.6" rx="3.2" fill="#9bafa4" stroke="#f8fbef" strokeWidth="1.5" />
        <circle r="3.8" fill={mounted ? '#c5cbc1' : '#344b46'} stroke={mounted ? '#697a6e' : '#273d37'} strokeWidth="1" />
      </>}
      {(connected || selected) && <circle className="bread-plug" r={port ? 5 : 4.5} />}
    </g>
  }

  function flow(pins: string[], kind: 'current' | 'input') {
    if (!powered || tripped || pins.length < 2) return null
    return <g className={'bread-flow bread-flow-' + kind} data-testid={'bread-' + kind + '-path'} aria-hidden="true">
      {pins.slice(1).map((to, i) => <path key={i} data-from={pins[i]} data-to={to}
        d={currentTrack(pins[i], to, wires, fitted, mode)} markerEnd={url(kind + '-arrow')} />)}
    </g>
  }

  const ghost = preview && isBreadboardSocket(preview.pins[1])
    ? mounting(preview, mode, fitted.filter(item => item.part.kind !== preview.kind).map(item => item.shape)) : undefined
  const selectedLabel = editing ? partLabel(editing.kind, locale) : ''
  let instruction = t('把元件拖到孔上，或点选元件，再点两个孔。', 'Drag a part to a hole, or select a part and tap two holes.')
  if (dragging) instruction = t('松开鼠标即可插入高亮的两个孔。', 'Drop to insert its legs in the two highlighted holes.')
  if (editing) instruction = editing.first
    ? t('第一脚已选 ' + editing.first + '。点另一个孔插' + (editing.kind === 'led' ? '入阴极 K−。' : '入第二脚。'),
      'First leg at ' + editing.first + '. Tap another hole for ' + (editing.kind === 'led' ? 'the cathode K−.' : 'the second leg.'))
    : t('点一个孔放入' + selectedLabel + (editing.kind === 'led' ? '的阳极 A+。' : '的第一脚。'),
      'Tap a hole for ' + (editing.kind === 'led' ? 'the LED anode A+.' : 'the first leg of the ' + selectedLabel.toLowerCase() + '.'))
  if (invalid) instruction = t('两只脚都需要独立的空孔。换个位置，或点选元件后分别选孔。', 'Each leg needs its own free hole. Choose another spot, or select the part and pick the two holes separately.')
  if (chosenProbe) instruction = chosenProbe === 'red'
    ? t('点一个孔放红表笔。表笔可以碰到已经接线的孔。', 'Touch the red probe to a socket. Occupied sockets can be tested too.')
    : t('点一个孔放黑表笔。表笔可以碰到已经接线的孔。', 'Touch the black probe to a socket. Occupied sockets can be tested too.')
  return <div className="bread-surface" data-testid="bread-surface"
    onPointerDownCapture={() => { probePointer.current = undefined; suppressClick.current = false }}
    onPointerUp={probePointerEnd} onPointerCancel={() => { probePointer.current = undefined }}
    onClickCapture={event => { if (suppressClick.current && event.detail) { event.stopPropagation(); suppressClick.current = false } }}
    onKeyDown={event => {
    if (event.key === 'Escape') { finishEdit(); if (!editLocked) setChosenProbe(undefined) }
  }}>
    <BreadboardPartsTray parts={parts} locale={locale} chosen={dragging ?? editing?.kind} locked={editLocked}
      onChoose={choose} onDrag={beginDrag} onEnd={endDrag}
      onFlip={() => { finishEdit(); onFlipLed() }} onRemove={kind => { finishEdit(); onRemovePart(kind) }} />
    <BreadboardMeter locale={locale} mode={meterMode} pins={probePins} selected={chosenProbe} reading={meterReading}
      editLocked={editLocked} onReading={onMeterReading} recallId={appliedRecall}
      onMode={next => { setMeterMode(next); chooseProbe(chosenProbe ?? 'red') }}
      onChoose={chooseProbe} onWire={() => setChosenProbe(undefined)}
      onDrag={dragProbeStart} onEndDrag={dragProbeEnd} onPointer={probePointerStart} />
    <div className="bread-fitting-guide" data-invalid={invalid}>
      <span aria-live="polite" data-testid="bread-fitting-message">{instruction}</span>
      {editing && <button type="button" onClick={finishEdit}>{t('取消', 'Cancel')}</button>}
    </div>
    <svg viewBox="0 0 468 393" role="group" aria-label={t('可接线的面包板', 'Interactive breadboard')} aria-describedby={id + 'parts'}>
      <desc id={id + 'parts'}>{t('每一列的 A 到 E 孔相通。', 'Holes A through E are connected within each column. ')}
        {parts.map(part => partLabel(part.kind, locale) + ' ' + (part.kind === 'led' ? 'A+ ' + part.pins[0] + ' K− ' + part.pins[1] : part.pins.join(' / '))).join(' · ')}</desc>
      <defs>
        <linearGradient id={id + 'plastic'} x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#faf9e9" /><stop offset=".55" stopColor="#edf0df" /><stop offset="1" stopColor="#e2e8d6" />
        </linearGradient>
        {(['current', 'input'] as const).map(kind => <marker key={kind} id={id + kind + '-arrow'}
          viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="12" refY="4" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
          <path d="M0 0L8 4L0 8L2 4Z" fill={kind === 'current' ? '#704019' : '#004643'} stroke={kind === 'current' ? '#ffda69' : '#8dfff3'} strokeWidth="1.2" />
        </marker>)}
      </defs>
      <rect x="5" y="10" width="458" height="292" rx="15" fill="#9cafa1" />
      <rect x="5" y="5" width="458" height="292" rx="15" fill={url('plastic')} stroke="#9bad9d" strokeWidth="1.8" />
      {[[18, 18], [450, 18], [18, 284], [450, 284]].map(([x, y]) =>
        <g key={x + '-' + y} aria-hidden="true"><circle cx={x} cy={y} r="4" fill="#c8d1c0" /><path d={`M${x - 2} ${y + 1}l4 -2`} stroke="#90a190" /></g>)}
      {columns.map(column => <g key={column} data-highlight={selectedColumn === column} className="bread-strip" aria-hidden="true">
        <rect x={holeX(column) - 13} y="49" width="26" height="210" rx="12" />
        <path d={`M${holeX(column)} 64V244`} />
        <text x={holeX(column)} y="283" textAnchor="middle">{column}</text>
        <text x={holeX(column)} y="32" textAnchor="middle">{column}</text>
      </g>)}
      {rows.map((row, i) => <text key={row} x="28" y={holeY(i) + 4} className="bread-row-label" aria-hidden="true">{row}</text>)}
      <g className="bread-source" data-testid="bread-power-supply" data-tripped={tripped}>
        <rect x="6" y="315" width="456" height="71" rx="12" fill={uno ? '#1b625c' : '#304d51'} stroke={uno ? '#79b5a7' : '#80999b'} strokeWidth="1.6" />
        <path d="M22 328h15v15h-8v15m410 11h-12v-24h12" fill="none" stroke={uno ? '#5b9382' : '#567479'} strokeWidth="1.5" aria-hidden="true" />
        {ports.map(pin => <text key={pin} x={pinPoint(pin, mode).x} y="369" textAnchor="middle">
          {pin === '5V' ? '+5 V' : !uno && pin === 'GND' ? '− GND' : pin.replace('uno-', '')}</text>)}
        {!uno && <g aria-hidden="true">
          <rect x="166" y="327" width="136" height="25" rx="4" fill="#122e32" stroke="#799797" />
          <circle cx="180" cy="339" r="3.8" fill={tripped ? '#f4ac77' : powered ? '#a0f2b6' : '#637977'} />
          <text x="239" y="344" textAnchor="middle" className="bread-supply-reading">
            {tripped ? t('保护断流', 'Cut off') : powered ? '5.0 V' : '0.0 V'}</text>
          <text x="234" y="373" textAnchor="middle" className="bread-source-label">{t('直流电源', 'DC supply')}</text>
        </g>}
        {uno && <g>
          <rect x="271" y="326" width="123" height="32" rx="5" fill="#243f3f" stroke="#7fa99e" />
          <path d="M281 322v4m10 -4v4m10 -4v4m10 -4v4m10 -4v4m10 -4v4m10 -4v4m10 -4v4m10 -4v4m10 -4v4m10 -4v4" stroke="#adbcad" strokeWidth="2.2" aria-hidden="true" />
          <text x="332" y="348" textAnchor="middle">UNO R3</text>
          <text x="332" y="376" textAnchor="middle" className="bread-source-label bread-supply-reading">
            {tripped ? t('保护断流', 'Cut off') : 'Arduino'}</text>
        </g>}
      </g>
      {wires.map(([start, end], i) => {
        const d = jumperPath(pinPoint(start, mode), pinPoint(end, mode), i)
        return <g key={[start, end].join('-')} className="bread-jumper" data-wire={start + ':' + end} aria-hidden="true">
          <path className="bread-wire-shadow" d={d} /><path stroke={wireColors[i % wireColors.length]} d={d} />
        </g>
      })}
      <g className="bread-parts">
        {fitted.map(({ part, shape }) => {
          const isButton = part.kind === 'button'
          const isLed = part.kind === 'led'
          const label = partLabel(part.kind, locale)
          const moveLabel = t('移动', 'Move ') + label
          return <g key={part.kind}>
            <title>{label + ' · ' + part.pins.join(' / ')}</title>
            <path d={shape.leads} className="bread-lead" />
            <g transform={'translate(' + shape.x + ' ' + shape.y + ')'}
              data-testid={isLed ? 'bread-external-led' : undefined} data-on={isLed ? ledOn : undefined} className="bread-part-body">
              {isLed && <title>{lampText}</title>}
              <PartBody kind={part.kind} on={isButton ? closed : ledOn} />
              {isLed && <g className="bread-polarity">
                <text x="-17" y="0" textAnchor="end">{shape.firstLeft ? 'A+' : 'K−'}</text>
                <text x="17" y="0">{shape.firstLeft ? 'K−' : 'A+'}</text>
              </g>}
              <foreignObject x="-22" y="-17" width="44" height="34" data-testid={'bread-mounted-' + part.kind}
                data-pin-1={part.pins[0]} data-pin-2={part.pins[1]}>
                <button type="button" className="bread-part-handle" draggable={!editLocked} disabled={editLocked && !isButton}
                  data-testid={isButton ? 'bread-physical-switch' : 'bread-handle-' + part.kind}
                  aria-label={isButton ? switchText : moveLabel} title={isButton ? switchText : moveLabel}
                  aria-pressed={isButton ? closed : undefined}
                  onDragStart={event => beginDrag(event, part.kind)} onDragEnd={endDrag}
                  onClick={() => {
                    if (isButton) { finishEdit(); onToggle() }
                    else choose(part.kind)
                  }} />
              </foreignObject>
            </g>
          </g>
        })}
      </g>
      {preview && ghost && <g aria-hidden="true" className="bread-footprint" data-fits={fits}>
        <path d={ghost.leads} />
        <g transform={'translate(' + ghost.x + ' ' + ghost.y + ')'}>
          <PartBody kind={preview.kind} />
        </g>
      </g>}
      {flow(currentPath, 'current')}{flow(inputPath, 'input')}
      {rows.map(row => columns.map(column => terminal(row + column)))}
      {ports.map(pin => terminal(pin, true))}
      {(['red', 'black'] as const).map(probe => {
        const pin = probePins[probe]
        return pin && <BreadboardProbeLead key={probe} probe={probe} pin={pin} point={pinPoint(pin, mode)}
          locale={locale} enabled={Boolean(chosenProbe)} onChoose={chooseProbe} onDrag={dragProbeStart} onEndDrag={dragProbeEnd} onPointer={probePointerStart} />
      })}
    </svg>
    <div className="bread-legend">
      <span className="bread-strip-key" aria-hidden="true"><i /><i /><i /></span>
      <span>{t('同一列的 A–E 五个孔在板内相通。', 'The five holes A–E in each numbered column are connected inside.')}</span>
      {powered && !tripped && currentPath.length > 1 && <span className="bread-flow-key" data-kind="current">
        <i aria-hidden="true">➜</i>{t('主回路电流', 'Main circuit current')}</span>}
      {powered && !tripped && inputPath.length > 1 && <span className="bread-flow-key" data-kind="input">
        <i aria-hidden="true">➜</i>{t('D2 输入电流', 'D2 input current')}</span>}
    </div>
  </div>
}

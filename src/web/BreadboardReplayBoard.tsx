import type { BreadboardPartKind, BreadboardWire } from '../shared/breadboard'
import type { Locale } from '../shared/types'
import { mounting, pinPoint, jumperPath, rows, columns, holeX, holeY, wireColors } from './BreadboardSurface'
import { PartBody, partLabel } from './BreadboardParts'
import type { RepairChange } from './breadboardRepairHistory'
import { pinName } from './breadboardRepairLabels'
import type { RepairReplayFrame } from './breadboardRepairReplay'
import { tr } from './text'

const ports = ['uno-D2', 'GND', 'uno-D13']
const point = (pin: string) => pinPoint(pin, 'call-lamp')
const curve = ([a, b]: BreadboardWire, index: number) => jumperPath(point(a), point(b), index)
const hasEnds = (wire: BreadboardWire, a: string, b: string) => wire.includes(a) && wire.includes(b)

type ComparisonSide = 'before' | 'after'

function boardMarks(changes: readonly RepairChange[], side?: ComparisonSide) {
  const contacts = new Set<string>()
  const parts = new Set<BreadboardPartKind>()
  const wires: BreadboardWire[] = []
  const removedWires: BreadboardWire[] = []
  function markWire(pins: BreadboardWire, when: ComparisonSide) {
    if (side && side !== when) return
    for (const pin of pins) contacts.add(pin)
    if (!side && when === 'before') removedWires.push(pins)
    else wires.push(pins)
  }
  function markPart(kind: BreadboardPartKind, pins: BreadboardWire, when: ComparisonSide) {
    if (side && side !== when) return
    for (const pin of pins) contacts.add(pin)
    if (side || when === 'after') parts.add(kind)
  }
  for (const change of changes) {
    switch (change.kind) {
      case 'wire-moved':
        markWire([change.fixed, change.from], 'before')
        markWire([change.fixed, change.to], 'after')
        break
      case 'wire-added': markWire(change.pins, 'after'); break
      case 'wire-removed': markWire(change.pins, 'before'); break
      case 'part-added': markPart(change.part.kind, change.part.pins, 'after'); break
      case 'part-removed': markPart(change.part.kind, change.part.pins, 'before'); break
      case 'led-flipped':
      case 'part-moved':
        markPart(change.part, change.from, 'before')
        markPart(change.part, change.to, 'after')
        break
    }
  }
  return { contacts, parts, wires, removedWires }
}

function Probe({ color, pin }: { color: 'red' | 'black'; pin: string }) {
  const { x, y } = point(pin)
  const side = color === 'red' ? -1 : 1
  const edge = color === 'red' ? 8 : 460
  const bend = color === 'red' ? 23 : 34
  return <g className="replay-probe" data-color={color} data-testid={'bread-replay-probe-' + color} data-pin={pin}>
    <path className="replay-cable" d={`M${edge} 7 V${y - bend - 20} Q${edge} ${y - bend} ${edge - side * 18} ${y - bend} H${x + side * 34} L${x + side * 25} ${y - 17}`} />
    <g transform={`translate(${x} ${y}) scale(${side} 1)`}>
      <path className="replay-needle" d="M0 0 16 -12" /><path className="replay-grip" d="m13 -10 16 -11" /><path className="replay-guard" d="m9 -14 7 9" />
    </g>
    <circle cx={x} cy={y} r="3.7" className="replay-contact"/>
  </g>
}

type BoardProps = {
  frame: RepairReplayFrame; locale: Locale
  comparison?: { changes: readonly RepairChange[]; side: ComparisonSide }
}

export default function BreadboardReplayBoard({ frame, locale, comparison }: BoardProps) {
  const { build, bench } = frame
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const marks = boardMarks(comparison?.changes ?? frame.changes, comparison?.side)
  const label = comparison?.side === 'before' ? t('测量时的面包板', 'Breadboard at the original measurement')
    : comparison?.side === 'after' ? t('修好后复测时的面包板', 'Repaired breadboard at the retest')
    : t('这一步的面包板', 'Breadboard at this step')
  const occupied = new Set([...build.parts.flatMap(part => part.pins), ...build.wires.flat()])
  const fits: ReturnType<typeof mounting>[] = []
  function terminal(pin: string) {
    const { x, y } = point(pin)
    const lit = marks.contacts.has(pin)
    return <g key={pin} transform={`translate(${x} ${y})`} data-replay-change-pin={lit ? pin : undefined}>
      {lit && <circle className="replay-marked-hole" r="12" fill="#fff1aa" stroke="#ab6617" strokeWidth="2.8" />}
      <rect x="-6" y="-6" width="12" height="12" rx="3" fill="#a3b2a4" stroke="#f4f8ea" />
      <circle r="3.6" fill={occupied.has(pin) ? '#8b673b' : '#354944'} />
    </g>
  }
  return <svg className="repair-replay-board" viewBox="0 0 468 387" role="img" data-testid="bread-replay-board"
    aria-label={label} data-powered={bench.powered} data-pressed={bench.pressed} data-led-on={bench.ledOn}>
    <rect x="4" y="4" width="460" height="285" rx="15" fill="#edf0e0" stroke="#899f91" strokeWidth="2" />
    {columns.map(col => <g key={col} className="replay-strip">
      <rect x={holeX(col) - 13} y="46" width="26" height="218" rx="12" fill="#cfdac7" />
      <path d={'M' + holeX(col) + ' 60v188'} stroke="#b4c2aa" strokeWidth="4" />
      <text x={holeX(col)} y="31">{col}</text>
    </g>)}
    {rows.map((row, index) => <text className="replay-row" key={row} x="30" y={holeY(index) + 6}>{row}</text>)}
    <rect x="4" y="305" width="460" height="78" rx="13" fill="#235f58" stroke="#789a86" strokeWidth="2" />
    {ports.map(port => <text key={port} className="replay-port" x={point(port).x} y="370">{pinName(port)}</text>)}
    <rect x="262" y="324" width="145" height="35" rx="5" fill="#203c39" stroke="#79988a" />
    <text className="replay-port" x="334" y="348">UNO R3</text>
    {marks.removedWires.map((pins, index) => <path key={pins.join('/')} className="replay-wire-removed" d={curve(pins, index)} />)}
    {build.wires.map((wire, index) => {
      const changed = marks.wires.some(pins => hasEnds(wire, ...pins))
      const d = curve(wire, index)
      return <g key={wire.join('/')} data-replay-wire={wire.join(':')} data-replay-highlighted={changed || undefined}>
        {changed && <path d={d} className="replay-new-outline" />}
        <path d={d} fill="none" stroke={wireColors[index % wireColors.length]} strokeWidth="4.5" strokeLinecap="round"/>
      </g>
    })}
    {build.parts.map(part => {
      const shape = mounting(part, 'call-lamp', fits)
      fits.push(shape)
      const changed = marks.parts.has(part.kind)
      return <g key={part.kind} data-replay-part={part.kind} data-replay-highlighted={changed || undefined} data-pin-1={part.pins[0]} data-pin-2={part.pins[1]}>
        <title>{partLabel(part.kind, locale) + ' · ' + part.pins.join(' / ')}</title>
        <path d={shape.leads} className="bread-lead" />
        <g transform={'translate(' + shape.x + ' ' + shape.y + ')'}>
          {changed && <rect className="replay-marked-part" x="-26" y="-20" width="52" height="40" rx="9" fill="#ffe4a0" stroke="#bd852c" strokeWidth="2" />}
          <PartBody kind={part.kind} on={part.kind === 'button' ? bench.pressed : part.kind === 'led' && bench.ledOn} />
          {((part.kind === 'button' && bench.pressed === undefined) || (part.kind === 'led' && bench.ledOn === undefined)) &&
            <g className="replay-state-unknown"><circle r="10" cy="-1" /><text y="5" textAnchor="middle">?</text></g>}
          {part.kind === 'led' && <g className="bread-polarity">
            <text x="-16" y="-3" textAnchor="end">{shape.firstLeft ? 'A+' : 'K−'}</text>
            <text x="16" y="-3">{shape.firstLeft ? 'K−' : 'A+'}</text>
          </g>}
        </g>
      </g>
    })}
    {rows.map(row => columns.map(col => terminal(row + col)))}{ports.map(terminal)}
    {bench.red && <Probe color="red" pin={bench.red} />}
    {bench.black && <Probe color="black" pin={bench.black} />}
  </svg>
}

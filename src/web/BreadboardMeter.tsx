import { useEffect, useRef, type DragEvent, type PointerEvent } from 'react'
import type { MeterMode, MeterReading } from '../engine/breadboardMeter'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './breadboard-meter.css'

export type Probe = 'red' | 'black'
export type ProbePins = Partial<Record<Probe, string>>
export type BreadboardMeterSample = { mode: MeterMode; red: string; black: string; reading: MeterReading }
export type BreadboardMeterRecall = { id: number; red: string; black: string; mode: MeterMode }

type Props = {
  locale: Locale; mode: MeterMode; reading: MeterReading; pins: ProbePins; selected?: Probe; editLocked?: boolean
  onMode: (mode: MeterMode) => void; onChoose: (probe: Probe) => void; onWire: () => void
  onDrag: (event: DragEvent, probe: Probe) => void; onEndDrag: () => void
  onPointer: (event: PointerEvent, probe: Probe) => void
  onReading?: (sample: BreadboardMeterSample | undefined) => void
  recallId?: number
}

export function meterDisplay(reading: MeterReading, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  switch (reading.kind) {
    case 'continuity': return reading.connected
      ? { value: t('相通', 'Connected'), note: t('两支表笔之间有直接通路。', 'A direct connection joins the probe tips.') }
      : { value: t('未直通', 'No continuity'), note: t('两点之间没有低电阻通路。电流经过电阻或 LED 时，也可能出现这个读数。', 'There is no low-resistance path. A resistor or LED can carry current and still give this reading.') }
    case 'voltage': return {
      value: (reading.volts < 0 ? '−' : '') + Math.abs(reading.volts).toFixed(1) + ' V',
      note: reading.volts < 0 ? t('红笔这边的电位比黑笔低。', 'The red tip is at a lower potential than the black tip.')
        : reading.volts > 0 ? t('红笔这边的电位比黑笔高。', 'The red tip is at a higher potential than the black tip.')
        : t('两支表笔所在处电位相同。', 'Both tips are at the same potential.'),
    }
    case 'place-probes': return { value: '—', note: t('拖动红笔和黑笔到孔上，也可以点选表笔再点孔。', 'Drag each probe to a socket, or select a probe and tap a socket.') }
    case 'power-off-first': return { value: '—', note: t('先断电，再用通断档测量。', 'Switch off board power before testing continuity.') }
    case 'unpowered': return { value: '—', note: t('面包板已断电。通电后测量电压。', 'The board is off. Power it on to measure voltage.') }
    case 'protected': return { value: '—', note: t('电源保护已切断输出。断电后检查接线。', 'The supply cut its output. Switch off and check the wiring.') }
    case 'floating': return { value: t('悬空', 'Floating'), note: t('测点之间的电压还不确定。', 'The voltage between these points is undetermined.') }
  }
}

function ProbeIcon({ probe }: { probe: Probe }) {
  return <svg viewBox="0 0 43 20" aria-hidden="true" focusable="false">
    <path d="M3 17 14 12" stroke="#dbe2dd" strokeWidth="2.3" strokeLinecap="round" />
    <path d="m13 12 15-7" stroke={probe === 'red' ? '#e56851' : '#333e45'} strokeWidth="7" strokeLinecap="round" />
    <path d="m13 8 3 7" stroke={probe === 'red' ? '#f78e76' : '#87939b'} strokeWidth="3.5" strokeLinecap="round" />
    <path d="m26 6 4-2q4-2 7 2l4 4" fill="none" stroke={probe === 'red' ? '#c64536' : '#47575d'} strokeWidth="3" strokeLinecap="round" />
  </svg>
}

export function BreadboardMeter({ locale, mode, reading, pins, selected, editLocked, onMode, onChoose, onWire, onDrag, onEndDrag, onPointer, onReading, recallId }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { value, note } = meterDisplay(reading, locale)
  const lastSample = useRef<string | null>(null)
  useEffect(() => {
    if (!selected || !pins.red || !pins.black || !['voltage', 'continuity', 'floating'].includes(reading.kind)) {
      if (lastSample.current !== '') onReading?.(undefined)
      lastSample.current = ''
      return
    }
    const sample = { mode, red: pins.red, black: pins.black, reading }
    const signature = JSON.stringify([recallId, sample])
    if (signature !== lastSample.current) {
      lastSample.current = signature
      onReading?.(sample)
    }
  }, [mode, pins, reading, onReading, selected, recallId])

  return <section className="bread-meter" data-testid="bread-meter" aria-label={t('万用表', 'Multimeter')}>
    <div className="bread-meter-head">
      <h3>{t('万用表', 'Multimeter')}</h3>
      <div className="bread-meter-modes" role="group" aria-label={t('测量档位', 'Meter setting')}>
        <button type="button" data-testid="bread-meter-continuity" aria-pressed={mode === 'continuity'}
          onClick={() => onMode('continuity')}>{t('通断', 'Continuity')}</button>
        <button type="button" data-testid="bread-meter-voltage" aria-pressed={mode === 'voltage'}
          onClick={() => onMode('voltage')}>{t('直流电压', 'DC voltage')}</button>
      </div>
    </div>
    <div className="bread-meter-face">
      <div className="bread-meter-lcd" role="status" data-kind={reading.kind} data-testid="bread-meter-reading">
        <span>{mode === 'continuity' ? t('通断档', 'Continuity') : t('电压档 · 直流', 'Voltage · DC')}</span>
        <strong>{value}</strong>
      </div>
      <div className="bread-meter-probes">
        {(['red', 'black'] as const).map(probe => {
          const name = probe === 'red' ? t('红表笔', 'Red probe') : t('黑表笔', 'Black probe')
          return <button key={probe} type="button" draggable data-testid={'bread-probe-' + probe}
            className="bread-meter-probe" data-color={probe} aria-pressed={selected === probe}
            aria-label={name + ' · ' + (pins[probe] ?? t('待放置', 'Unplaced'))}
            onPointerDown={event => onPointer(event, probe)}
            onDragStart={event => onDrag(event, probe)} onDragEnd={onEndDrag} onClick={() => onChoose(probe)}>
            <ProbeIcon probe={probe} /><span><b>{name}</b> <small>{pins[probe]?.replace('uno-', '') ?? t('待放置', 'Unplaced')}</small></span>
          </button>
        })}
      </div>
    </div>
    <div className="bread-meter-footer">
      <p role="status">{note}</p>
      {selected && !editLocked && <button type="button" data-testid="bread-meter-wiring" onClick={onWire}>{t('返回接线', 'Back to wiring')}</button>}
    </div>
  </section>
}

type Point = { x: number; y: number }

type LeadProps = {
  probe: Probe; point: Point; pin: string; locale: Locale; enabled: boolean
  onChoose: (probe: Probe) => void; onDrag: (event: DragEvent, probe: Probe) => void; onEndDrag: () => void
  onPointer: (event: PointerEvent, probe: Probe) => void
}

export function BreadboardProbeLead({ probe, point, pin, locale, enabled, onChoose, onDrag, onEndDrag, onPointer }: LeadProps) {
  const red = probe === 'red'
  const edge = red ? 18 : 450
  const dx = red ? -1 : 1
  const { x, y } = point
  const wire = `M${edge} 0 V${Math.max(12, y - 46)} Q${edge} ${y - 24} ${edge - dx * 18} ${y - 24} T${x + dx * 32} ${y - 24}`
  return <g className="bread-probe-lead" data-probe={probe} data-pin={pin} data-testid={'bread-probe-tip-' + probe}>
    <path aria-hidden="true" className="bread-probe-cable-outline" d={wire} /><path aria-hidden="true" className="bread-probe-cable" d={wire} />
    <g aria-hidden="true" transform={`translate(${x} ${y}) scale(${dx} 1)`}>
      <path d="M0 0 14 -10" className="bread-probe-needle" />
      <path d="m12 -9 20 -15" className="bread-probe-grip" />
      <path d="m9 -13 6 8" className="bread-probe-guard" />
    </g>
    <circle cx={x} cy={y} r="3" className="bread-probe-contact" />
    {enabled && <foreignObject x={x + dx * 23 - 8} y={y - 25} width="16" height="14">
      <button type="button" className="bread-probe-handle" draggable data-testid={'bread-probe-handle-' + probe}
        aria-label={(red ? tr(locale, '移动红表笔', 'Move red probe') : tr(locale, '移动黑表笔', 'Move black probe')) + ' · ' + pin}
        onPointerDown={event => onPointer(event, probe)}
        onClick={() => onChoose(probe)} onDragStart={event => onDrag(event, probe)} onDragEnd={onEndDrag} />
    </foreignObject>}
  </g>
}

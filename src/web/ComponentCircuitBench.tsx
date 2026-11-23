import { useId } from 'react'
import { componentReading } from '../engine/circuit'
import type { Bit, ComponentCircuitMode } from '../shared/hardware'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './component-circuit.css'

export default function ComponentCircuitBench({ mode, bits, locale, onFlip }: {
  mode: ComponentCircuitMode; bits: Bit[]; locale: Locale; onFlip: (index: number) => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const id = useId()
  const diode = mode === 'diode'
  const { output, switchClosed, diodeForward, baseHigh } = componentReading(mode, bits)
  const controlName = diode ? t('二极管方向', 'Diode direction') : t('基极输入', 'Base input')
  const controlState = diode ? (diodeForward ? t('正向', 'Forward') : t('反向', 'Reverse')) : (baseHigh ? 'HIGH' : 'LOW')
  const loadName = diode ? t('回路开关', 'Circuit switch') : t('灯支路开关', 'Lamp switch')
  const switchState = switchClosed ? t('闭合', 'Closed') : t('断开', 'Open')
  const lamp = output ? t('LED 亮', 'LED on') : t('LED 灭', 'LED off')
  const title = diode ? t('二极管回路', 'Diode circuit') : t('三极管开关', 'Transistor switch')
  const observation = !switchClosed
    ? (baseHigh ? t('基极已有电流。灯支路的开关断开，电流经过不了 LED。', 'Base current is flowing. The open lamp switch keeps current from reaching the LED.')
      : t('开关处有缺口，电流经过不了 LED。', 'The gap at the switch breaks the path through the LED.'))
    : diode ? (diodeForward ? t('电流从电源正极出发，经过 LED，从 A 流向带环的 K 端，再回到负极。', 'Current leaves +, passes through the LED, flows from A to the banded K end of the diode, and returns to −.')
      : t('开关已闭合，二极管带环的 K 端朝向电源正极，挡住了灯支路的电流。', 'The switch is closed. The banded K end faces the positive supply and blocks current through the lamp.'))
    : (baseHigh ? t('基极有了电流，集电极 C 到发射极 E 导通，LED 亮了。', 'Base current switches on the path from collector C to emitter E. The LED lights up.')
      : t('基极是 LOW，三极管截止。灯支路的开关虽然闭合，LED 仍熄灭。', 'The base is LOW and the transistor is off. The lamp switch is closed, but the LED stays dark.'))

  return <section className="panel circuit-panel component-bench" data-testid="component-bench" data-mode={mode}>
    <header className="component-bench-header"><h2>{title}</h2>
      <strong className="component-output" data-testid="component-lamp" data-output={output}>
        <span aria-hidden="true" />{lamp}
      </strong>
    </header>
    <svg className="component-schematic" viewBox="0 0 448 252" role="img"
      aria-labelledby={id + '-title ' + id + '-desc'} data-lit={output === 1}>
      <title id={id + '-title'}>{title}</title>
      <desc id={id + '-desc'}>{loadName} · {switchState} / {controlName} · {controlState} / {lamp}. {observation}</desc>
      <defs>
        <pattern id={id + '-dots'} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#c0ccc9" />
        </pattern>
      </defs>
      <rect width="448" height="252" fill={'url(#' + id + '-dots)'} />
      <g className="component-trace">
        <path d="M48 122V68H92 M152 68H185 M251 68H293 M316 68H366" />
        <path d={diode ? 'M366 68V192H245 M179 192H48V138' : 'M366 68V128 M366 206V221H48V138'} />
      </g>
      {!!output && <g className="component-flow" aria-hidden="true">
        <path d="M48 122V68H92 M152 68H185 M251 68H293 M316 68H366" />
        <path d={diode ? 'M366 68V192H245 M179 192H48V138' : 'M366 68V128 M366 206V221H48V138'} />
        <polygon points="273,62 282,68 273,74" />
        <polygon points={diode ? '89,186 80,192 89,198' : '89,215 80,221 89,227'} />
      </g>}
      <g className="component-device">
        <path d="M30 122H66 M38 138H58" />
        <text x="18" y="116">+</text><text x="18" y="148">−</text>
        <text x="73" y="135">5 V</text>
        <text x="122" y="33" textAnchor="middle">S1</text>
        <path d={switchClosed ? 'M92 68H152' : 'M92 68L144 43'} />
        <circle cx="92" cy="68" r="4" /><circle cx="152" cy="68" r="4" />
        <text x="218" y="43" textAnchor="middle">330 Ω</text>
        <path className="component-resistor" d="M185 68L190 60L198 76L206 60L214 76L222 60L230 76L238 60L246 76L251 68" />
        <text x="218" y="101" textAnchor="middle">{t('限流电阻', 'Resistor')}</text>
        <text x="305" y="101" textAnchor="middle">LED</text>
        <path className="component-led" d="M293 57L314 68L293 79Z" />
        <path d="M316 55V81" />
        <g className="component-rays"><path d="M299 51L308 39M302 41L308 39L308 45 M311 53L322 39M316 41L322 39L322 45" /></g>
      </g>
      {diode ? <g className="component-device">
        <rect x="179" y="181" width="66" height="22" rx="7" className="component-diode" />
        <rect x={diodeForward ? 187 : 230} y="182" width="7" height="20" rx="1" className="component-band" />
        <text x="167" y="170" textAnchor="middle">{diodeForward ? 'K' : 'A'}</text>
        <text x="256" y="170" textAnchor="middle">{diodeForward ? 'A' : 'K'}</text>
        <text x="212" y="230" textAnchor="middle">{t('带环端是阴极 K', 'Band = cathode K')}</text>
      </g> : <g className="component-device">
        <path className="component-trace" d="M130 181V221 M155 167H182 M238 167H325" />
        <path className="component-resistor" d="M182 167L187 159L195 175L203 159L211 175L219 159L227 175L234 159L238 167" />
        <text x="211" y="142" textAnchor="middle">4.7 kΩ</text>
        <rect x="103" y="153" width="52" height="28" rx="5" className="component-driver" />
        <text x="129" y="172" textAnchor="middle">{baseHigh ? 'HIGH' : 'LOW'}</text>
        <circle cx="347" cy="167" r="37" className="component-transistor" />
        <path d="M310 167H327 M327 148V185 M328 158L366 135V128 M328 177L366 200V206" />
        {!!baseHigh && <path className="component-base-flow" d="M155 167H182 M238 167H327V177L366 200V221H130V181" />}
        <path d="M354 198L364 199L359 190" />
        <text x="383" y="132">C</text><text x="294" y="156">B</text><text x="383" y="207">E</text>
        <circle cx="130" cy="221" r="3" /><path d="M130 221V229 M119 229H141 M123 234H137 M127 239H133" />
        <text x="147" y="242">GND</text>
      </g>}
    </svg>
    <div className="component-controls" role="group" aria-label={t('实验台控制', 'Bench controls')}>
      <button type="button" className="component-control" data-testid="component-switch"
        aria-pressed={switchClosed === 1} onClick={() => onFlip(0)}>
        <span>{loadName} S1</span><strong>{switchState}</strong>
      </button>
      <button type="button" className="component-control" data-testid="component-control"
        aria-pressed={bits[1] === 1} onClick={() => onFlip(1)}>
        <span>{diode ? t('翻转二极管', 'Flip diode') : t('切换基极输入', 'Toggle base input')}</span><strong>{controlState}</strong>
      </button>
    </div>
    <p className="component-reading" aria-live="polite" data-testid="component-current">{observation}</p>
  </section>
}

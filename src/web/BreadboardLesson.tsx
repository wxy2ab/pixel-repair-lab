import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { ArduinoSketch } from '../shared/arduino'
import { breadboardFaultBuild, canAddBreadboardWire, canPlaceBreadboardPart, type BreadboardBuild, type BreadboardLevel,
  type BreadboardPart, type BreadboardPartKind, type BreadboardWire } from '../shared/breadboard'
import type { Locale } from '../shared/types'
import { buildUnoProgram, powerOnUno, type UnoProgram, type UnoState } from '../engine/arduino'
import { breadboardWorks, readBreadboard, stepBreadboardUno, type BreadboardReading } from '../engine/breadboard'
import { measureBreadboardMeter, type MeterMode } from '../engine/breadboardMeter'
import BreadboardSurface, { socketLabel } from './BreadboardSurface'
import BreadboardRepairCard from './BreadboardRepairCard'
import type { BreadboardMeterRecall, BreadboardMeterSample, ProbePins } from './BreadboardMeter'
import { RepairReadingComparison, RepairReportHistory } from './BreadboardRepairReport'
import { compareRepairBoards, type RepairObservation } from './breadboardRepairHistory'
import type { RepairReplayBench } from './breadboardRepairReplay'
import { newRepairTicket, openRepairTicket, repairEvidence, type RepairTicket } from './breadboardRepairTicket'
import { retestRepairNote } from './breadboardRepairRetest'
import { useBreadboardRepair } from './useBreadboardRepair'
import { CommandDesk } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { tr } from './text'
import { boardForArduino, initialBreadboardBuild, readBreadboardDraft, saveBreadboardDraft } from './breadboardDraft'
import './arduino-lesson.css'
import './breadboard-lesson.css'

type Translate = (zh: string, en: string) => string
type Observation = { ledOn: boolean; prediction?: boolean; d2?: number | null; d13?: number }
type Records = { open?: Observation; closed?: Observation }
type ProbeSetup = ProbePins & { mode: MeterMode }
type Trial = {
  uno: UnoState
  records: Records
  sampledWhenClosed?: boolean
  lastWritePressed?: boolean
  guess?: { closed: boolean; on: boolean; actual?: boolean }
}

function freshTrial(records: Records = {}): Trial {
  return { uno: powerOnUno(), records }
}

// A switch change between digitalRead and digitalWrite doesn't test the new position.
function advance(trial: Trial, program: UnoProgram, { wires, parts }: BreadboardBuild, closed: boolean): Trial {
  const op = program.steps[trial.uno.next].instruction.op
  const uno = stepBreadboardUno(program, trial.uno, wires, closed, parts)
  const next = { ...trial, uno }
  if (op === 'read') next.sampledWhenClosed = closed
  if (op === 'writeCondition') next.lastWritePressed = trial.sampledWhenClosed
  if (op === 'writeCondition' && trial.sampledWhenClosed === closed) {
    const { ledOn } = readBreadboard('call-lamp', wires, closed, uno, parts)
    next.records = { ...trial.records, [closed ? 'closed' : 'open']: { ledOn, d2: uno.sample, d13: uno.led } }
    if (trial.guess && trial.guess.closed === closed && trial.guess.actual === undefined) {
      next.guess = { ...trial.guess, actual: ledOn }
    }
  }
  return next
}

function faultDescription(fault: BreadboardReading['fault'], t: Translate) {
  switch (fault) {
    case 'short': return t('两端之间出现了短路，模拟电源已保护。断电，找找哪根导线让电流抄了近路。', 'There is a short circuit. The simulated supply has cut the current. Switch off and look for a wire that makes a shortcut.')
    case 'unprotected': return t('通往 LED 的路绕开了限流电阻，保护装置阻止了电流。断电后沿导线找一找。', 'The path through the LED skips the resistor. Protection stopped the current. Switch off and trace the wires.')
    case 'reversed': return t('电流遇到了 LED 的反方向，灯没有亮。看看 LED 的 A 端和 K 端朝向哪里。', 'The LED faces against the current and stays dark. Look at its A and K ends.')
    case 'open': return t('电流经过 LED 的路没有接通。顺着元件和导线找找，哪里还有缺口？', 'The path through the LED is open. Follow the parts and wires to find the gap.')
    default: return ''
  }
}

type LessonProps = {
  level: BreadboardLevel; locale: Locale; sketch?: ArduinoSketch; onComplete: () => void; onMistake?: () => void
  sourceLevel?: BreadboardLevel; onHandoff?: (build: BreadboardBuild) => void; preview?: boolean
  onOpenRepair?: () => void
}

export default function BreadboardLesson(props: LessonProps) {
  const [ticket, setTicket] = useState(() => openRepairTicket(props.level, !!props.preview))
  function nextTicket() {
    if (ticket && props.level.board.faults?.length) {
      setTicket(newRepairTicket(props.level, (ticket.index + 1) % props.level.board.faults.length))
    }
  }
  return <BreadboardWorkbench key={ticket?.id ?? 'build'} {...props} ticket={ticket} onNextTicket={nextTicket} />
}

function BreadboardWorkbench({ level, locale, sketch, onComplete, onMistake, sourceLevel, onHandoff, onOpenRepair,
  ticket, onNextTicket, preview = false }: LessonProps & {
  ticket?: RepairTicket; onNextTicket: () => void
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const { board } = level
  const arduino = board.mode === 'call-lamp'
  const program = useMemo(() => arduino && sketch?.mode === 'button' ? buildUnoProgram(sketch) : undefined, [arduino, sketch])
  const [fromSeries] = useState(() => {
    if (preview || !sourceLevel) return
    const saved = readBreadboardDraft(sourceLevel)
    if (!saved) return
    const transferred = boardForArduino(saved)
    return transferred.parts.length || transferred.wires.length ? transferred : undefined
  })
  const [build, setBuild] = useState(() => ticket?.build ?? (preview ? undefined : readBreadboardDraft(level))
    ?? fromSeries ?? initialBreadboardBuild(level))
  const { parts, wires } = build
  const fault = ticket && board.faults?.[ticket.index]
  const faultBoard = useMemo(() => fault && breadboardFaultBuild(level, fault), [fault, level])
  const repair = useBreadboardRepair(level, ticket, preview, faultBoard, build)
  const { original, notes, diagnosis } = repair
  const [sample, setSample] = useState<BreadboardMeterSample>()
  const [meterRecall, setMeterRecall] = useState<BreadboardMeterRecall>()
  const liveProbes = useRef<ProbeSetup>({ mode: 'continuity' })
  const lastTest = useRef<(RepairObservation & { pressed: boolean }) | undefined>(undefined)
  const recallCounter = useRef(0)
  const [unavailableIndex, setUnavailableIndex] = useState<number>()
  const [reportRequest, setReportRequest] = useState<{ id: string; sequence: number }>()
  const editLocked = !!fault && !diagnosis
  const [surfaceVersion, setSurfaceVersion] = useState(0)
  const [selectedPin, setSelectedPin] = useState<string>()
  const [badWire, setBadWire] = useState(false)
  const [closed, setClosed] = useState(false)
  const [prediction, setPrediction] = useState<boolean>()
  const [powered, setPowered] = useState(false)
  const [running, setRunning] = useState(false)
  const [trial, setTrial] = useState<Trial>(() => freshTrial(repair.report?.validation))
  const [checked, setChecked] = useState<boolean>()
  const [canTakeBoard, setCanTakeBoard] = useState(false)
  const reading = powered ? readBreadboard(board.mode, wires, closed, trial.uno, parts) : undefined
  const protectedCircuit = reading?.fault === 'short' || reading?.fault === 'unprotected'

  function captureBench({ circuit = build, pressed = closed, on = powered, uno = trial.uno, probes = liveProbes.current }: {
    circuit?: BreadboardBuild; pressed?: boolean; on?: boolean; uno?: UnoState; probes?: ProbeSetup
  } = {}): RepairReplayBench {
    const signals = on ? readBreadboard(board.mode, circuit.wires, pressed, uno, circuit.parts) : undefined
    return { pressed, powered: on, ledOn: signals?.ledOn ?? false, d2: signals?.d2 ?? null,
      d13: on && uno.output ? uno.led : null, ...probes,
      reading: measureBreadboardMeter({ boardMode: board.mode, build: circuit, closed: pressed, powered: on, uno, ...probes }) }
  }

  function evidenceAt(bench: RepairReplayBench) {
    const { red, black, mode, reading } = bench
    if (!red || !black || !mode || !reading) return
    return repairEvidence({ red, black, mode, reading },
      bench.pressed, bench.powered && trial.uno.output ? trial.uno.led : undefined, trial.uno.pullup, trial.lastWritePressed)
  }

  function probeSetupChanged(probes: ProbeSetup, origin: 'manual' | 'recall') {
    const previous = liveProbes.current
    liveProbes.current = probes
    if (!ticket || origin === 'recall' || !probes.red || !probes.black
      || (probes.red === previous.red && probes.black === previous.black && probes.mode === previous.mode)) return
    const bench = captureBench({ probes })
    const note = evidenceAt(bench)
    if (note) repair.measured(note, bench)
  }

  function recordMeasurement() {
    const bench = captureBench()
    const note = evidenceAt(bench)
    if (note) repair.record(note, bench)
  }

  function stepProgram() {
    if (!program) return
    const next = advance(trial, program, build, closed)
    setTrial(next)
    const observed = next.records[closed ? 'closed' : 'open']
    if (!ticket || next.records === trial.records || !observed || observed.d2 == null || observed.d13 === undefined) return
    const last = lastTest.current
    if (last?.pressed === closed && last.d2 === observed.d2 && last.d13 === observed.d13 && last.ledOn === observed.ledOn) return
    const observation = { ledOn: observed.ledOn, d2: observed.d2, d13: observed.d13 }
    lastTest.current = { pressed: closed, ...observation }
    repair.tested(observation, captureBench({ uno: next.uno }))
  }

  const tick = useEffectEvent(() => {
    if (running && powered && !protectedCircuit) stepProgram()
  })
  useEffect(() => {
    if (!running || !powered || !program || protectedCircuit) return
    const timer = window.setTimeout(tick, 350)
    return () => window.clearTimeout(timer)
  }, [running, powered, program, protectedCircuit, build, closed, trial.uno.next])

  function disconnect(records = trial.records) {
    lastTest.current = undefined
    setRunning(false)
    setPowered(false)
    setPrediction(undefined)
    setChecked(undefined)
    setTrial(freshTrial(records))
  }

  function changeBuild(next: BreadboardBuild, reset = false, nextClosed = closed) {
    if (ticket && !reset && !compareRepairBoards(build, next).length) {
      setBuild(next)
      return
    }
    disconnect({})
    if (ticket) repair.edited(next, captureBench(), captureBench({ circuit: next, pressed: nextClosed, on: false }), reset)
    setMeterRecall(undefined)
    setUnavailableIndex(undefined)
    setReportRequest(undefined)
    setCanTakeBoard(false)
    setSelectedPin(undefined)
    setBadWire(false)
    setBuild(next)
    if (!preview && !ticket) saveBreadboardDraft(level, next)
  }

  function loadBuild(next: BreadboardBuild, reset = false) {
    changeBuild(next, reset, false)
    liveProbes.current = { mode: 'continuity' }
    setClosed(false)
    setSurfaceVersion(version => version + 1)
  }

  function resetBoard() {
    setSample(undefined)
    loadBuild(faultBoard ?? initialBreadboardBuild(level), true)
  }

  function replaceWires(next: BreadboardWire[]) {
    changeBuild({ parts, wires: next })
  }

  function install(part: BreadboardPart) {
    if (!canPlaceBreadboardPart(parts, wires, part)) return
    const nextParts = parts.some(existing => existing.kind === part.kind)
      ? parts.map(existing => existing.kind === part.kind ? part : existing) : [...parts, part]
    changeBuild({ parts: nextParts, wires }, false, part.kind === 'button' ? false : closed)
    if (part.kind === 'button') setClosed(false)
  }

  function removePart(kind: BreadboardPartKind) {
    changeBuild({ parts: parts.filter(existing => existing.kind !== kind), wires }, false, kind === 'button' ? false : closed)
    if (kind === 'button') setClosed(false)
  }

  function flipLed() {
    const led = parts.find(part => part.kind === 'led')
    if (led) install({ kind: 'led', pins: [led.pins[1], led.pins[0]] })
  }

  function visitPin(pin: string) {
    setBadWire(false)
    if (!selectedPin || selectedPin === pin) {
      setSelectedPin(selectedPin === pin ? undefined : pin)
      return
    }
    const wire: BreadboardWire = [selectedPin, pin]
    if (!canAddBreadboardWire(board.mode, wires, wire, parts)) {
      setSelectedPin(undefined)
      setBadWire(true)
      return
    }
    replaceWires([...wires, wire])
  }

  function toggleContact() {
    lastTest.current = undefined
    if (ticket) repair.switched('button', captureBench({ pressed: !closed }))
    if (!arduino || !powered) disconnect()
    setClosed(!closed)
    setSelectedPin(undefined)
    setBadWire(false)
  }

  function power() {
    if (powered) {
      if (ticket) repair.switched('power', captureBench({ on: false }))
      disconnect()
      return
    }
    if ((!fault && prediction === undefined) || (arduino && !program)) return
    const start = freshTrial(trial.records)
    if (ticket) repair.switched('power', captureBench({ on: true, uno: start.uno }))
    if (arduino) {
      if (prediction !== undefined) start.guess = { closed, on: prediction }
    } else {
      const { ledOn } = readBreadboard(board.mode, wires, closed, undefined, parts)
      start.guess = { closed, on: prediction!, actual: ledOn }
      start.records = { ...trial.records, [closed ? 'closed' : 'open']: { ledOn, prediction } }
    }
    setSelectedPin(undefined)
    setBadWire(false)
    setChecked(undefined)
    setTrial(start)
    setPowered(true)
  }

  function check() {
    const { records, guess } = trial
    const expectedResults = records.closed?.ledOn === true && records.open?.ledOn === false
    const matched = arduino
      ? (fault ? diagnosis === fault.kind && notes.length > 0 : guess?.actual !== undefined && guess.actual === guess.on)
        && records.closed?.d2 === 0 && records.open?.d2 === 1 && records.closed.d13 === 1 && records.open.d13 === 0
      : records.closed?.prediction === true && records.open?.prediction === false
    const passed = expectedResults && matched && breadboardWorks(board.mode, wires, sketch, parts)
    setRunning(false)
    setChecked(passed)
    if (passed) {
      if (fault && records.open && records.closed) {
        const { open, closed: pressed } = records
        if (open.d2 != null && open.d13 != null && pressed.d2 != null && pressed.d13 != null) {
          repair.check(true, captureBench(), { open: { ledOn: open.ledOn, d2: open.d2, d13: open.d13 },
            closed: { ledOn: pressed.ledOn, d2: pressed.d2, d13: pressed.d13 } })
        }
      }
      if (!arduino) setCanTakeBoard(true)
      onComplete()
    }
    else {
      if (fault) repair.check(false, captureBench())
      onMistake?.()
    }
  }

  function retest(index: number) {
    const before = repair.readings[index]?.before
    if (!before || !program || original) return
    const result = retestRepairNote(before, build, program, faultBoard)
    const probes: ProbeSetup = { mode: result.mode, red: before.red, black: before.black }
    liveProbes.current = probes
    lastTest.current = undefined
    setRunning(false)
    setPowered(result.powered)
    setClosed(before.pressed)
    setPrediction(undefined)
    setTrial({ uno: result.uno, records: trial.records, sampledWhenClosed: result.drivenBy, lastWritePressed: result.drivenBy })
    setSelectedPin(undefined)
    setBadWire(false)
    setMeterRecall({ id: ++recallCounter.current, mode: result.mode, red: before.red, black: before.black })
    setUnavailableIndex(result.after ? undefined : index)
    repair.retested(index, result.after,
      captureBench({ probes, pressed: before.pressed, on: result.powered, uno: result.uno }))
  }

  function openReport() {
    const id = repair.report?.id
    if (id) setReportRequest(previous => ({ id, sequence: (previous?.sequence ?? 0) + 1 }))
  }

  const position = (isClosed: boolean) => arduino
    ? isClosed ? t('按下', 'Pressed') : t('松开', 'Released')
    : isClosed ? t('闭合', 'Closed') : t('断开', 'Open')
  const lamp = (on: boolean) => on ? t('亮', 'On') : t('灭', 'Off')
  const signal = (value: number | null | undefined) => value == null ? '—' : value ? 'HIGH · 1' : 'LOW · 0'
  const guess = trial.guess
  const hasBoth = trial.records.open !== undefined && trial.records.closed !== undefined
  const mayCheck = hasBoth && (fault ? !!diagnosis && notes.length > 0 : !arduino || guess?.actual !== undefined)
  const verified = !!repair.report || checked === true
  const matchesSeriesBoard = useMemo(() => fromSeries && JSON.stringify(fromSeries) === JSON.stringify(build), [fromSeries, build])
  const led = parts.find(part => part.kind === 'led')
  const pathMessage = !reading ? t('断电', 'Power off')
    : reading.ledOn ? t('LED 亮了。沿着流动的标记，看看电流经过哪些元件再返回。', 'The LED is on. Follow the moving marks through the parts and back to the source.')
    : protectedCircuit ? faultDescription(reading.fault, t)
    : fault ? t('外接灯灭。可以对照表笔的读数和 D13 的输出。', 'The external light is off. Compare your meter reading with the D13 output.')
    : !led ? t('LED 还在元件盒里。把它的两条腿插到板上，再观察灯光。', 'The LED is in the parts box. Insert its two legs in the board to test the light.')
    : led.pins[0][1] === led.pins[1][1] ? t(
      'LED 的两只脚都在第 ' + led.pins[0][1] + ' 列。它们接在同一片金属上，两端没有电压差，灯不会亮。',
      'Both LED legs are on strip ' + led.pins[0][1] + '. They touch the same piece of metal. There is no voltage difference across the LED, so it stays dark.')
    : reading.currentPath.length ? t('电流绕过了灯。沿着流动的标记，看看 LED 的两端连到了哪里。', 'Current is bypassing the LED. Follow the moving marks and check where its two legs connect.')
    : arduino && !trial.uno.output ? t('等待程序设置 D13。', 'Waiting for the sketch to configure D13.')
    : arduino && !trial.uno.led ? t('D13 输出 LOW，外接 LED 熄灭。', 'D13 is LOW. The external LED is off.')
    : !arduino && !closed && reading.fault === 'open' ? t('开关处断开了，电流无法绕完一圈。', 'The open switch breaks the circuit.')
    : faultDescription(reading.fault, t) || t('外接 LED 熄灭。', 'The external LED is off.')

  function retryMessage() {
    if (arduino && (trial.records.open?.d2 !== 1 || trial.records.closed?.d2 !== 0)) {
      return t('看看两次记录的 D2 读数。按下和松开按钮时，程序读到变化了吗？', 'Look at the two D2 readings. Did the input change when you pressed and released the button?')
    }
    if (!trial.records.closed?.ledOn || trial.records.open?.ledOn) {
      const isClosed = !trial.records.closed?.ledOn
      return position(isClosed) + t('时的灯光和任务不同。沿着这次的电流标记检查接线。', ' gave a different light from the task. Check the wiring for that position.')
    }
    if (fault && diagnosis !== fault.kind) return t('两种灯光都正确了。回看修理前的读数和你改过的地方，再核对工单上的判断。', 'Both light checks passed. Look back at your original reading and what you changed, then review your diagnosis.')
    const wrongPrediction = arduino ? guess?.on !== guess?.actual :
      trial.records.open?.prediction !== false || trial.records.closed?.prediction !== true
    if (wrongPrediction) return t('灯已经能按要求亮灭。回看两次实测，断电后重新预测，再通电试一次。', 'The LED switches correctly. Review the two readings, power off, make a new prediction, then test again.')
    return t('看看电流在每种状态下经过哪些元件。改线后重新测两次。', 'Trace which parts the current passes through in each position. Test both again after rewiring.')
  }

  return <div className="classroom-split breadboard-lesson">
    <DeviceWindow locale={locale} kind="instrument" title={t('虚拟面包板', 'Virtual breadboard')}>
      <BreadboardSurface key={surfaceVersion} mode={board.mode} locale={locale} wires={wires} parts={parts} selectedPin={selectedPin}
        unoState={trial.uno} onMeterReading={ticket ? setSample : undefined} editLocked={editLocked} meterRecall={meterRecall}
        onProbeSetupChange={ticket ? probeSetupChanged : undefined}
        onInstall={install} onRemovePart={removePart} onFlipLed={flipLed}
        onBeginPartEdit={() => { setSelectedPin(undefined); setBadWire(false) }}
        onPin={visitPin} closed={closed} onToggle={toggleContact} powered={powered} tripped={protectedCircuit} ledOn={reading?.ledOn ?? false}
        currentPath={reading?.currentPath ?? []} inputPath={reading?.inputPath ?? []} />
      <p className="breadboard-reading" data-testid="bread-status" role="status">{pathMessage}</p>
      {arduino && <>
        <dl className="uno-readout breadboard-signals">
          <div><dt>{t('D2 引脚', 'D2 pin')}</dt><dd data-testid="bread-d2">{signal(reading?.d2)}</dd></div>
          <div><dt>{t('程序读到的 button', 'Sampled button')}</dt><dd data-testid="bread-sample">{signal(trial.uno.sample)}</dd></div>
          <div><dt>{t('D13 输出', 'D13 output')}</dt><dd data-testid="bread-d13">{signal(trial.uno.output ? trial.uno.led : null)}</dd></div>
        </dl>
        {program ? <div className="uno-sketch">
          <div className="uno-file"><strong>signal.ino</strong><span>{t('按键呼叫灯', 'Push to Call')}</span></div>
          <ol data-testid="bread-source" aria-label={t('呼叫灯程序', 'Call light sketch')}>
            {program.lines.map((line, index) => <li key={index} aria-current={trial.uno.line === index ? 'step' : undefined}><code>{line || ' '}</code></li>)}
          </ol>
        </div> : <p role="status">{t('找不到这节课引用的呼叫灯程序。可以先在面包板上接线。', 'The call light sketch for this activity is unavailable. You can still wire the breadboard.')}</p>}
      </>}
    </DeviceWindow>
    <CommandDesk locale={locale}>
      <div className="breadboard-controls">
        {fault && <>
          <BreadboardRepairCard locale={locale} notes={notes} diagnosis={diagnosis} original={original} verified={verified}
            current={original ? repairEvidence(sample, closed, powered && trial.uno.output ? trial.uno.led : undefined, trial.uno.pullup, trial.lastWritePressed) : undefined}
            onRecord={recordMeasurement} onChoose={choice => { repair.choose(choice, captureBench()); setChecked(undefined) }} />
          {!original && notes.length > 0 && <RepairReadingComparison locale={locale} readings={repair.readings}
            onRetest={retest} unavailableIndex={unavailableIndex} />}
          {repair.history.length > 0 && <RepairReportHistory locale={locale} reports={repair.history} openRequest={reportRequest} />}
        </>}
        {fromSeries && <section className="breadboard-transfer" data-testid="bread-transfer-note">
          <h2>{t('开关灯面包板', 'Your switch-light board')}</h2>
          {matchesSeriesBoard
            ? <p>{t('元件和板内跳线还在原孔。直流电源已拔下，现在可以接 Arduino。', 'The parts and board jumpers are in their original holes. The DC supply is unplugged. You can now connect the Arduino.')}</p>
            : <><p>{t('可以换回开关灯实验的元件和板内跳线，原来的电源引线会拔下。', 'Bring back the parts and board jumpers from your switch-light experiment. The supply leads will be unplugged.')}</p>
              <button type="button" className="subtle-button" data-testid="bread-restore-series" onClick={() => loadBuild(fromSeries)}>
                {t('用开关灯的板替换当前搭建', 'Replace this build with the switch-light board')}
              </button></>}
        </section>}
        <section>
          <h2>{t('接跳线', 'Add a jumper')}</h2>
          <p aria-live="polite">{editLocked ? t('记下读数并选好判断后，就可以动手改线。', 'Record a reading and choose a diagnosis to edit the wiring.') : badWire
            ? t('这两个接点不能再接一根线。看看孔里是否已经有线，或换同组的空孔。', 'These contacts cannot take another jumper. Look for an occupied hole or choose a free hole in the same group.')
            : selectedPin ? t('已选 ', 'Selected ') + socketLabel(selectedPin, locale) + t('。点另一端接线，再点原处取消。', '. Choose the other end, or tap here again to cancel.')
            : fault ? t('接线时点两个空接点插一根跳线。改线后重新通电，运行程序试灯。', 'In wiring mode, pick two free contacts to add a jumper. After rewiring, power up and run the sketch to test the light.')
            : t('接线时点两个空接点插一根跳线。移动元件或改接导线后，要重新预测、通电。', 'In wiring mode, pick two free contacts to add a jumper. After moving a part or changing a wire, make a new prediction and power up again.')}</p>
          {level.hints.length > 0 && <details className="breadboard-help">
            <summary>{t('接线提示', 'Wiring hints')}</summary>
            {level.hints.map((hint, index) => <p key={index}>{hint[locale]}</p>)}
          </details>}
          <details className="breadboard-wires" data-testid="bread-wire-list">
            <summary>{t('已接导线', 'Jumpers')} · {wires.length}</summary>
            {wires.length > 0 && <ul>{wires.map(([from, to], index) => <li key={from + '-' + to}>
              <span>{socketLabel(from, locale)} ↔ {socketLabel(to, locale)}</span>
              <button type="button" className="subtle-button" disabled={editLocked} aria-label={t('移除导线 ', 'Remove jumper ') + (index + 1)}
                onClick={() => replaceWires(wires.filter((_, i) => i !== index))}>{t('移除', 'Remove')}</button>
            </li>)}</ul>}
          </details>
          <div className="breadboard-actions">
            <button type="button" className="subtle-button" data-testid="bread-undo" disabled={editLocked || !wires.length}
              onClick={() => replaceWires(wires.slice(0, -1))}>{t('取下最后一根', 'Remove last jumper')}</button>
            <button type="button" className="subtle-button" data-testid="bread-reset"
              onClick={resetBoard}>{fault ? t('重新检查这块故障板', 'Restart this repair') : t('恢复本关初始面包板', 'Reset to the starting board')}</button>
          </div>
        </section>
        <section>
          <h2>{fault ? t('通电试灯', 'Test the light') : t('预测与通电', 'Predict and power on')}</h2>
          {!fault && <p>{arduino ? t('程序运行后，按钮保持', 'After the sketch runs, with the button ') : t('通电后，开关保持', 'With power on and the switch ')}
            <strong>{position(guess?.closed ?? closed)}</strong>{t('，外接 LED 会怎样？', ', what will the external LED do?')}</p>}
          <div className="breadboard-actions" role="group" aria-label={fault ? t('模拟电源', 'Simulated supply') : t('灯光预测', 'LED prediction')}>
            {!fault && [true, false].map(on => <button type="button" className="subtle-button" key={String(on)} disabled={powered}
              aria-pressed={prediction === on} data-testid={on ? 'bread-predict-on' : 'bread-predict-off'}
              onClick={() => setPrediction(on)}>{on ? t('会亮', 'Light up') : t('会灭', 'Stay off')}</button>)}
            <button type="button" className="primary-button" data-testid="bread-power" aria-pressed={powered}
              disabled={!powered && ((!fault && prediction === undefined) || (arduino && !program))} onClick={power}>{powered ? t('断电', 'Power off') : t('通电', 'Power on')}</button>
          </div>
          {guess && <p className="breadboard-prediction" data-testid="bread-prediction-result" role="status">{guess.actual === undefined
            ? t('等程序在这个按钮状态下写入 D13，再对照预测。', 'Let the sketch write D13 in this button position to check your prediction.')
            : (guess.actual === guess.on ? t('预测一致。', 'Your prediction matched. ') : t('再比一比。', 'Compare the two. '))
              + t('你猜', 'You predicted ') + lamp(guess.on) + t('，实测', '. You observed ') + lamp(guess.actual) + t('。', '.')}</p>}
          {arduino && <div className="breadboard-actions">
            <button type="button" className="primary-button" data-testid="bread-run" disabled={!powered || protectedCircuit || !program}
              onClick={() => setRunning(!running)}>{running && !protectedCircuit ? t('暂停程序', 'Pause sketch') : t('运行呼叫灯程序', 'Run call light sketch')}</button>
            <button type="button" className="subtle-button" data-testid="bread-step" disabled={!powered || protectedCircuit || !program} onClick={() => {
              if (!program) return
              setRunning(false)
              stepProgram()
            }}>{t('执行一步', 'Step once')}</button>
          </div>}
        </section>
        <section>
          <h2>{t('观察记录', 'Observations')}</h2>
          <p>{arduino ? t('让程序分别读一次松开和按下的按钮，观察每次写入后的外接灯。', 'Let the sketch read the released and pressed button and observe the external LED after each write.')
            : t('分别试开关断开和闭合。每次先预测，再通电记录。', 'Try the switch open and closed. Make a prediction before powering each test.')}</p>
          <dl className="breadboard-observations">{(['open', 'closed'] as const).map(key => {
            const observed = trial.records[key]
            return <div key={key}><dt>{position(key === 'closed')}</dt><dd>
              <span data-testid={'bread-observed-' + key}>{observed ? t('灯', 'LED ') + lamp(observed.ledOn) : t('待观察', 'Not tested')}</span>
              {observed && <small>{arduino
                ? 'D2 ' + signal(observed.d2) + ' / D13 ' + signal(observed.d13)
                : t('预测', 'Predicted ') + lamp(observed.prediction === true)}</small>}
            </dd></div>
          })}</dl>
          <button type="button" className="primary-button" data-testid="bread-check" disabled={!mayCheck || verified} onClick={check}>{t('检查电路', 'Check the circuit')}</button>
          {(checked !== undefined || verified) && <p data-testid="bread-feedback" role="status" className={verified ? 'win-message' : 'error-message'}>{verified
            ? fault ? t('故障判断和两次试灯都通过了。呼叫灯已修好！', 'Your diagnosis and both button tests passed. The call light is repaired!')
              : t('两种状态都验证了，外接灯按预期工作！', 'Both positions tested. Your external LED works as expected!')
            : retryMessage()}</p>}
          {repair.report && <button type="button" className="primary-button" data-testid="bread-open-report" onClick={openReport}>
            {t('查看这张维修记录', 'View this repair record')}</button>}
          {verified && fault && (board.faults?.length ?? 0) > 1 && <button type="button" className="subtle-button" data-testid="bread-next-repair"
            onClick={onNextTicket}>{t('再修一块故障板', 'Try another repair ticket')}</button>}
          {checked && onOpenRepair && <button type="button" className="subtle-button" onClick={onOpenRepair}>
            {t('接一张呼叫灯维修单', 'Open a call light repair ticket')}</button>}
          {canTakeBoard && onHandoff && !preview && <button type="button" className="primary-button" data-testid="bread-handoff"
            onClick={() => onHandoff(build)}>{t('带这块板去接 Arduino', 'Connect this board to Arduino')}</button>}
        </section>
      </div>
    </CommandDesk>
  </div>
}

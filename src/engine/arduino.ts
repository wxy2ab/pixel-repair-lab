import type { ArduinoSketch } from '../shared/arduino'
import type { Bit } from '../shared/hardware'

type Instruction = { op: 'output' | 'pullup' | 'read' | 'writeCondition' }
  | { op: 'compare' | 'write'; level: Bit }
  | { op: 'delay'; ms: number }
type ProgramStep = { instruction: Instruction; line: number }
export type UnoProgram = { lines: string[]; steps: ProgramStep[]; loopStart: number }
export type UnoState = {
  next: number; line: number | null; elapsedMs: number; loops: number
  pullup: boolean; output: boolean; pressed: boolean; sample: Bit | null; condition: boolean; led: Bit
  onMs?: number; offMs?: number; pressedLed?: Bit; releasedLed?: Bit
}

export function powerOnUno(): UnoState {
  return { next: 0, line: null, elapsedMs: 0, loops: 0, pullup: false, output: false,
    pressed: false, sample: null, condition: false, led: 0 }
}

// Build the displayed sketch and its trace together. Each executable line has one simulator instruction.
export function buildUnoProgram(sketch: ArduinoSketch): UnoProgram {
  const lines = ['void setup() {']
  const steps: ProgramStep[] = []
  function emit(line: string, instruction: Instruction) {
    steps.push({ line: lines.length, instruction })
    lines.push('  ' + line)
  }
  if (sketch.mode === 'button') emit('pinMode(2, INPUT_PULLUP);', { op: 'pullup' })
  emit('pinMode(LED_BUILTIN, OUTPUT);', { op: 'output' })
  lines.push('}', '', 'void loop() {')
  const loopStart = steps.length
  if (sketch.mode === 'blink') {
    emit('digitalWrite(LED_BUILTIN, HIGH);', { op: 'write', level: 1 })
    emit(`delay(${sketch.onMs});`, { op: 'delay', ms: sketch.onMs })
    emit('digitalWrite(LED_BUILTIN, LOW);', { op: 'write', level: 0 })
    emit(`delay(${sketch.offMs});`, { op: 'delay', ms: sketch.offMs })
  } else {
    emit('int button = digitalRead(2);', { op: 'read' })
    const level = sketch.lightWhen === 'pressed' ? 0 : 1
    emit(`bool lightOn = (button == ${level === 0 ? 'LOW' : 'HIGH'});`, { op: 'compare', level })
    emit('digitalWrite(LED_BUILTIN, lightOn ? HIGH : LOW);', { op: 'writeCondition' })
    emit('delay(50);', { op: 'delay', ms: 50 })
  }
  lines.push('}')
  return { lines, steps, loopStart }
}

export function pin2Level(state: UnoState): Bit | null {
  return state.pressed ? 0 : state.pullup ? 1 : null
}

export function stepUno(program: UnoProgram, state: UnoState, inputLevel: Bit | null = pin2Level(state)): UnoState {
  const { instruction, line } = program.steps[state.next]
  const next = { ...state, line, next: state.next + 1 }
  switch (instruction.op) {
    case 'output': next.output = true; break
    case 'pullup': next.pullup = true; break
    case 'read': next.sample = inputLevel; break
    case 'compare': next.condition = state.sample === instruction.level; break
    case 'write': next.led = instruction.level; break
    case 'writeCondition':
      next.led = state.condition ? 1 : 0
      if (state.sample === 0) next.pressedLed = next.led
      if (state.sample === 1) next.releasedLed = next.led
      break
    case 'delay':
      next.elapsedMs += instruction.ms
      if (state.led) next.onMs = instruction.ms
      else next.offMs = instruction.ms
      break
  }
  if (next.next === program.steps.length) {
    next.next = program.loopStart
    next.loops++
  }
  return next
}

export function arduinoMeetsGoal(sketch: ArduinoSketch, state: UnoState): boolean {
  if (sketch.mode === 'blink') {
    if (state.onMs === undefined || state.offMs === undefined) return false
    return !sketch.goal || (state.onMs === sketch.goal.onMs && state.offMs === sketch.goal.offMs)
  }
  if (state.pressedLed === undefined || state.releasedLed === undefined) return false
  const lightWhen = sketch.goal?.lightWhen ?? sketch.lightWhen
  return state.pressedLed === Number(lightWhen === 'pressed') && state.releasedLed === Number(lightWhen === 'released')
}

export function verifyArduinoSketch(sketch: ArduinoSketch): boolean {
  const program = buildUnoProgram(sketch.mode === 'blink'
    ? { ...sketch, ...sketch.goal }
    : { ...sketch, lightWhen: sketch.goal?.lightWhen ?? sketch.lightWhen })
  let state = powerOnUno()
  for (let i = 0; i < program.steps.length; i++) state = stepUno(program, state)
  if (sketch.mode === 'button') {
    state = { ...state, pressed: true }
    for (let i = program.loopStart; i < program.steps.length; i++) state = stepUno(program, state)
  }
  return arduinoMeetsGoal(sketch, state)
}

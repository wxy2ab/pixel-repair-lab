import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arduinoIssues, type ArduinoLevel, type ArduinoSketch } from '../shared/arduino'
import { arduinoMeetsGoal, buildUnoProgram, pin2Level, powerOnUno, stepUno, verifyArduinoSketch } from './arduino'

const blink: ArduinoSketch = { mode: 'blink', onMs: 250, offMs: 500, delayChoices: [250, 500] }
const button: ArduinoSketch = { mode: 'button', lightWhen: 'pressed', goal: { lightWhen: 'pressed' } }

test('blink advances one sketch line per step, measures holds, and repeats only loop()', () => {
  const program = buildUnoProgram(blink)
  let state = powerOnUno()
  const trace: string[] = []
  for (const [elapsedMs, led] of [[0, 0], [0, 1], [250, 1], [250, 0], [750, 0], [750, 1]]) {
    assert.equal(arduinoMeetsGoal(blink, state), state.loops > 0)
    state = stepUno(program, state)
    trace.push(program.lines[state.line!].trim())
    assert.equal(state.elapsedMs, elapsedMs)
    assert.equal(state.led, led)
  }
  assert.deepEqual(trace, ['pinMode(LED_BUILTIN, OUTPUT);', 'digitalWrite(LED_BUILTIN, HIGH);', 'delay(250);',
    'digitalWrite(LED_BUILTIN, LOW);', 'delay(500);', 'digitalWrite(LED_BUILTIN, HIGH);'])
  assert.equal(state.onMs, 250)
  assert.equal(state.offMs, 500)
  assert.equal(state.loops, 1)
  assert.equal(arduinoMeetsGoal({ ...blink, goal: { onMs: 500, offMs: 250 } }, state), false)
  assert.equal(verifyArduinoSketch({ ...blink, goal: { onMs: 500, offMs: 250 } }), true)
})

test('a button change affects the live pin at once and the LED only after a fresh sample and write', () => {
  const program = buildUnoProgram(button)
  let state = powerOnUno()
  assert.equal(pin2Level(state), null)
  state = stepUno(program, state) // enable pull-up
  assert.equal(pin2Level(state), 1)
  assert.equal(state.output, false)
  state = stepUno(program, state) // set D13 output
  state = stepUno(program, state) // sample released button
  assert.equal(state.sample, 1)
  state = { ...state, pressed: true }
  assert.equal(pin2Level(state), 0)
  assert.equal(state.sample, 1)
  state = stepUno(program, state) // compare sample
  state = stepUno(program, state) // write the result for released
  assert.equal(state.releasedLed, 0)
  assert.equal(state.pressedLed, undefined)
  assert.equal(arduinoMeetsGoal(button, state), false)
  state = stepUno(program, state) // delay and repeat
  state = stepUno(program, state) // sample pressed button
  assert.equal(state.sample, 0)
  state = stepUno(program, state) // compare
  assert.equal(state.led, 0)
  state = stepUno(program, state) // write the result for pressed
  assert.equal(state.pressedLed, 1)
  assert.equal(state.led, 1)
  assert.equal(state.elapsedMs, 50)
  assert.equal(arduinoMeetsGoal(button, state), true)
  assert.equal(arduinoMeetsGoal(button, powerOnUno()), false)
  const standby: ArduinoSketch = { ...button, goal: { lightWhen: 'released' } }
  assert.equal(arduinoMeetsGoal(standby, state), false)
  assert.equal(verifyArduinoSketch(standby), true)
})

test('configuration rejects unreachable timing controls, missing goals and inappropriate course finales', () => {
  const text = { zh: '灯', en: 'Lamp' }
  const level: ArduinoLevel = { version: 1, id: 'blink', order: 1, title: text, concept: text, brief: text, hints: [],
    kind: 'arduino', stage: 'demo', sketch: blink }
  assert.deepEqual(arduinoIssues(level), [])
  assert.deepEqual(arduinoIssues({ ...level, stage: 'exercise' }).map(issue => issue.path), ['/sketch/goal'])
  assert.deepEqual(arduinoIssues({ ...level, sketch: button }).map(issue => issue.path), ['/sketch/goal'])
  assert.deepEqual(arduinoIssues({ ...level, courseFinal: true }).map(issue => issue.path), ['/courseFinal'])
  assert.deepEqual(arduinoIssues({ ...level, stage: 'challenge', courseFinal: true, sketch: button }), [])
  assert.deepEqual(arduinoIssues({ ...level, stage: 'exercise', sketch: { ...blink, goal: { onMs: 300, offMs: 500 } } })
    .map(issue => issue.path), ['/sketch/delayChoices'])
})

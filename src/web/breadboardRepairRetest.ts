import { powerOnUno, type UnoProgram } from '../engine/arduino'
import { stepBreadboardUno } from '../engine/breadboard'
import { measureBreadboardMeter, type MeterMode } from '../engine/breadboardMeter'
import type { BreadboardBuild } from '../shared/breadboard'
import { repairEvidence, type MeterNote } from './breadboardRepairTicket'

// Run the original sketch against the repaired wiring. The button can have moved
// since the last digitalWrite, so the two saved switch positions are independent.
export function retestRepairNote(before: MeterNote, build: BreadboardBuild, program: UnoProgram, original?: BreadboardBuild) {
  const mode: MeterMode = before.kind === 'continuity' ? 'continuity' : 'voltage'
  const powered = mode === 'voltage'
  let uno = powerOnUno()
  let drivenBy: boolean | undefined
  if (powered) {
    const setupOnly = before.output === undefined || (before.pullup !== undefined && before.drivenBy === undefined)
    if (setupOnly) {
      let pullup = before.pullup
      // Old tickets predate the pull-up flag. For readings taken during setup,
      // use the original board to distinguish a floating D2 from an enabled pull-up.
      if (pullup === undefined && original) {
        const measured = measureBreadboardMeter({ mode, boardMode: 'call-lamp', build: original, closed: before.pressed,
          powered, uno, red: before.red, black: before.black })
        pullup = measured.kind !== before.kind || (measured.kind === 'voltage' && before.kind === 'voltage' && measured.volts !== before.volts)
      }
      while (uno.next < program.loopStart && (before.output !== undefined || pullup && !uno.pullup)) {
        uno = stepBreadboardUno(program, uno, build.wires, before.pressed, build.parts)
      }
    } else {
      // Older tickets only stored D13. On this press-to-light sketch a HIGH was
      // written from a press and a LOW from a release.
      drivenBy = before.drivenBy ?? (before.output === 1)
      do { uno = stepBreadboardUno(program, uno, build.wires, drivenBy, build.parts) } while (uno.loops === 0)
    }
  }
  uno = { ...uno, pressed: before.pressed }
  const { red, black } = before
  const reading = measureBreadboardMeter({ mode, boardMode: 'call-lamp', build, closed: before.pressed, powered, uno, red, black })
  const after = repairEvidence({ mode, red, black, reading }, before.pressed, uno.output ? uno.led : undefined, uno.pullup, drivenBy)
  return { mode, powered, uno, drivenBy, after }
}

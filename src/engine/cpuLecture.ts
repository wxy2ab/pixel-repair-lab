import type { CpuLectureConfig, MachineOp } from '../shared/hardware'
import { runMachine } from './machine'

const cpuOps: MachineOp[] = ['LOAD', 'STORE', 'ADD', 'SUB', 'HALT']

export function runCpuLecture({ source, memory, accumulator }: CpuLectureConfig) {
  return runMachine({
    allowedOps: cpuOps,
    cases: [{ label: { zh: '维修站 CPU', en: 'Repair station CPU' }, memory, accumulator }],
  }, source, 0)
}

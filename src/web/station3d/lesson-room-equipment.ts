import type { LessonRoomFamily } from './lessonRoom'
import { Kit } from './workshop'

const graphite = '#233d47'
const enamel = '#9cbeb4'
const cream = '#e5d6b0'
const brass = '#dba15d'
const glass = '#183e46'
const front: [number, number, number] = [Math.PI / 2, 0, 0]

function display(kit: Kit) {
  kit.cylinder([0, .07, 0], .32, .39, .14, graphite)
  kit.box([0, .23, -.08], [.16, .32, .16], enamel)
  kit.casing([0, .72, -.09], [1.63, .96, .26], cream, .09)
  kit.casing([0, .74, .05], [1.47, .79, .04], graphite, .035)
  kit.box([0, .74, .077], [1.31, .64, .022], glass, undefined, 'glow')
}

// Static housings share the worktop datum. The room's control rig supplies the live readouts.
export function lessonRoomEquipment(family: LessonRoomFamily, accent: string) {
  const kit = new Kit()
  if (family === 'coding' || family === 'data') {
    display(kit)
    kit.casing([-.06, .047, .37], [1.28, .08, .40], graphite, .035)
    for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++)
      kit.box([-.57 + col * .147, .095, .25 + row * .103], [.113, .031, .067], col === 7 ? brass : cream)
  } else if (family === 'algorithms') {
    kit.casing([0, .1, 0], [1.88, .20, .79], graphite, .065)
    kit.casing([0, .224, -.04], [1.71, .09, .65], enamel, .04)
    for (let i = 0; i < 4; i++) kit.box([-.62 + i * .41, .28, -.06], [.35, .025, .43], graphite)
    kit.rod([-.79, .19, .36], [.79, .19, .36], .027, brass)
  } else if (family === 'systems') {
    // A freestanding motherboard, large enough to read the heat sink and edge connector.
    kit.casing([0, .09, -.06], [1.83, .18, .76], graphite, .045)
    kit.casing([0, .71, -.10], [1.60, 1.19, .10], '#39776e', .055)
    for (const x of [-.62, -.51, -.40, .40, .51, .62]) {
      kit.rod([x, .29, -.025], [x, .94, -.025], .014, brass)
      kit.rod([x, .94, -.025], [x * .59, 1.10, -.025], .014, brass)
    }
    kit.casing([0, .75, .006], [.67, .67, .105], graphite, .035)
    for (let i = 0; i < 6; i++) {
      kit.box([-.23 + i * .092, .76, .10], [.048, .50, .10], enamel)
      kit.box([-.21 + i * .086, .19, -.03], [.043, .10, .03], brass)
    }
    for (const x of [-.65, .65]) for (const y of [.35, 1.13])
      kit.cylinder([x, y, -.017], .034, .034, .05, cream, front)
  } else if (family === 'electronics') {
    kit.casing([0, .105, .02], [1.86, .21, .96], graphite, .06)
    kit.casing([0, .235, .02], [1.71, .11, .83], cream, .04)
    for (const z of [-.24, -.11, .11, .24]) for (let i = 0; i < 12; i++)
      kit.box([-.72 + i * .13, .294, z], [.046, .012, .046], graphite)
    kit.rod([-.05, .30, .10], [-.05, .66, .10], .028, enamel)
    kit.rod([.18, .30, .10], [.18, .66, .10], .028, enamel)
    kit.rod([-.59, .30, -.23], [-.59, .93, -.23], .034, '#ce7257')
    kit.rod([-.59, .93, -.23], [.51, .93, -.23], .034, '#ce7257')
    kit.rod([.51, .93, -.23], [.51, .30, -.23], .034, '#ce7257')
  } else if (family === 'vision') {
    kit.cylinder([.16, .065, -.08], .42, .52, .13, graphite)
    kit.cylinder([.16, .31, -.08], .09, .15, .38, brass)
    kit.casing([.16, .79, -.12], [1.03, .68, .55], enamel, .09)
    kit.casing([.16, 1.18, -.14], [.44, .17, .24], graphite, .03)
    kit.cylinder([.06, .78, .24], .32, .35, .27, graphite, front)
    kit.cylinder([.06, .78, .40], .265, .29, .11, cream, front)
    kit.cylinder([.06, .78, .465], .230, .230, .046, '#235970', front)
    kit.cylinder([.06, .78, .491], .142, .142, .02, accent, front, 'glow')
    kit.cylinder([.012, .83, .504], .057, .059, .016, '#d8f9ea', front, 'glow')
    kit.box([.47, .98, .171], [.16, .09, .03], brass)
  } else {
    kit.cylinder([0, .09, -.03], .50, .59, .18, graphite)
    kit.ring([0, .195, -.03], .39, .027, accent, 'glow')
    kit.cylinder([0, .34, -.03], .15, .25, .31, enamel)
    kit.casing([0, .74, -.03], [.92, .61, .54], '#aa9bc4', .12)
    kit.casing([0, .76, .235], [.72, .39, .093], graphite, .055)
    for (const side of [-1, 1]) {
      kit.casing([side * .163, .78, .29], [.080, .114, .019], accent, .013)
      kit.cylinder([side * .496, .73, -.06], .129, .129, .097, cream, [0, 0, Math.PI / 2])
    }
    kit.rod([.14, 1.01, -.10], [.22, 1.28, -.08], .026, graphite)
    kit.cylinder([.22, 1.29, -.08], .068, .080, .09, brass)
  }
  return kit
}

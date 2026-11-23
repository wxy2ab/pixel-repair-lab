import * as THREE from 'three'
import type { BoardDevice } from '../gridDeviceDisplay'
import type { ModelParts } from './models'

const steel = '#456079'
const dark = '#25384b'
const mint = '#88ffcc'
const brass = '#ffc461'

// All models fit a single tile. Walkable switches and collected/spent objects
// keep a low profile so the robot remains visible on top of them.
export function deviceModel(p: ModelParts, device: BoardDevice) {
  const open = device.status === 'open'
  const on = device.status === 'on'
  switch (device.kind) {
    case 'switch':
      p.cylinder(.36, .40, .095, [0, .054, 0], steel)
      p.cylinder(.30, .32, on ? .04 : .15, [0, on ? .12 : .17, 0], on ? '#238469' : '#c47542')
      p.cylinder(.255, .255, .02, [0, on ? .15 : .255, 0], on ? mint : brass, 'light')
      break
    case 'door':
      for (const side of [-1, 1]) {
        p.box([.115, .78, .22], [side * .35, .39, 0], steel, .025)
        p.box([.052, .63, .025], [side * .35, .39, .123], open ? mint : '#b8a5f7', .008, [0, 0, 0], 'light')
        if (!open) p.box([.295, .65, .13], [side * .152, .35, 0], '#735c9d', .022)
      }
      p.box([.83, .12, .22], [0, .8, 0], open ? '#3a917a' : '#9984c9', .028)
      if (!open) p.box([.13, .14, .045], [0, .38, .083], brass, .025)
      break
    case 'key': {
      if (device.status === 'taken') {
        p.add(new THREE.TorusGeometry(.125, .018, 6, 16), steel, [0, .03, 0], [-Math.PI / 2, 0, 0])
        break
      }
      // A large bow, stem and two teeth read as a key from above and the side.
      const angle = -.88
      p.add(new THREE.TorusGeometry(.135, .053, 8, 18), brass, [-.20, .24, -.075], [angle, 0, 0])
      p.box([.43, .070, .074], [.085, .21, -.045], '#ffd878', .015)
      for (const x of [.16, .27]) p.box([.060, .085, .12], [x, .17, .018], brass, .012)
      break
    }
    case 'chest':
      p.box([.65, .31, .48], [0, .18, 0], '#a96837', .065)
      p.box([.54, .035, .37], [0, .347, 0], dark, .018)
      for (const side of [-1, 1]) p.box([.055, .28, .018], [side * .225, .18, .244], '#ffda8a', .005)
      p.box([.115, .13, .03], [0, .28, .253], device.status === 'locked' ? brass : mint, .015)
      break
    case 'mirror':
      p.box([.52, .075, .30], [0, .046, 0], steel, .03)
      p.box([.83, .45, .10], [0, .305, 0], '#63819a', .035)
      p.box([.73, .35, .108], [0, .31, 0], '#a0dfea', .016)
      p.box([.79, .033, .115], [0, .53, 0], '#d8ffff', .008, [0, 0, 0], 'light')
      break
    case 'laser':
      p.cylinder(.31, .37, .10, [0, .062, 0], steel)
      p.box([.40, .34, .40], [0, .27, -.035], '#7e5285', .07)
      p.add(new THREE.CylinderGeometry(.145, .19, .19, 8), '#c580aa', [0, .26, .20], [Math.PI / 2, 0, 0])
      p.add(new THREE.CylinderGeometry(.125, .125, .024, 8), on ? '#ff93cb' : '#62485d', [0, .26, .306], [Math.PI / 2, 0, 0], on ? 'light' : 'shell')
      break
    case 'cannon':
      p.cylinder(.33, .40, .105, [0, .064, 0], steel)
      p.cylinder(.23, .24, .14, [0, .18, 0], dark)
      p.box([.43, .30, .45], [0, .35, -.035], '#c98046', .10)
      p.add(new THREE.CylinderGeometry(.16, .19, .28, 10), '#f3a756', [0, .34, .23], [Math.PI / 2, 0, 0])
      p.add(new THREE.CylinderGeometry(.125, .125, .025, 10), on ? '#fff2b4' : '#614150', [0, .34, .385], [Math.PI / 2, 0, 0], on ? 'light' : 'shell')
      break
    case 'bomb':
      p.cylinder(.315, .35, .09, [0, .05, 0], device.status === 'spent' ? dark : '#9f5763')
      if (device.status !== 'spent') {
        p.add(new THREE.SphereGeometry(.26, 14, 10), '#c76765', [0, .27, 0])
        p.cylinder(.25, .25, .075, [0, .27, 0], '#ffbc76', 'light')
        p.box([.19, .09, .14], [0, .53, 0], brass, .03)
      }
      break
  }
  return p
}

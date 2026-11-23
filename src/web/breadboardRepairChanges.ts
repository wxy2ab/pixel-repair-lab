import type { BreadboardBuild, BreadboardPart, BreadboardPartKind, BreadboardWire } from '../shared/breadboard'

export type RepairChange =
  | { kind: 'wire-moved'; fixed: string; from: string; to: string }
  | { kind: 'wire-added' | 'wire-removed'; pins: BreadboardWire }
  | { kind: 'part-added' | 'part-removed'; part: BreadboardPart }
  | { kind: 'part-moved' | 'led-flipped'; part: BreadboardPartKind; from: BreadboardWire; to: BreadboardWire }

const sameSockets = (a: BreadboardWire, b: BreadboardWire) => b.includes(a[0]) && b.includes(a[1])
const commonEnd = (a: BreadboardWire, b: BreadboardWire) => a.find(pin => b.includes(pin))

export function compareRepairBoards(original: BreadboardBuild, repaired: BreadboardBuild): RepairChange[] {
  const changes: RepairChange[] = []
  for (const first of original.parts) {
    const last = repaired.parts.find(part => part.kind === first.kind)
    if (!last) changes.push({ kind: 'part-removed', part: first })
    else if (!sameSockets(first.pins, last.pins)) changes.push({ kind: 'part-moved', part: first.kind, from: first.pins, to: last.pins })
    else if (first.kind === 'led' && first.pins[0] !== last.pins[0]) {
      changes.push({ kind: 'led-flipped', part: 'led', from: first.pins, to: last.pins })
    }
  }
  for (const last of repaired.parts) {
    if (!original.parts.some(part => part.kind === last.kind)) changes.push({ kind: 'part-added', part: last })
  }

  const removed = original.wires.filter(a => !repaired.wires.some(b => sameSockets(a, b)))
  const added = repaired.wires.filter(b => !original.wires.some(a => sameSockets(a, b)))
  const paired = new Set<BreadboardWire>()
  for (const before of removed) {
    const matches = added.filter(after => commonEnd(before, after))
    const after = matches[0]
    // Several jumpers may use one Arduino or GND terminal. Only pair up a move
    // if the two boards identify a single old and new lead at that contact.
    if (matches.length === 1 && removed.filter(wire => commonEnd(wire, after)).length === 1) {
      const fixed = commonEnd(before, after)!
      changes.push({ kind: 'wire-moved', fixed, from: before.find(pin => pin !== fixed)!, to: after.find(pin => pin !== fixed)! })
      paired.add(after)
    } else changes.push({ kind: 'wire-removed', pins: before })
  }
  for (const after of added) {
    if (!paired.has(after)) changes.push({ kind: 'wire-added', pins: after })
  }
  return changes
}

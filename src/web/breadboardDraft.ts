import {
  canAddBreadboardWire, canPlaceBreadboardPart, isBreadboardSocket, legacyBreadboardParts,
  type BreadboardBuild, type BreadboardLevel, type BreadboardMode, type BreadboardWire,
} from '../shared/breadboard'

function pair(value: unknown): value is BreadboardWire {
  return Array.isArray(value) && value.length === 2 && value.every(pin => typeof pin === 'string')
}

export function initialBreadboardBuild(level: BreadboardLevel): BreadboardBuild {
  return structuredClone({ parts: level.board.initialParts ?? legacyBreadboardParts(), wires: level.board.initialWires })
}

export function boardForArduino(build: BreadboardBuild): BreadboardBuild {
  const internalWires = build.wires.filter(wire => wire.every(isBreadboardSocket))
  return structuredClone({ parts: build.parts, wires: internalWires })
}

export function decodeBreadboardBuild(data: Partial<BreadboardBuild> | null, mode: BreadboardMode): BreadboardBuild | undefined {
  if (!data || !Array.isArray(data.parts) || data.parts.length > 3
    || !Array.isArray(data.wires) || data.wires.length > 24) return
  const build: BreadboardBuild = { parts: [], wires: [] }
  for (const part of data.parts) {
    if (!part || !['button', 'resistor', 'led'].includes(part.kind) || !pair(part.pins)
      || build.parts.some(mounted => mounted.kind === part.kind) || !canPlaceBreadboardPart(build.parts, [], part)) return
    build.parts.push({ kind: part.kind, pins: part.pins })
  }
  for (const wire of data.wires) {
    if (!pair(wire) || !canAddBreadboardWire(mode, build.wires, wire, build.parts)) return
    build.wires.push(wire)
  }
  return build
}

// A disabled or full browser store should still let a child take the board to the next lesson in this tab.
const memoryDrafts = new Map<string, string>()
const draftKey = (level: BreadboardLevel) => 'pixel-repair-lab:breadboard:' + level.id

export function writeBoardStorage(key: string, data: object) {
  const raw = JSON.stringify(data)
  try {
    localStorage.setItem(key, raw)
    memoryDrafts.delete(key)
  } catch {
    memoryDrafts.set(key, raw)
  }
}

export function readBoardStorage(key: string): unknown {
  try {
    const raw = memoryDrafts.get(key) ?? localStorage.getItem(key)
    return raw && raw.length < 8192 ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

export function boardStorageKeys(prefix: string): string[] {
  const keys = new Set([...memoryDrafts.keys()].filter(key => key.startsWith(prefix)))
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) keys.add(key)
    }
  } catch { /* The in-memory records are still available in this tab. */ }
  return [...keys]
}

export function removeBoardStorage(key: string) {
  memoryDrafts.delete(key)
  try { localStorage.removeItem(key) } catch { /* Storage may be disabled in this browser. */ }
}

export function saveBreadboardDraft(level: BreadboardLevel, build: BreadboardBuild) {
  writeBoardStorage(draftKey(level), { version: 1, mode: level.board.mode, ...build })
}

export function readBreadboardDraft(level: BreadboardLevel): BreadboardBuild | undefined {
  const data = readBoardStorage(draftKey(level)) as (Partial<BreadboardBuild> & { version?: number; mode?: string }) | undefined
  if (data?.version === 1 && data.mode === level.board.mode) return decodeBreadboardBuild(data, level.board.mode)
}

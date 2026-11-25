import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { ArenaActor } from '../shared/advanced'
import { arenaElapsed, arenaShotImpactMs, syncArenaAnimation, type ArenaTurnMotion } from './arenaTurnMotion'

export function isArenaDamaged(actor?: ArenaActor, maxHealth?: number) {
  return actor?.hp !== undefined && actor.hp > 0 && maxHealth !== undefined && actor.hp < maxHealth
}

// The atlas is rendered from the same Sprout and four rival models as the 3D arena.
export function arenaPortraitStyle(index: number, damaged = false): CSSProperties {
  const column = index === 0 ? 0 : 1 + (index - 1) % 4
  return { '--arena-livery-x': column * 25 + '%', '--arena-state-y': damaged ? '50%' : '0%' } as CSSProperties
}

export function ArenaWreck({ id, index, title, motion, occupied, slot, count }: {
  id: string; index: number; title: string; motion?: ArenaTurnMotion; occupied: boolean; slot: number; count: number
}) {
  const debris = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const node = debris.current
    if (!node?.animate || !motion) return
    if (motion.from.find(actor => actor.id === id)?.hp === 0) return
    const hits = motion.events.filter(shot => shot.targetId === id && shot.damage)
    if (!hits.length) return
    const finalHit = Math.max(...hits.map(shot => arenaShotImpactMs(motion, shot)))
    const delay = finalHit + motion.shutdownMs * .4
    const duration = motion.shutdownMs * .56
    if (arenaElapsed(motion, performance.now()) >= delay + duration) return
    const arrival = node.animate([{ opacity: 0 }, { opacity: 1 }], { delay, duration, easing: 'ease-out', fill: 'backwards' })
    return syncArenaAnimation(arrival, motion)
  }, [id, motion])
  // Living robots and pickups own the centre. Pack debris into the bottom of occupied cells.
  const columns = Math.min(count, Math.ceil(Math.sqrt(count * (occupied ? 2 : 1))))
  const rows = Math.ceil(count / columns)
  const row = Math.floor(slot / columns)
  const inRow = Math.min(columns, count - row * columns)
  const left = occupied && count === 1 ? 77 : 50 + (slot % columns - (inRow - 1) / 2) * 100 / columns
  const height = occupied ? 46 : 100
  const top = 100 - height + (row + .5) * height / rows
  const width = Math.min(96 / columns, height / rows)
  return <span ref={debris} className="arena-wreck-model" data-wreck-id={id} data-occupied={occupied || undefined}
    style={{ ...arenaPortraitStyle(index), left: left + '%', top: top + '%', width: width + '%' }}
    role="img" aria-label={title} title={title} />
}

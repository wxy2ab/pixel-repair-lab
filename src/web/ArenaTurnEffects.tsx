import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'
import type { Position } from '../shared/types'
import type { ArenaActor } from '../shared/advanced'
import { gridOffsets } from '../shared/gridDevices'
import { arenaMotionMs, arenaPulseFlightMs, arenaPulseTravel, arenaShotImpactMs, type ArenaTurnMotion } from './arenaTurnMotion'
import './arena-turn-effects.css'

function cellStyle({ x, y }: Position): CSSProperties {
  return { '--fx-x': x, '--fx-y': y } as CSSProperties
}

function smooth(value: number) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

// Build up pressure, reach the peak, then ease back to the resting pose.
function pulse(time: number, peak: number, end: number) {
  return time < peak ? smooth(time / peak) : 1 - smooth((time - peak) / (end - peak))
}

function actorFrames(motion: ArenaTurnMotion, before: ArenaActor, actor: ArenaActor, width: number, height: number, baseFilter: string) {
  const action = motion.events.find(event => event.actorId === actor.id)
  const direction = action?.direction ? gridOffsets[action.direction] : { x: 0, y: 0 }
  const hits = motion.events.filter(event => event.action === 'shoot' && event.targetId === actor.id)
    .map(shot => ({ at: arenaShotImpactMs(motion, shot), direction: gridOffsets[shot.direction!], damage: shot.damage ?? 0 }))
  const lastHit = hits.filter(hit => hit.damage).sort((a, b) => b.at - a.at)[0]
  const fallAt = actor.hp === 0 ? lastHit?.at : undefined
  const dx = actor.x - before.x, dy = actor.y - before.y
  if (!dx && !dy && !action?.blocked && action?.action !== 'shoot' && !hits.length) return

  // Sample a single pose for the whole chassis. A robot can fire and be hit while its recoil is still settling.
  const intervals = Math.ceil(motion.durationMs / 20)
  return Array.from({ length: intervals + 1 }, (_, i): Keyframe => {
    const fraction = i / intervals
    const time = fraction * motion.durationMs
    const step = smooth(time / (motion.moveMs || 1))
    const stride = Math.sin(Math.PI * step)
    let x = dx * (step - 1), y = dy * (step - 1)
    let tilt = 0, squash = 0
    if (dx || dy) {
      const weight = pulse(time, motion.moveMs * .14, motion.moveMs * .35)
      y += .025 * weight - .065 * stride * stride
      tilt = dx * (6 * stride - 2 * weight)
      squash = .026 * weight - .025 * stride
    } else if (action?.action === 'move' && action.blocked) {
      const bump = pulse(time, motion.moveMs * .44, motion.moveMs)
      x += direction.x * .16 * bump
      y += direction.y * .16 * bump
      tilt += direction.x * 5 * bump
      squash = .04 * bump
    }
    if (action?.action === 'shoot') {
      const release = time - motion.fireAtMs
      const brace = pulse(release + arenaMotionMs.windup, arenaMotionMs.windup, arenaMotionMs.windup + 95)
      const kick = pulse(release, 58, arenaMotionMs.recoil)
      x += direction.x * (.036 * brace - .14 * kick)
      y += direction.y * (.036 * brace - .14 * kick) + .023 * brace
      tilt += direction.x * (3 * brace - 7 * kick)
      squash += .034 * brace + .025 * kick
    }
    let glow = 0
    for (const hit of hits) {
      const kick = pulse(time - hit.at, 73, arenaMotionMs.impact)
      const force = hit.damage ? .12 : .045
      glow = Math.max(glow, pulse(time - hit.at, 44, 210) * (hit.damage ? .38 : .16))
      x += hit.direction.x * force * kick
      y += hit.direction.y * force * kick
      tilt += hit.direction.x * force * 56 * kick
    }
    const fall = fallAt === undefined ? 0 : (time - fallAt) / arenaMotionMs.shutdown
    const slump = smooth((fall - .10) / .63)
    const fade = smooth((fall - .38) / .60)
    x += (lastHit?.direction.x ?? 0) * .09 * slump
    y += .13 * slump
    tilt += (lastHit?.direction.x || 1) * 28 * slump
    const scale = 1 - .13 * slump
    const frame: Keyframe = { offset: fraction, translate: `${x * width}px ${y * height}px`, rotate: `${tilt}deg`,
      scale: `${scale + squash} ${scale - squash}` }
    if (hits.length) frame.filter = `${baseFilter} brightness(${1 + glow - .23 * slump}) saturate(${1 - .74 * slump})`
    if (fallAt !== undefined) frame.opacity = 1 - fade
    return frame
  })
}

export function ArenaTurnEffects({ motion, board }: {
  motion: ArenaTurnMotion; board: RefObject<HTMLDivElement | null>
}) {
  const layer = useRef<HTMLDivElement>(null)
  const { from, to, events } = motion
  const shots = events.filter(event => event.action === 'shoot' && event.direction)
  const fallen = to.filter(actor => actor.hp === 0 && from.some(before => before.id === actor.id && before.hp !== 0))

  useLayoutEffect(() => {
    const map = board.current
    const effects = layer.current
    if (!map || !effects || !map.animate) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const elapsed = Math.max(0, performance.now() - motion.startedAt)
    if (preference.matches || elapsed >= motion.durationMs) return
    const mapStyle = getComputedStyle(map)
    const width = (map.clientWidth + parseFloat(mapStyle.columnGap)) / Number(mapStyle.getPropertyValue('--cols'))
    const height = (map.clientHeight + parseFloat(mapStyle.rowGap)) / Number(mapStyle.getPropertyValue('--rows'))
    effects.style.setProperty('--tile-gap', mapStyle.columnGap)
    const pixels = (x: number, y: number) => `${x * width}px ${y * height}px`
    const animations: Animation[] = []
    function animate(node: Element | null | undefined, frames: Keyframe[], start: number, duration: number) {
      if (!node || elapsed >= start + duration) return
      // WAAPI and performance.now() use the document's time origin. A shared start time also
      // keeps the impact aligned with the health meter on browsers that defer play() a frame.
      const animation = node.animate(frames, { delay: start, duration, easing: 'linear', fill: 'backwards' })
      animation.startTime = motion.startedAt
      animations.push(animation)
    }
    for (const actor of motion.to) {
      const before = motion.from.find(bot => bot.id === actor.id)
      if (!before || before.hp === 0) continue
      const name = CSS.escape(actor.id)
      const wreck = effects.querySelector(`[data-fallen="${name}"]`)
      const sprite = wreck?.querySelector('.arena-fallen-art') ??
        map.querySelector(actor.id === 'player' ? '.tile > .pixel-bot:not(.pixel-bot--enemy)' : `.rival-marker[data-rival-id="${name}"]`)
      const baseFilter = sprite ? getComputedStyle(sprite).filter : 'none'
      const frames = actorFrames(motion, before, actor, width, height, baseFilter === 'none' ? '' : baseFilter)
      if (frames) {
        animate(sprite?.closest('.tile'), [{ zIndex: 2 }, { zIndex: 2 }], 0, motion.moveMs || 1)
        animate(sprite, frames, 0, motion.durationMs)
      }
      const guard = effects.querySelector(`[data-guard="${name}"] .arena-guard-ring`)
      animate(guard, [
        { opacity: 0, scale: '.72' }, { opacity: .8, scale: '1', offset: .24 },
        { opacity: .62, scale: '1.03', offset: .72 }, { opacity: 0, scale: '1.12' },
      ], 0, motion.durationMs)
      if (!wreck) continue
      const hits = motion.events.filter(shot => shot.targetId === actor.id && shot.damage)
      const lastHit = Math.max(...hits.map(shot => arenaShotImpactMs(motion, shot)))
      const finalDirection = hits.find(shot => arenaShotImpactMs(motion, shot) === lastHit)?.direction
      if (!finalDirection) continue
      const direction = gridOffsets[finalDirection]
      for (const [i, chip] of wreck.querySelectorAll('.arena-wreck-chip').entries()) {
        const angle = ((i + .4) / 5) * Math.PI * 2
        const dx = Math.cos(angle) * .45 + direction.x * .16
        const dy = Math.sin(angle) * .25 + direction.y * .12
        animate(chip, [
          { opacity: 0, translate: pixels(0, 0), rotate: '0deg', scale: '.45' },
          { opacity: .86, translate: pixels(dx * .42, dy * .42 - .12), rotate: '22deg', scale: '1', offset: .20 },
          { opacity: .64, translate: pixels(dx * .85, dy * .85 - .10), rotate: '64deg', scale: '.86', offset: .55 },
          { opacity: 0, translate: pixels(dx, dy + .16), rotate: '95deg', scale: '.45' },
        ], lastHit + 70 + i * 17, arenaMotionMs.shutdown - 150 - i * 17)
      }
    }
    for (const shot of motion.events) {
      if (shot.action !== 'shoot' || !shot.direction) continue
      const source = motion.to.find(bot => bot.id === shot.actorId)
      if (!source) continue
      const name = CSS.escape(shot.actorId)
      const slot = effects.querySelector(`[data-shot-from="${name}"]`)
      const direction = gridOffsets[shot.direction]
      const fire = motion.fireAtMs
      const flight = arenaPulseFlightMs(shot)
      const hit = arenaShotImpactMs(motion, shot)
      animate(slot?.querySelector('.arena-pulse-charge'), [
        { opacity: 0, scale: '.24' }, { opacity: .32, scale: '.63', offset: .40 },
        { opacity: .93, scale: '1.05', offset: .76 }, { opacity: .7, scale: '.68', offset: .88 },
        { opacity: 0, scale: '.32' },
      ], fire - arenaMotionMs.windup, arenaMotionMs.windup + 60)
      animate(slot?.querySelector('.arena-pulse-muzzle'), [
        { opacity: 0, scale: '.28' }, { opacity: .95, scale: '.90', offset: .22 },
        { opacity: .50, scale: '1.15', offset: .56 }, { opacity: 0, scale: '1.42' },
      ], fire - 24, 174)
      const end = shot.path?.at(-1)
      if (!end) continue
      const startX = direction.x * .29, startY = direction.y * .29
      const inset = shot.targetId ? .18 : 0
      const endX = end.x - source.x - direction.x * inset
      const endY = end.y - source.y - direction.y * inset
      const along = (t: number) => pixels(startX + (endX - startX) * t, startY + (endY - startY) * t)
      // The core grows out of the lit muzzle and contracts into the glow at the point of contact.
      const glowTime = shot.targetId ? 46 : 85
      const contact = flight / (flight + glowTime)
      const flightFrames: Keyframe[] = [0, .045, .09, .14, .84, .92, .96, 1].map(t => ({
        translate: along(arenaPulseTravel(t)), offset: t * contact,
        opacity: Math.min(1, t / .055) * (1 - (shot.targetId ? .16 : .64) * smooth((t - .84) / .16)),
      }))
      flightFrames.push({ translate: along(1), opacity: 0, offset: 1 })
      animate(slot?.querySelector('.arena-pulse-flight'), flightFrames, fire, flight + glowTime)
      animate(slot?.querySelector('.arena-pulse-wake'), [
        { scale: '.06 .62', opacity: 0 }, { scale: '.9 1', opacity: .86, offset: .22 },
        { scale: '1 1', opacity: .84, offset: .71 }, { scale: '.14 .58', opacity: 0 },
      ], fire, flight)
      for (const [i, cell] of (shot.path ?? []).entries()) {
        const line = map.querySelector(`.tile[data-x="${cell.x}"][data-y="${cell.y}"] [data-shot-actor="${name}"]`)
        const arrival = fire + flight * Math.max(0, i + .5 - .29) / Math.max(.5, (shot.path?.length ?? 0) - .29 - inset)
        animate(line, [{ opacity: 0 }, { opacity: .18, offset: .34 }, { opacity: 0 }], arrival, 140)
      }
      const impact = effects.querySelector(`[data-shot-hit="${name}"]`)
      animate(impact?.querySelector('.arena-pulse-impact'), [
        { opacity: 0, scale: '.18' }, { opacity: .9, scale: '.42', offset: .16 },
        { opacity: .48, scale: '.91', offset: .55 }, { opacity: 0, scale: '1.18' },
      ], hit, arenaMotionMs.impact)
      animate(impact?.querySelector('.arena-hit-core'), [
        { opacity: 0, scale: '.20' }, { opacity: .92, scale: '.88', offset: .25 }, { opacity: 0, scale: '1.28' },
      ], hit, 150)
    }
    const cancel = () => animations.forEach(animation => animation.cancel())
    preference.addEventListener('change', cancel)
    return () => {
      preference.removeEventListener('change', cancel)
      cancel()
    }
  }, [board, motion])

  return <div ref={layer} className="arena-motion-layer" aria-hidden="true">
    {fallen.map(actor => {
      const index = to.indexOf(actor)
      return <div key={actor.id} className="arena-fx-cell" data-fallen={actor.id} style={cellStyle(actor)}>
        <span className="arena-fallen-art"><i className={'pixel-bot' + (index ? ' pixel-bot--enemy' : '')} />
          {!!index && <small className="arena-fallen-label" style={{ '--rival-index': index - 1 } as CSSProperties}>{index}</small>}
        </span>
        {Array.from({ length: 5 }, (_, i) => <i className="arena-wreck-chip" key={i} />)}
      </div>
    })}
    {events.filter(event => event.action === 'guard').map(event => {
      const actor = to.find(bot => bot.id === event.actorId)
      return actor && <span key={'guard-' + actor.id} className="arena-fx-cell" style={cellStyle(actor)} data-guard={actor.id}>
        <i className="arena-guard-ring" />
      </span>
    })}
    {shots.map(shot => {
      const source = to.find(actor => actor.id === shot.actorId)
      if (!source) return null
      const target = shot.path?.at(-1)
      return <div key={shot.actorId} className="arena-shot" data-side={shot.actorId === 'player' ? 'player' : 'rival'} data-direction={shot.direction}>
        <span className="arena-fx-cell" style={cellStyle(source)} data-shot-from={shot.actorId}>
          <span className="arena-muzzle-port"><i className="arena-pulse-charge" /><i className="arena-pulse-muzzle" /></span>
          {target && <i className="arena-pulse-flight">
            <span className="arena-pulse-heading"><i className="arena-pulse-wake" /><i className="arena-pulse-bolt" /></span>
          </i>}
        </span>
        {target && shot.targetId && <span className="arena-fx-cell" style={cellStyle(target)} data-shot-hit={shot.actorId}>
          <span className="arena-contact-point" data-shielded={Boolean(shot.absorbed) || undefined}>
            <i className="arena-hit-core" /><i className="arena-pulse-impact" />
          </span>
        </span>}
      </div>
    })}
  </div>
}

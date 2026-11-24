// The game creates its audio device only in response to a gesture with sound enabled.
const preference = 'pixel-repair-lab:warehouse-sound'
let audio: AudioContext | undefined
let bus: GainNode | undefined
let enabled = false
try { enabled = localStorage.getItem(preference) === 'on' } catch { /* Keep the in-memory setting. */ }

export function warehouseSoundEnabled() { return enabled }

export function armWarehouseSound() {
  if (!enabled || typeof AudioContext === 'undefined') return
  try {
    if (!audio) {
      audio = new AudioContext()
      bus = audio.createGain()
      bus.connect(audio.destination)
    }
    if (audio.state === 'suspended') void audio.resume().catch(() => {})
  } catch { /* The visual cue remains available without an audio device. */ }
}

export function toggleWarehouseSound() {
  enabled = !enabled
  try { localStorage.setItem(preference, enabled ? 'on' : 'off') } catch { /* Applies for this visit. */ }
  armWarehouseSound()
  if (audio && bus) bus.gain.setTargetAtTime(enabled ? 1 : 0, audio.currentTime, .01)
  return enabled
}

export function soundWarehouseCue(cue: 'arrival' | 'complete') {
  if (!enabled || !audio || !bus || audio.state !== 'running') return
  const context = audio, output = bus
  const notes = cue === 'arrival' ? [740, 988] : [523, 659, 784, 1047]
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    const at = context.currentTime + index * (cue === 'arrival' ? .06 : .11)
    const duration = cue === 'arrival' ? .12 : .24
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    envelope.gain.setValueAtTime(.0001, at)
    envelope.gain.exponentialRampToValueAtTime(.075, at + .012)
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration)
    oscillator.connect(envelope).connect(output)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
    oscillator.start(at)
    oscillator.stop(at + duration)
  })
}

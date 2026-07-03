type SoundKey =
  | 'openingCarDoor'
  | 'engineStart'
  | 'carDriven'
  | 'carCrash'
  | 'engineBreakdown'
  | 'incomingMessage'
  | 'explosion'
  | 'footstepsWalk'
  | 'footstepsRun'
  | 'swimming'
  | 'hacking'

const SOUND_PATHS: Record<SoundKey, string> = {
  openingCarDoor: `${import.meta.env.BASE_URL}sounds/opening-car-door.mp3`,
  engineStart: `${import.meta.env.BASE_URL}sounds/engine-start.mp3`,
  carDriven: `${import.meta.env.BASE_URL}sounds/car-driven.mp3`,
  carCrash: `${import.meta.env.BASE_URL}sounds/car-crash.mp3`,
  engineBreakdown: `${import.meta.env.BASE_URL}sounds/breaking-down-engine.mp3`,
  incomingMessage: `${import.meta.env.BASE_URL}sounds/incoming-message.mp3`,
  explosion: `${import.meta.env.BASE_URL}sounds/nuclear-bomb-explosion.mp3`,
  footstepsWalk: `${import.meta.env.BASE_URL}sounds/footsteps-walking.mp3`,
  footstepsRun: `${import.meta.env.BASE_URL}sounds/footsteps-running.mp3`,
  swimming: `${import.meta.env.BASE_URL}sounds/swimming.mp3`,
  hacking: `${import.meta.env.BASE_URL}sounds/hacking.mp3`,
}

const ONE_SHOT_KEYS: SoundKey[] = [
  'openingCarDoor',
  'engineStart',
  'carCrash',
  'engineBreakdown',
  'incomingMessage',
  'explosion',
]

const LOOP_KEYS: SoundKey[] = [
  'carDriven',
  'footstepsWalk',
  'footstepsRun',
  'swimming',
  'hacking',
]

interface LoopHandle {
  source: AudioBufferSourceNode
  gain: GainNode
}

class SoundEngine {
  private ctx: AudioContext | null = null
  private buffers: Partial<Record<SoundKey, AudioBuffer>> = {}
  private oneShotTemplates: Partial<Record<SoundKey, HTMLAudioElement>> = {}
  private volumes: Record<SoundKey, number> = {
    openingCarDoor: 1,
    engineStart: 1,
    carDriven: 1,
    carCrash: 1,
    engineBreakdown: 1,
    incomingMessage: 1,
    explosion: 1,
    footstepsWalk: 1,
    footstepsRun: 1,
    swimming: 1,
    hacking: 1,
  }
  private loops: Partial<Record<SoundKey, LoopHandle>> = {}
  private muted = false

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AC()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  resume(): void {
    if (!this.ctx) {
      this.ensureCtx()
      console.log('[SoundEngine] resumed')
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  setMuted(b: boolean): void {
    this.muted = b
    if (b) {
      for (const key of LOOP_KEYS) this.stopLoop(key)
    }
  }

  isMuted(): boolean {
    return this.muted
  }

  setVolume(key: SoundKey, v: number): void {
    this.volumes[key] = Math.max(0, Math.min(1, v))
    const handle = this.loops[key]
    if (handle) {
      const target = this.muted ? 0 : this.volumes[key]
      handle.gain.gain.setTargetAtTime(target, this.ctx!.currentTime, 0.05)
    }
  }

  private async loadBuffer(key: SoundKey): Promise<AudioBuffer> {
    if (this.buffers[key]) return this.buffers[key]!
    const ctx = this.ensureCtx()
    const res = await fetch(SOUND_PATHS[key])
    const arr = await res.arrayBuffer()
    const buf = await ctx.decodeAudioData(arr)
    this.buffers[key] = buf
    return buf
  }

  private getOneShotTemplate(key: SoundKey): HTMLAudioElement {
    if (!this.oneShotTemplates[key]) {
      const a = new Audio(SOUND_PATHS[key])
      a.preload = 'auto'
      this.oneShotTemplates[key] = a
    }
    return this.oneShotTemplates[key]!
  }

  private playOneShot(key: SoundKey): void {
    if (this.muted) return
    const template = this.getOneShotTemplate(key)
    const node = template.cloneNode(true) as HTMLAudioElement
    node.volume = this.volumes[key]
    node.play().catch(() => {})
  }

  private startLoop(key: SoundKey): void {
    if (this.muted) return
    if (this.loops[key]) return
    const ctx = this.ensureCtx()
    this.loadBuffer(key).then((buf) => {
      if (this.muted || this.loops[key]) return
      const source = ctx.createBufferSource()
      source.buffer = buf
      source.loop = true
      const gain = ctx.createGain()
      gain.gain.value = this.volumes[key]
      source.connect(gain).connect(ctx.destination)
      source.start()
      this.loops[key] = { source, gain }
    }).catch(() => {})
  }

  private stopLoop(key: SoundKey): void {
    const handle = this.loops[key]
    if (!handle) return
    try { handle.source.stop() } catch {}
    handle.source.disconnect()
    handle.gain.disconnect()
    delete this.loops[key]
  }

  playOpeningCarDoor(): void { this.playOneShot('openingCarDoor') }
  playEngineStart(): void { this.playOneShot('engineStart') }
  playCarCrash(): void { this.playOneShot('carCrash') }
  playEngineBreakdown(): void { this.playOneShot('engineBreakdown') }
  playIncomingMessage(): void { this.playOneShot('incomingMessage') }
  playExplosion(): void { this.playOneShot('explosion') }

  startCarDrivenLoop(): void { this.startLoop('carDriven') }
  stopCarDrivenLoop(): void { this.stopLoop('carDriven') }
  setCarDrivenVolume(v: number): void { this.setVolume('carDriven', v) }

  startFootstepsWalkLoop(): void {
    if (this.muted) return
    if (this.loops['footstepsRun']) this.stopLoop('footstepsRun')
    if (!this.loops['footstepsWalk']) this.startLoop('footstepsWalk')
  }
  startFootstepsRunLoop(): void {
    if (this.muted) return
    if (this.loops['footstepsWalk']) this.stopLoop('footstepsWalk')
    if (!this.loops['footstepsRun']) this.startLoop('footstepsRun')
  }
  stopFootstepsLoop(): void {
    this.stopLoop('footstepsWalk')
    this.stopLoop('footstepsRun')
  }

  startSwimmingLoop(): void { this.startLoop('swimming') }
  stopSwimmingLoop(): void { this.stopLoop('swimming') }

  startHackingLoop(): void { this.startLoop('hacking') }
  stopHackingLoop(): void { this.stopLoop('hacking') }

  stopAllLoops(): void {
    for (const key of LOOP_KEYS) this.stopLoop(key)
  }
}

export const soundEngine = new SoundEngine()

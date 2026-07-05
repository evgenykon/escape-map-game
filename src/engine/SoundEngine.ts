type SoundKey =
  | 'openingCarDoor'
  | 'engineStart'
  | 'carDriven'
  | 'carCrash'
  | 'engineBreakdown'
  | 'carBrake'
  | 'incomingMessage'
  | 'explosion'
  | 'footstepsWalk'
  | 'footstepsRun'
  | 'swimming'
  | 'hacking'
  | 'cityNoise1'
  | 'cityNoise2'
  | 'nuclearDanger'
  | 'doorOpeningClosing'
  | 'doorClosing'
  | 'carFillingStation'

const SOUND_PATHS: Record<SoundKey, string> = {
  openingCarDoor: `${import.meta.env.BASE_URL}sounds/opening-car-door.mp3`,
  engineStart: `${import.meta.env.BASE_URL}sounds/engine-start.mp3`,
  carDriven: `${import.meta.env.BASE_URL}sounds/car-driven.mp3`,
  carCrash: `${import.meta.env.BASE_URL}sounds/car-crash.mp3`,
  engineBreakdown: `${import.meta.env.BASE_URL}sounds/breaking-down-engine.mp3`,
  carBrake: `${import.meta.env.BASE_URL}sounds/brakes-pads-creak.mp3`,
  incomingMessage: `${import.meta.env.BASE_URL}sounds/incoming-message.mp3`,
  explosion: `${import.meta.env.BASE_URL}sounds/nuclear-bomb-explosion.mp3`,
  footstepsWalk: `${import.meta.env.BASE_URL}sounds/footsteps-walking.mp3`,
  footstepsRun: `${import.meta.env.BASE_URL}sounds/footsteps-running.mp3`,
  swimming: `${import.meta.env.BASE_URL}sounds/swimming.mp3`,
  hacking: `${import.meta.env.BASE_URL}sounds/hacking.mp3`,
  cityNoise1: `${import.meta.env.BASE_URL}sounds/city-noise-1.mp3`,
  cityNoise2: `${import.meta.env.BASE_URL}sounds/city-noise-2.mp3`,
  nuclearDanger: `${import.meta.env.BASE_URL}sounds/nuclear-danger.mp3`,
  doorOpeningClosing: `${import.meta.env.BASE_URL}sounds/door-opening-closing.mp3`,
  doorClosing: `${import.meta.env.BASE_URL}sounds/door-closing.mp3`,
  carFillingStation: `${import.meta.env.BASE_URL}sounds/car-filling-station.mp3`,
}

const ONE_SHOT_KEYS: SoundKey[] = [
  'openingCarDoor',
  'engineStart',
  'carCrash',
  'engineBreakdown',
  'carBrake',
  'incomingMessage',
  'explosion',
  'doorOpeningClosing',
  'doorClosing',
]

const LOOP_KEYS: SoundKey[] = [
  'carDriven',
  'nuclearDanger',
  'footstepsWalk',
  'footstepsRun',
  'swimming',
  'hacking',
  'cityNoise1',
  'cityNoise2',
  'carFillingStation',
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
    carDriven: 0.5,
    carCrash: 1,
    engineBreakdown: 1,
    carBrake: 1,
    incomingMessage: 1,
    explosion: 1,
    doorOpeningClosing: 0.8,
    doorClosing: 0.8,
    footstepsWalk: 1,
    footstepsRun: 1,
    swimming: 1,
    hacking: 1,
    cityNoise1: 0.4,
    cityNoise2: 0.4,
    nuclearDanger: 0.7,
    carFillingStation: 0.5,
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
  playCarBrake(): void { this.playOneShot('carBrake') }
  playIncomingMessage(): void { this.playOneShot('incomingMessage') }
  playExplosion(): void { this.playOneShot('explosion') }
  playDoorOpeningClosing(): void { this.playOneShot('doorOpeningClosing') }
  playDoorClosing(): void { this.playOneShot('doorClosing') }
  startNuclearDangerLoop(): void { this.startLoop('nuclearDanger') }
  stopNuclearDangerLoop(): void { this.stopLoop('nuclearDanger') }
  setNuclearDangerVolume(v: number): void { this.setVolume('nuclearDanger', v) }

  startCarDrivenLoop(): void { this.startLoop('carDriven') }
  stopCarDrivenLoop(): void { this.stopLoop('carDriven') }
  setCarDrivenVolume(v: number): void { this.setVolume('carDriven', v) }
  setCarDrivenRate(rate: number) {
    const handle = this.loops['carDriven']
    if (handle) handle.source.playbackRate.value = Math.max(0.3, Math.min(2, rate))
  }

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

  startCityNoiseLoop(): void {
    if (this.muted) return
    const key: SoundKey = Math.random() < 0.5 ? 'cityNoise1' : 'cityNoise2'
    if (this.loops[key]) return
    if (this.loops['cityNoise1']) return
    if (this.loops['cityNoise2']) return
    this.startLoop(key)
  }
  stopCityNoiseLoop(): void {
    this.stopLoop('cityNoise1')
    this.stopLoop('cityNoise2')
  }

  startCarFillingStationLoop(): void { this.startLoop('carFillingStation') }
  stopCarFillingStationLoop(): void { this.stopLoop('carFillingStation') }

  stopAllLoops(): void {
    for (const key of LOOP_KEYS) this.stopLoop(key)
  }
}

export const soundEngine = new SoundEngine()

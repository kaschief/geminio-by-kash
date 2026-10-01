/** Deliberate wheel pulls at a file boundary. Pixel deltas are capped so a
 * single wheel notch or trackpad fling cannot change files. */
export type PullDirection = -1 | 1
export const PULL_QUIET_MS = 180
export type PullFeel = 'fast' | 'quick' | 'balanced' | 'deliberate'
export interface PullConfig {
  threshold: number
  minSamples: number
  minDuration: number
  releaseMs: number
  openingMs: number
  entryMs: number
}
const PRESETS: Record<PullFeel, PullConfig> = {
  fast: { threshold: 200, minSamples: 5, minDuration: 100, releaseMs: 150, openingMs: 60, entryMs: 200 },
  quick: { threshold: 240, minSamples: 6, minDuration: 120, releaseMs: 180, openingMs: 80, entryMs: 240 },
  balanced: { threshold: 360, minSamples: 8, minDuration: 180, releaseMs: 220, openingMs: 120, entryMs: 320 },
  deliberate: { threshold: 600, minSamples: 12, minDuration: 300, releaseMs: 320, openingMs: 200, entryMs: 460 }
}
export function pullConfig(feel: unknown): PullConfig {
  return PRESETS[feel === 'fast' || feel === 'quick' || feel === 'deliberate' ? feel : 'balanced']
}

export class ElasticFilePull {
  direction: PullDirection | null = null
  distance = 0
  private lastAt = -Infinity
  private startedAt = 0
  private samples = 0
  private blocked = false

  constructor(private readonly config: PullConfig = pullConfig('balanced')) {}

  get ready(): boolean { return this.distance >= this.config.threshold && this.samples >= this.config.minSamples && this.lastAt - this.startedAt >= this.config.minDuration }
  get progress(): number { return Math.min(1, this.distance / this.config.threshold) }
  get stretch(): number { return 190 * (1 - Math.exp(-this.distance / (this.config.threshold * 0.7))) }

  reset(): void {
    this.direction = null
    this.distance = 0
    this.samples = 0
  }

  wheel(delta: number, at: number, edge: PullDirection | null): boolean {
    const fresh = at - this.lastAt >= PULL_QUIET_MS
    this.lastAt = at
    if (fresh) this.blocked = false
    if (this.direction !== null) {
      // Reversing relaxes the pull. Once relaxed, normal scrolling resumes.
      this.distance = Math.max(0, this.distance + Math.sign(delta) * this.direction * Math.min(50, Math.abs(delta)))
      this.samples++
      if (!this.distance) this.reset()
      return true
    }
    if (!edge) { this.blocked = true; return false }
    // Momentum that brought the reader to the edge must finish first.
    if (this.blocked) return false
    this.direction = edge
    this.startedAt = at
    this.distance = Math.min(50, Math.abs(delta))
    this.samples = 1
    return true
  }

  release(at: number): PullDirection | null {
    const result = this.ready && at - this.startedAt >= 120 ? this.direction : null
    this.reset()
    return result
  }
}

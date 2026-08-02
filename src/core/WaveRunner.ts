import type { EnemyPool } from '../entities/Enemy';
import type { LayoutService } from '../services/LayoutService';
import {
  INTER_WAVE_DELAY_SECONDS,
  WAVES_PER_STAGE,
  buildWaveSchedule,
  stageCount,
  waveAt,
  type ScheduledSpawn,
} from './rules';
import type { RunState } from './RunState';

/**
 * Spawn scheduling and wave-clear detection.
 *
 * Composition comes from waves.json; the HP curve is applied by the Enemy
 * entity from balance.json.
 *
 * Each wave carries a `modifier` field (spec 7). Phase 2 reads and reports it
 * but applies nothing — modifiers land in Phase 4.
 */

export type WaveModifier = 'none' | 'blockedColumn' | 'bomb' | 'fog' | 'rush';

export const INTER_WAVE_DELAY = INTER_WAVE_DELAY_SECONDS;

/** True when waves.json defines the given 1-based stage. */
export function hasStage(stageId: number): boolean {
  return stageId >= 1 && stageId <= stageCount();
}

export class WaveRunner {
  /** Built once per wave, then only read. */
  private schedule: ScheduledSpawn[] = [];
  private nextSpawn = 0;
  private elapsed = 0;
  private running = false;

  constructor(
    private readonly run: RunState,
    private readonly layout: LayoutService,
    private readonly enemies: EnemyPool
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Enemies still to come plus those already on the board. */
  get remaining(): number {
    return this.schedule.length - this.nextSpawn + this.enemies.count;
  }

  get totalThisWave(): number {
    return this.schedule.length;
  }

  get modifier(): WaveModifier {
    return (waveAt(this.run.waveIndex)?.modifier ?? 'none') as WaveModifier;
  }

  /** Stage number (1-based) that the current waveIndex falls in. */
  get stageOfCurrentWave(): number {
    return Math.floor(this.run.waveIndex / WAVES_PER_STAGE) + 1;
  }

  /** Wave number within its stage, 1-based, for display. */
  get waveInStage(): number {
    return (this.run.waveIndex % WAVES_PER_STAGE) + 1;
  }

  get hasWaveForCurrentIndex(): boolean {
    return waveAt(this.run.waveIndex) !== undefined;
  }

  /** Begin the wave at RunState's current cumulative waveIndex. */
  startWave(): void {
    // The timetable, including `rush`, is built by core/rules so the simulator
    // schedules exactly the same fight.
    this.schedule = buildWaveSchedule(this.run.waveIndex);
    this.nextSpawn = 0;
    this.elapsed = 0;
    this.running = this.schedule.length > 0;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.elapsed += dt;

    const cell = this.layout.get().cell;
    while (this.nextSpawn < this.schedule.length && this.schedule[this.nextSpawn].time <= this.elapsed) {
      const entry = this.schedule[this.nextSpawn];
      this.enemies.spawn(entry.type, entry.col, this.run.waveIndex, cell);
      this.nextSpawn++;
    }
  }

  /** True once every scheduled enemy has spawned and none remain alive. */
  isWaveCleared(): boolean {
    return this.running && this.nextSpawn >= this.schedule.length && this.enemies.count === 0;
  }

  stop(): void {
    this.running = false;
  }
}

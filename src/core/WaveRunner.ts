import { GRID_COLS } from '../config/constants';
import wavesConfig from '../config/waves.json';
import type { EnemyPool, EnemyType } from '../entities/Enemy';
import type { LayoutService } from '../services/LayoutService';
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

interface WaveSpawnGroup {
  type: string;
  count: number;
  delaySeconds: number;
}

interface WaveConfig {
  waveIndex: number;
  modifier: string;
  spawnIntervalSeconds: number;
  spawns: WaveSpawnGroup[];
}

interface StageConfig {
  id: number;
  name: string;
  waves: WaveConfig[];
}

interface ScheduledSpawn {
  time: number;
  type: EnemyType;
  col: number;
}

const STAGES = wavesConfig.stages as StageConfig[];
const WAVES_PER_STAGE: number = wavesConfig.wavesPerStage;
export const INTER_WAVE_DELAY: number = wavesConfig.interWaveDelaySeconds;

/** Flat list of every wave in stage order, indexed by cumulative waveIndex. */
const ALL_WAVES: WaveConfig[] = [];
for (const stage of STAGES) for (const wave of stage.waves) ALL_WAVES.push(wave);

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
    const wave = ALL_WAVES[this.run.waveIndex];
    return (wave?.modifier ?? 'none') as WaveModifier;
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
    return this.run.waveIndex < ALL_WAVES.length;
  }

  /** Begin the wave at RunState's current cumulative waveIndex. */
  startWave(): void {
    const wave = ALL_WAVES[this.run.waveIndex];
    this.schedule = [];
    this.nextSpawn = 0;
    this.elapsed = 0;
    this.running = false;

    if (!wave) return;

    // Building the schedule once per wave keeps the frame path allocation-free.
    const interval = wave.spawnIntervalSeconds;
    for (const group of wave.spawns) {
      for (let i = 0; i < group.count; i++) {
        this.schedule.push({
          time: group.delaySeconds + i * interval,
          type: group.type as EnemyType,
          col: Math.floor(Math.random() * GRID_COLS),
        });
      }
    }
    this.schedule.sort((a, b) => a.time - b.time);
    this.running = true;
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

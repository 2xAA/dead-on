export type ClockTickEvent = {
  audioTime: number; // in seconds
  timeMs: DOMHighResTimeStamp;
  tick: number;
  bpm: number;
  ppqn: number;
};

/**
 * Tick event callback signature.
 */
export type TickCallback = (e: ClockTickEvent) => void;

export interface MidiClockOptions {
  /** Beats per minute. Default is 120. */
  bpm?: number;
  /** Pulses (ticks) per quarter note. Default is 24. */
  ppqn?: number;
  /** How far ahead (ms) to schedule events. Default is 50 ms. */
  lookahead?: number;
  /** Interval (ms) between scheduler ticks. Default is 20 ms. */
  interval?: number;
  /** Optional AudioContext for sample-accurate audioTime. */
  audioContext?: AudioContext;
}

type EventType = "tick";

/**
 * A drift-less, performance.now()-based clock for musical timing.
 * Emits "tick" events at a resolution defined by PPQN (ticks per quarter note).
 */
export class DeadOnClock {
  private _bpm: number;
  private _ppqn: number;
  private lookahead: number;
  private interval: number;
  private tickIntervalMs: number;

  private startPerf = 0;
  private nextTickPerf = 0;
  private tickCount = 0;
  private running = false;
  private scheduledEvents: { timeMs: number; callback: () => void }[] = [];

  private listeners: Record<EventType, Set<TickCallback>> = {
    tick: new Set(),
  };

  private audioContext?: AudioContext;
  private startAudioTime = 0;
  private startPerfTime = 0;

  private lastEmittedTick: number = -1;

  get bpm() {
    return this._bpm;
  }

  get ppqn() {
    return this._ppqn;
  }

  get started() {
    return this.running;
  }

  constructor(options: MidiClockOptions = {}) {
    this._bpm = options.bpm ?? 120;
    this._ppqn = options.ppqn ?? 24;
    this.lookahead = options.lookahead ?? 50;
    this.interval = options.interval ?? 20;
    this.audioContext = options.audioContext;

    // One quarter note = 60000 ms / BPM, divided into PPQN pulses
    this.tickIntervalMs = 60000 / this._bpm / this._ppqn;
  }

  /**
   * Subscribe to tick events (one per PPQN pulse).
   */
  on(event: EventType, callback: TickCallback) {
    this.listeners[event].add(callback);
  }

  /**
   * Unsubscribe from tick events.
   */
  off(event: EventType, callback: TickCallback) {
    this.listeners[event].delete(callback);
  }

  /**
   * Start the clock. Emits tick events until stopped.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.tickCount = 0;
    this.startPerf = performance.now();
    this.startPerfTime = this.startPerf;
    if (this.audioContext) {
      this.startAudioTime = this.audioContext.currentTime;
    } else {
      this.startAudioTime = 0;
    }
    this.nextTickPerf = this.startPerf;
    this.schedule();
  }

  /**
   * Stop the clock. No further tick events will fire until restart.
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Change the bpm on the fly. Resets interval calculation.
   */
  setBpm(bpm: number): void {
    this._bpm = bpm;
    this.tickIntervalMs = 60000 / this._bpm / this._ppqn;
  }

  setPpqn(ppqn: number): void {
    this._ppqn = ppqn;
    this.tickIntervalMs = 60000 / this._bpm / this._ppqn;
  }

  /**
   * Schedule a one-off callback at the specified performance.now() timestamp.
   */
  public scheduleAt(callback: () => void, timeMs: number): void {
    this.scheduledEvents.push({ timeMs, callback });
    // Keep events sorted by timeMs
    this.scheduledEvents.sort((a, b) => a.timeMs - b.timeMs);
  }

  /**
   * Core scheduling loop. Looks ahead and emits tick callbacks.
   */
  private schedule(): void {
    if (!this.running) return;

    const now = performance.now();
    const horizon = now + this.lookahead;

    // Emit all tick events up to the lookahead horizon
    while (this.nextTickPerf <= horizon) {
      const timeMs = this.nextTickPerf;
      const tick = this.tickCount++;
      if (tick !== this.lastEmittedTick) {
        for (const listener of this.listeners["tick"]) {
          const audioTime = this.audioContext
            ? this.startAudioTime + (timeMs - this.startPerfTime) / 1000
            : timeMs / 1000;
          listener({ audioTime, timeMs, tick, bpm: this.bpm, ppqn: this.ppqn });
        }
        this.lastEmittedTick = tick;
      }
      this.nextTickPerf += this.tickIntervalMs;
    }

    // Emit any one-off scheduled callbacks up to the lookahead horizon
    while (
      this.scheduledEvents.length &&
      this.scheduledEvents[0].timeMs <= horizon
    ) {
      const ev = this.scheduledEvents.shift()!;
      ev.callback();
    }

    // Compute drift and schedule next iteration
    const drift = performance.now() - now;
    const delay = Math.max(0, this.interval - drift);
    setTimeout(() => this.schedule(), delay);
  }
}

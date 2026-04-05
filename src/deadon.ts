import clockWorkerSource from "./clock-worker.ts?worker-inline";
import schedulerWorkletUrl from "./scheduler-processor.worklet.ts?worklet-inline";

export type SchedulerType = "interval" | "worker" | "audioWorklet";

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
  /** Scheduling backend. Default: "interval" */
  scheduler?: SchedulerType;
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
  private scheduler: SchedulerType;

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

  // Interval backend state
  private intervalTimer: ReturnType<typeof setTimeout> | null = null;

  // Worker backend state
  private worker: Worker | null = null;

  // AudioWorklet backend state
  private workletNode: AudioWorkletNode | null = null;
  private workletModuleLoaded = false;

  get bpm() {
    return this._bpm;
  }

  get ppqn() {
    return this._ppqn;
  }

  get started() {
    return this.running;
  }

  get currentScheduler(): SchedulerType {
    return this.scheduler;
  }

  get currentLookahead(): number {
    return this.lookahead;
  }

  constructor(options: MidiClockOptions = {}) {
    this._bpm = options.bpm ?? 120;
    this._ppqn = options.ppqn ?? 24;
    this.lookahead = options.lookahead ?? 50;
    this.interval = options.interval ?? 20;
    this.audioContext = options.audioContext;
    this.scheduler = options.scheduler ?? "interval";

    // One quarter note = 60000 ms / BPM, divided into PPQN pulses
    this.tickIntervalMs = 60000 / this._bpm / this._ppqn;

    if (this.scheduler === "worker") {
      this.worker = this.createWorker();
    }
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
   * Returns a Promise when using the "audioWorklet" scheduler
   * (due to async module loading), otherwise returns void.
   */
  async start(): Promise<void> {
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

    if (this.scheduler === "audioWorklet") {
      await this.startAudioWorklet();
    } else if (this.worker) {
      this.worker.postMessage({
        type: "start",
        bpm: this._bpm,
        ppqn: this._ppqn,
        lookahead: this.lookahead,
        interval: this.interval,
      });
    } else {
      this.nextTickPerf = this.startPerf;
      this.schedule();
    }
  }

  /**
   * Stop the clock. No further tick events will fire until restart.
   */
  stop(): void {
    this.running = false;
    if (this.intervalTimer !== null) {
      clearTimeout(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.scheduler === "audioWorklet") {
      this.stopAudioWorklet();
    } else if (this.worker) {
      this.worker.postMessage({ type: "stop" });
    }
  }

  /**
   * Change the bpm on the fly. Resets interval calculation.
   */
  setBpm(bpm: number): void {
    this._bpm = bpm;
    this.tickIntervalMs = 60000 / this._bpm / this._ppqn;
    if (this.scheduler === "audioWorklet" && this.workletNode) {
      this.workletNode.port.postMessage({ type: "updateBPM", bpm });
    } else if (this.worker) {
      this.worker.postMessage({ type: "setBpm", bpm });
    }
  }

  setPpqn(ppqn: number): void {
    this._ppqn = ppqn;
    this.tickIntervalMs = 60000 / this._bpm / this._ppqn;
    if (this.scheduler === "audioWorklet" && this.workletNode) {
      this.workletNode.port.postMessage({ type: "updatePPQN", ppqn });
    } else if (this.worker) {
      this.worker.postMessage({ type: "setPpqn", ppqn });
    }
  }

  /**
   * Change the lookahead on the fly and propagate to the active backend.
   */
  setLookahead(ms: number): void {
    this.lookahead = ms;
    if (this.scheduler === "audioWorklet" && this.workletNode) {
      this.workletNode.port.postMessage({ type: "updateLookahead", lookahead: ms });
    } else if (this.worker) {
      this.worker.postMessage({ type: "setLookahead", lookahead: ms });
    }
  }

  /**
   * Switch the scheduling backend. If the clock is running, it will be
   * stopped on the old backend and restarted on the new one.
   */
  async setScheduler(type: SchedulerType): Promise<void> {
    if (type === this.scheduler) return;

    const wasRunning = this.running;
    if (wasRunning) {
      this.stop();
    }

    // Tear down old worker if switching away from "worker"
    if (this.scheduler === "worker" && this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.scheduler = type;

    // Spin up new worker if switching to "worker"
    if (this.scheduler === "worker" && !this.worker) {
      this.worker = this.createWorker();
    }

    if (wasRunning) {
      await this.start();
    }
  }

  /**
   * Schedule a one-off callback at the specified performance.now() timestamp.
   */
  public scheduleAt(callback: () => void, timeMs: number): void {
    this.scheduledEvents.push({ timeMs, callback });
    // Keep events sorted by timeMs
    this.scheduledEvents.sort((a, b) => a.timeMs - b.timeMs);
  }

  // ---------------------------------------------------------------------------
  // Worker backend
  // ---------------------------------------------------------------------------

  /**
   * Create an inline Web Worker from the compiled clock-worker source.
   * Returns null if Workers or Blob URLs are unavailable.
   */
  private createWorker(): Worker | null {
    try {
      const blob = new Blob([clockWorkerSource], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      URL.revokeObjectURL(url);

      worker.onmessage = (e: MessageEvent) => {
        const { data } = e;
        if (data.type === "started") {
          this.startPerfTime = data.startPerf;
          if (this.audioContext) {
            this.startAudioTime = this.audioContext.currentTime;
          }
        } else if (data.type === "tick") {
          this.handleWorkerTick(data.tick, data.timeMs);
        }
      };

      return worker;
    } catch {
      // Worker or Blob unavailable — fall back to main-thread scheduling
      return null;
    }
  }

  /**
   * Process a single tick received from the Worker.
   */
  private handleWorkerTick(tick: number, timeMs: number): void {
    if (!this.running) return;

    this.tickCount = tick + 1;
    this.emitTick(tick, timeMs);

    // Process one-off scheduled callbacks up to this tick's time
    while (
      this.scheduledEvents.length &&
      this.scheduledEvents[0].timeMs <= timeMs
    ) {
      const ev = this.scheduledEvents.shift()!;
      ev.callback();
    }
  }

  // ---------------------------------------------------------------------------
  // AudioWorklet backend
  // ---------------------------------------------------------------------------

  private async startAudioWorklet(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.startAudioTime = this.audioContext.currentTime;

    if (!this.workletModuleLoaded) {
      await this.audioContext.audioWorklet.addModule(schedulerWorkletUrl);
      this.workletModuleLoaded = true;
    }

    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "scheduler-processor",
      {
        processorOptions: {
          bpm: this._bpm,
          ppqn: this._ppqn,
          lookahead: this.lookahead,
        },
      },
    );

    // Required: connect to destination so process() is called
    this.workletNode.connect(this.audioContext.destination);

    this.workletNode.port.onmessage = (e: MessageEvent) => {
      if (!this.running) return;
      const { data } = e;
      if (data.type === "tick") {
        const tick = this.tickCount++;
        this.emitTick(tick, data.scheduledTime);

        // Process one-off scheduled callbacks
        while (
          this.scheduledEvents.length &&
          this.scheduledEvents[0].timeMs <= data.scheduledTime
        ) {
          const ev = this.scheduledEvents.shift()!;
          ev.callback();
        }
      }
    };

    // Tell the worklet processor to start with the current perf time
    this.workletNode.port.postMessage({
      type: "start",
      time: performance.now(),
    });
  }

  private stopAudioWorklet(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.close();
      this.workletNode = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Shared tick emission
  // ---------------------------------------------------------------------------

  private emitTick(tick: number, timeMs: number): void {
    if (tick === this.lastEmittedTick) return;
    this.lastEmittedTick = tick;

    for (const listener of this.listeners["tick"]) {
      const audioTime = this.audioContext
        ? this.startAudioTime + (timeMs - this.startPerfTime) / 1000
        : timeMs / 1000;
      listener({
        audioTime,
        timeMs,
        tick,
        bpm: this._bpm,
        ppqn: this._ppqn,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Interval (setTimeout) backend — main-thread fallback
  // ---------------------------------------------------------------------------

  /**
   * Core scheduling loop (main-thread fallback).
   * Looks ahead and emits tick callbacks.
   */
  private schedule(): void {
    if (!this.running) return;

    const now = performance.now();
    const horizon = now + this.lookahead;

    // Emit all tick events up to the lookahead horizon
    while (this.nextTickPerf <= horizon) {
      const timeMs = this.nextTickPerf;
      const tick = this.tickCount++;
      this.emitTick(tick, timeMs);
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
    this.intervalTimer = setTimeout(() => this.schedule(), delay);
  }
}

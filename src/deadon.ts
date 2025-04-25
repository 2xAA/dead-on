import schedulerWorkletSource from './scheduler-processor.worklet.ts?raw';

export interface DeadOnClockOptions {
  bpm: number;
  lookaheadMs?: number;
  audioContext?: AudioContext;
}

export interface ClockTickEvent {
  scheduledTimeMs: number;
  audioTime: number;
  tick: number;
  isQuarter: boolean;
  isBar: boolean;
  bpm: number;
}

type EventType = "tick" | "quarter" | "bar";
type TickCallback = (e: ClockTickEvent) => void;

export async function addDeadOnWorklet(audioContext: AudioContext) {
  const blob = new Blob([schedulerWorkletSource], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await audioContext.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
}

export class DeadOnClock {
  private bpm: number;
  private lookaheadMs: number;
  private ctx: AudioContext;
  private schedulerNode: AudioWorkletNode | null = null;
  private tickCount: number = 0;
  private _started: boolean = false;
  private listeners: Record<EventType, Set<TickCallback>> = {
    tick: new Set(),
    quarter: new Set(),
    bar: new Set(),
  };
  private timeOriginPerfNow: number = 0;
  private timeOriginAudioTime: number = 0;

  get started() {
    return this._started;
  }

  constructor(opts: DeadOnClockOptions) {
    this.bpm = opts.bpm;
    this.lookaheadMs = opts.lookaheadMs ?? 10;
    this.ctx = opts.audioContext ?? new AudioContext();
    this.setupWorklet();
  }

  private async setupWorklet() {
    await addDeadOnWorklet(this.ctx);
    this.schedulerNode = new AudioWorkletNode(this.ctx, "scheduler-processor", {
      processorOptions: { bpm: this.bpm },
    });
  }

  async start() {
    if (this.started) return;
    this.timeOriginPerfNow = performance.now();
    this.timeOriginAudioTime = this.ctx.currentTime;
    this.schedulerNode!.port.postMessage({ type: "start", time: this.timeOriginPerfNow });
    this.schedulerNode!.port.onmessage = (event) => {
      if (event.data.type === "tick") {
        this.handleTick(event.data.scheduledTime);
      }
    };
    this.schedulerNode!.connect(this.ctx.destination);
    this._started = true;
  }

  stop() {
    this.schedulerNode?.disconnect();
    this._started = false;
    this.tickCount = 0;
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
    this.schedulerNode?.port.postMessage({ type: "updateBPM", bpm });
  }

  on(event: EventType, callback: TickCallback) {
    this.listeners[event].add(callback);
  }

  off(event: EventType, callback: TickCallback) {
    this.listeners[event].delete(callback);
  }

  private handleTick(scheduledTimeMs: number) {
    this.tickCount++;
    const e: ClockTickEvent = {
      scheduledTimeMs,
      audioTime: this.wallToAudioTime(scheduledTimeMs),
      tick: this.tickCount,
      isQuarter: this.tickCount % 6 === 0,
      isBar: this.tickCount % 24 === 0,
      bpm: this.bpm,
    };
    for (const cb of this.listeners["tick"]) cb(e);
    if (e.isQuarter) for (const cb of this.listeners["quarter"]) cb(e);
    if (e.isBar) for (const cb of this.listeners["bar"]) cb(e);
  }

  wallToAudioTime(scheduledTimeMs: number): number {
    return this.timeOriginAudioTime + (scheduledTimeMs - this.timeOriginPerfNow) / 1000;
  }

  audioToWallTime(audioTime: number): number {
    return this.timeOriginPerfNow + (audioTime - this.timeOriginAudioTime) * 1000;
  }
}
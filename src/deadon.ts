import schedulerWorkletSource from "./scheduler-processor.worklet.ts?raw";

export interface DeadOnClockOptions {
  bpm: number;
  lookaheadMs?: number;
  audioContext?: AudioContext;
  ppqn?: number;
}

export interface ClockTickEvent {
  scheduledTimeMs: number;
  audioTime: number;
  tick: number;
  bpm: number;
}

type EventType = "tick";
type TickCallback = (e: ClockTickEvent) => void;

async function addDeadOnWorklet(audioContext: AudioContext) {
  const blob = new Blob([schedulerWorkletSource], {
    type: "application/javascript",
  });
  const url = URL.createObjectURL(blob);
  await audioContext.audioWorklet.addModule(url);
}

export class DeadOnClock {
  private bpm: number;
  private lookaheadMs: number;
  private ctx: AudioContext;
  private ppqn: number;
  private schedulerNode: AudioWorkletNode | null = null;
  private tickCount: number = 0;
  private _started: boolean = false;
  private listeners: Record<EventType, Set<TickCallback>> = {
    tick: new Set(),
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
    this.ppqn = opts.ppqn ?? 24;
  }

  private async setupWorklet() {
    await addDeadOnWorklet(this.ctx);
    this.schedulerNode = new AudioWorkletNode(this.ctx, "scheduler-processor", {
      processorOptions: { bpm: this.bpm, ppqn: this.ppqn },
    });
  }

  async start() {
    if (this.started) return;
    if (!this.schedulerNode) {
      await this.setupWorklet();
    }
    this.tickCount = 0;
    this.timeOriginPerfNow = performance.now();
    this.timeOriginAudioTime = this.ctx.currentTime;
    this.schedulerNode!.port.postMessage({
      type: "start",
      time: this.timeOriginPerfNow,
    });
    this.schedulerNode!.port.onmessage = (event) => {
      if (event.data.type === "tick") {
        this.handleTick(event.data.scheduledTime);
      }
    };
    this.schedulerNode!.connect(this.ctx.destination);
    this._started = true;
  }

  stop() {
    if (this.schedulerNode) {
      this.schedulerNode.disconnect();
      this.schedulerNode.port.onmessage = null;
      this.schedulerNode = null;
    }
    this._started = false;
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
    // Re-base scheduling time origin at change
    this.timeOriginPerfNow = performance.now();
    this.timeOriginAudioTime = this.ctx.currentTime;
    this.schedulerNode?.port.postMessage({
      type: "updateBPM",
      bpm,
      time: this.timeOriginPerfNow,
    });
  }

  public setPpqn(ppqn: number) {
    this.ppqn = ppqn;
    // Re-base scheduling time origin
    this.timeOriginPerfNow = performance.now();
    this.timeOriginAudioTime = this.ctx.currentTime;
    this.schedulerNode?.port.postMessage({
      type: "updatePPQN",
      ppqn,
      time: this.timeOriginPerfNow,
    });
  }

  on(event: EventType, callback: TickCallback) {
    this.listeners[event].add(callback);
  }

  off(event: EventType, callback: TickCallback) {
    this.listeners[event].delete(callback);
  }

  private handleTick(scheduledTimeMs: number) {
    const e: ClockTickEvent = {
      scheduledTimeMs,
      audioTime: this.wallToAudioTime(scheduledTimeMs),
      tick: this.tickCount,
      bpm: this.bpm,
    };
    this.tickCount++;
    for (const cb of this.listeners["tick"]) cb(e);
  }

  wallToAudioTime(scheduledTimeMs: number): number {
    return (
      this.timeOriginAudioTime +
      (scheduledTimeMs - this.timeOriginPerfNow) / 1000
    );
  }

  audioToWallTime(audioTime: number): number {
    return (
      this.timeOriginPerfNow + (audioTime - this.timeOriginAudioTime) * 1000
    );
  }
}

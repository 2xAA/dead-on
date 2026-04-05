class SchedulerProcessor extends AudioWorkletProcessor {
  bpm: number;
  ppqn: number;
  tickCount: number;
  startTimeMs: number;
  elapsedSamples: number;
  lookaheadMs: number;
  started: boolean;

  get tickIntervalSec() {
    return 60 / (this.bpm * this.ppqn);
  }

  constructor(options: {
    processorOptions: { bpm?: number; ppqn?: number; lookahead?: number };
  }) {
    super();
    this.bpm = options.processorOptions.bpm || 120;
    this.ppqn = options.processorOptions.ppqn || 24;
    this.lookaheadMs = options.processorOptions.lookahead || 50;
    this.tickCount = 0;
    this.startTimeMs = 0;
    this.elapsedSamples = 0;
    this.started = false;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "updateBPM") {
        this.bpm = event.data.bpm;
        // Re-anchor startTimeMs to the worklet's current time
        this.startTimeMs += (this.elapsedSamples / sampleRate) * 1000;
        this.elapsedSamples = 0;
        this.tickCount = 0;
      } else if (event.data && event.data.type === "updatePPQN") {
        this.ppqn = event.data.ppqn;
        // Re-anchor startTimeMs to the worklet's current time
        this.startTimeMs += (this.elapsedSamples / sampleRate) * 1000;
        this.elapsedSamples = 0;
        this.tickCount = 0;
      } else if (event.data && event.data.type === "updateLookahead") {
        this.lookaheadMs = event.data.lookahead;
      } else if (event.data && event.data.type === "start") {
        this.startTimeMs = event.data.time;
        this.tickCount = 0;
        this.elapsedSamples = 0;
        this.started = true;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.started) return true;

    const blockSize: number = outputs[0]?.[0]?.length || 128;
    this.elapsedSamples += blockSize;

    const nowMs =
      this.startTimeMs + (this.elapsedSamples / sampleRate) * 1000;
    const horizonMs = nowMs + this.lookaheadMs;

    while (true) {
      const tickTimeMs =
        this.startTimeMs + this.tickCount * this.tickIntervalSec * 1000;
      if (tickTimeMs > horizonMs) break;
      this.port.postMessage({ type: "tick", scheduledTime: tickTimeMs });
      this.tickCount++;
    }

    return true;
  }
}

registerProcessor("scheduler-processor", SchedulerProcessor);

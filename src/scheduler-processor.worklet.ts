class SchedulerProcessor extends AudioWorkletProcessor {
  bpm: number;
  ppqn: number;
  currentSample: number;
  tickCount: number;
  startTimeMs: number;

  get tickIntervalSec() {
    return 60 / (this.bpm * this.ppqn);
  }

  get samplesPerTick() {
    return this.tickIntervalSec * sampleRate;
  }

  constructor(options: { processorOptions: { bpm?: number; ppqn?: number } }) {
    super();
    this.bpm = options.processorOptions.bpm || 120;
    this.ppqn = options.processorOptions.ppqn || 24;
    this.currentSample = 0;
    this.tickCount = 0;
    this.startTimeMs = 0;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "updateBPM") {
        this.bpm = event.data.bpm;
        // If a new time origin is provided, reset to it
        if (event.data.time != null) {
          this.startTimeMs = event.data.time;
        }
        this.tickCount = 0;
        this.currentSample = 0;
      } else if (event.data && event.data.type === "updatePPQN") {
        this.ppqn = event.data.ppqn;
        // If a new time origin is provided, reset to it
        if (event.data.time != null) {
          this.startTimeMs = event.data.time;
        }
        this.tickCount = 0;
        this.currentSample = 0;
      } else if (event.data && event.data.type === "start") {
        this.startTimeMs = event.data.time;
        this.tickCount = 0;
        this.currentSample = 0;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const blockSize: number = outputs[0]?.[0]?.length || 128;
    this.currentSample += blockSize;

    while (this.currentSample >= this.samplesPerTick) {
      this.currentSample -= this.samplesPerTick;

      const scheduledTime: number =
        this.startTimeMs + this.tickCount * this.tickIntervalSec * 1000;

      this.port.postMessage({ type: "tick", scheduledTime });
      this.tickCount++;
    }
    return true;
  }
}

registerProcessor("scheduler-processor", SchedulerProcessor);

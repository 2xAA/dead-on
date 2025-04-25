class SchedulerProcessor extends AudioWorkletProcessor {
    get tickIntervalSec() {
      return 60 / (this.bpm * 24);
    }
  
    get samplesPerTick() {
      return this.tickIntervalSec * sampleRate;
    }
  
    constructor() {
      super();
      this.bpm = 120;
      this.currentSample = 0;
      this.tickCount = 0;
      this.startTimeMs = 0;

      this.port.onmessage = (event) => {
        if (event.data && event.data.type === "updateBPM") {
          this.bpm = event.data.bpm;
          this.currentSample = 0;
        } else if (event.data && event.data.type === "start") {
          this.startTimeMs = event.data.time;
          this.tickCount = 0;
          this.currentSample = 0;
        }
      };
    }
  
    process(_inputs, outputs) {
      const blockSize = outputs[0]?.[0]?.length || 128;
      this.currentSample += blockSize;
      while (this.currentSample >= this.samplesPerTick) {
        this.currentSample -= this.samplesPerTick;
        const scheduledTime =
          this.startTimeMs + this.tickCount * this.tickIntervalSec * 1000;
        this.port.postMessage({ type: "tick", scheduledTime });
        this.tickCount++;
      }
      return true;
    }
  }
  
  registerProcessor("scheduler-processor", SchedulerProcessor);
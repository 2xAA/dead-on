/**
 * Unified note payload for Web Audio, Web MIDI, or UI callbacks.
 * - freq?: frequency in Hz (Web Audio)
 * - midiNote?: MIDI note number (Web MIDI)
 * - velocity?: MIDI velocity (0-127)
 * - durationMs?: how long the note lasts (default 100ms)
 * - uiCallback?: optional function to invoke for UI updates
 */
export interface NotePayload {
  freq?: number;
  midiNote?: number;
  velocity?: number;
  durationMs?: number;
  uiCallback?: () => void;
}
// src/DeadOnSequencer.ts
import { DeadOnClock } from "./deadon";

/**
 * A step action: any array of payloads scheduled across the zone from this step
 * to the next non-null step, subdivided into hits per step.
 */
export interface StepAction<P = any> {
  payload: P[]; // one or more items to play
  subdivs?: number; // hits per step (default 1)
  offsetTick?: number | null;
  offsetMs?: number | null; // humanization offset
}

/**
 * DeadOnSequencer
 *
 * Drives a fixed-length cycle (default 16 steps in 4/4) on top of DeadOnClock.
 * Each step may hold exactly one StepAction, and the entire schedule is
 * pre-calculated into a tick→payload map for O(1) lookups at runtime.
 */
export class DeadOnSequencer<P = any> {
  private sequence: Array<StepAction<P> | null>;
  private schedule = new Map<number, P[]>();
  public barTicks: number;
  private effectiveBarTicks: number;
  private ticksPerStep: number;
  private secPerTick: number;

  public bpm: number = 120;
  public ppqn: number = 24;
  /** Speed division: 1 = normal, 2 = half-speed, etc. */
  public division: number = 1;

  /**
   * @param clock   DeadOnClock instance
   * @param steps   number of steps per bar (default: 16)
   * @param ppqn    pulses per quarter note (must match clock.ppqn)
   * @param bpm     tempo in BPM (must match clock.bpm)
   */
  constructor(
    private clock: DeadOnClock,
    public steps: number = 16,
    ppqn?: number,
    bpm?: number
  ) {
    this.ppqn = ppqn ?? clock.ppqn;
    this.bpm = bpm ?? clock.bpm;

    this.barTicks = this.ppqn * 4;
    this.effectiveBarTicks = this.barTicks / this.division;
    this.secPerTick = 60 / (this.bpm * this.ppqn);
    this.ticksPerStep = this.effectiveBarTicks / this.steps;
    this.sequence = Array(this.steps).fill(null);
    this.rebuildSchedule();
  }

  /**
   * Replace the entire step sequence at once.
   * @param seq array of length `steps`, each entry a StepAction or null
   */
  public setSequence(seq: Array<StepAction<P> | null>) {
    if (seq.length !== this.steps) {
      throw new Error(`Sequence length must be ${this.steps}`);
    }
    this.sequence = seq.slice();
    this.rebuildSchedule();
  }

  /**
   * Set or clear the action at a single step.
   * @param step  step index [0…steps-1]
   * @param action a StepAction or null
   */
  public setStep(step: number, action: StepAction<P> | null) {
    if (step < 0 || step >= this.steps) {
      throw new Error(`Step must be between 0 and ${this.steps - 1}`);
    }
    this.sequence[step] = action;
    this.rebuildSchedule();
  }

  /** Clear all steps. */
  public clearSequence() {
    this.sequence.fill(null);
    this.rebuildSchedule();
  }

  /**
   * Update PPQN in real time; rebuilds schedule.
   */
  public setPpqn(ppqn: number) {
    this.ppqn = ppqn;
    this.barTicks = this.ppqn * 4;
    this.effectiveBarTicks = this.barTicks / this.division;
    this.ticksPerStep = this.effectiveBarTicks / this.steps;
    this.secPerTick = 60 / (this.bpm * this.ppqn);
    this.rebuildSchedule();
  }

  /**
   * Update BPM in real time; rebuilds schedule.
   */
  public setBpm(bpm: number) {
    this.bpm = bpm;
    this.secPerTick = 60 / (this.bpm * this.ppqn);
    this.effectiveBarTicks = this.barTicks / this.division;
    this.ticksPerStep = this.effectiveBarTicks / this.steps;
    this.rebuildSchedule();
  }

  /**
   * Slow down or speed up the sequencer by an integer factor.
   * @param division 1 = normal, 2 = half-speed, etc.
   */
  public setDivision(division: number) {
    this.division = Math.max(1, Math.floor(division));
    this.effectiveBarTicks = this.barTicks / this.division;
    this.ticksPerStep = this.effectiveBarTicks / this.steps;
    this.rebuildSchedule();
  }

  /**
   * Clear the action at a single step.
   * @param step step index [0..steps-1]
   */
  public clearStep(step: number) {
    this.setStep(step, null);
  }

  /**
   * Get all payloads scheduled at a given global tick.
   * @param tick  DeadOn clock tick
   */
  public getPayloadsForTick(tick: number): P[] {
    return this.schedule.get(tick % this.effectiveBarTicks) ?? [];
  }

  /** Internal: rebuild the tick→payload map from `sequence`. */
  private rebuildSchedule() {
    this.schedule.clear();

    for (let step = 0; step < this.steps; step++) {
      const action = this.sequence[step];
      if (!action) continue;
      // Find next step index with an action (or wrap to start)
      let nextStep = (step + 1) % this.steps;
      while (nextStep !== step && !this.sequence[nextStep]) {
        nextStep = (nextStep + 1) % this.steps;
      }
      // Determine zone length in steps
      const zoneLength =
        nextStep === step
          ? this.steps
          : nextStep > step
          ? nextStep - step
          : nextStep + this.steps - step;

      const subdivs = action.subdivs ?? 0;
      const msPerTick = this.secPerTick * 1000;
      const offsetTicks =
        action.offsetTick != null && action.offsetTick > 0
          ? Math.round(action.offsetTick)
          : action.offsetMs != null
          ? Math.round(action.offsetMs / msPerTick)
          : 0;

      // If subdivs is zero, play all payloads simultaneously
      if (subdivs === 0) {
        const baseTick = Math.floor(step * this.ticksPerStep);
        const tick = baseTick + offsetTicks;
        for (const item of action.payload) {
          this.pushPayloadAt(tick, item);
        }
        continue;
      }

      // Total subdivision slots across the zone
      const totalSubdivs = zoneLength * subdivs;

      // Schedule each subdivision across the zone
      for (let s = 0; s < totalSubdivs; s++) {
        const stepOffset = Math.floor(s / subdivs);
        const subOffset = s % subdivs;
        const curStep = (step + stepOffset) % this.steps;
        const baseTick = Math.floor(curStep * this.ticksPerStep);
        const subTick =
          baseTick +
          Math.floor((subOffset / subdivs) * this.ticksPerStep) +
          offsetTicks;
        // Cycle through payloads
        const item = action.payload[s % action.payload.length];
        this.pushPayloadAt(subTick, item);
      }
    }
  }

  /** Internal helper to record a payload at a given tick index. */
  private pushPayloadAt(rawTick: number, payload: P) {
    const idx =
      ((rawTick % this.effectiveBarTicks) + this.effectiveBarTicks) %
      this.effectiveBarTicks;
    const arr = this.schedule.get(idx) ?? [];
    arr.push(payload);
    this.schedule.set(idx, arr);
  }

  /**
   * Schedule start/stop for a Web Audio oscillator.
   * @param osc            the OscillatorNode to schedule
   * @param startTimeSec   AudioContext time in seconds to start
   * @param durationMs     duration in milliseconds (default 100ms)
   */
  public static triggerAudio(
    osc: OscillatorNode | AudioBufferSourceNode,
    startTimeSec: number,
    durationMs: number = 100
  ) {
    const stopTime = startTimeSec + durationMs / 1000;
    osc.start(startTimeSec);
    osc.stop(stopTime);
  }

  /**
   * Schedule a Web MIDI note-on and note-off.
   * @param midiOut        MIDIOutput to send messages on
   * @param note           MIDI note number
   * @param velocity       MIDI velocity (0–127)
   * @param startTimeMs    DOMHighResTimeStamp timestamp to send note-on
   * @param durationMs     milliseconds until note-off (default 100ms)
   */
  public static triggerMidi(
    midiOut: MIDIOutput,
    note: number,
    velocity: number,
    startTimeMs: number,
    offTimestampMs: number = 100
  ) {
    // ensure the on-time isn't in the past relative to performance.now()
    const nowMs = performance.now();
    const onTimeMs = Math.max(startTimeMs, nowMs);

    midiOut.send([0x90, note, velocity], onTimeMs);
    midiOut.send([0x80, note, 0x00], offTimestampMs);
  }
}

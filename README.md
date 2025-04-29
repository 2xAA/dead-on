<p align="center" dir="auto">
  <img src="./DeadOn Logo.png" width="80%">
</p>

<br/>

# DeadOn

DeadOn is a drift-less, performance.now()–based clock for precision musical timing in web applications. It emits sample-accurate ticks at a configurable pulses-per-quarter-note (PPQN) resolution, making it ideal for synchronising Web Audio, Web MIDI, UI updates, or any custom scheduling needs.

---

## Table of Contents

- [Why DeadOn?](#why-deadon)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
  - [Creating a Clock](#creating-a-clock)
  - [Subscribing to Ticks](#subscribing-to-ticks)
  - [Scheduling One-Off Callbacks](#scheduling-one-off-callbacks)
- [API](#api)
  - [`new DeadOnClock(opts)`](#new-deadonclockopts)
  - [`clock.start()`](#clockstart)
  - [`clock.stop()`](#clockstop)
  - [`clock.setBpm(bpm)`](#clocksetbpmbpm)
  - [`clock.setPpqn(ppqn)`](#clocksetppqnppqn)
  - [`clock.on('tick', callback)`](#clockontick-callback)
  - [`clock.off('tick', callback)`](#clockofftick-callback)
  - [`clock.scheduleAt(callback, timeMs)`](#clockscheduleatcallback-timems)
  - [`DeadOnSequencer<P>`](#deadonsequencerp)
  - [Static Helpers](#static-helpers)
- [License](#license)

---

## Why DeadOn?

- **Drift-less scheduling:** Uses `performance.now()` for a reliable timebase.
- **Configurable resolution:** Adjustable PPQN for any musical subdivision.
- **Tunable lookahead & interval:** Balance scheduling ahead of time with responsiveness.
- **Lightweight:** No dependencies and minimal setup.

---

## Installation

Install via npm:

```bash
npm install dead-on
```

---

## Basic Usage

### Creating a Clock

```ts
import { DeadOnClock } from "dead-on";

const audioCtx = new AudioContext(); // optional for sample-accurate audioTime

const clock = new DeadOnClock({
  bpm: 120, // beats per minute (default: 120)
  ppqn: 24, // pulses per quarter-note (default: 24)
  lookahead: 50, // how far ahead to schedule in ms (default: 50)
  interval: 20, // main loop interval in ms (default: 20)
  audioContext: audioCtx, // optional AudioContext
});

clock.start();
```

### Subscribing to Ticks

```ts
const quarterTicks = clock.ppqn;
const barTicks = clock.ppqn * 4;

clock.on("tick", (e) => {
  // e.timeMs: high-resolution wall-clock timestamp (performance.now())
  // e.audioTime: AudioContext.currentTime if provided, else timeMs/1000
  // e.tick: integer tick count

  if (e.tick % quarterTicks === 0) {
    // quarter-note event
  }
  if (e.tick % barTicks === 0) {
    // bar event
  }
});
```

### Scheduling One-Off Callbacks

Use `clock.scheduleAt` to run a callback exactly at a future `timeMs`:

```ts
clock.scheduleAt(() => {
  console.log("Runs precisely on the tick!");
}, e.timeMs);
```

---

## API

### `new DeadOnClock(opts)`

Creates a new clock.

| Option         | Type           | Default | Description                            |
| -------------- | -------------- | ------- | -------------------------------------- |
| `bpm`          | `number`       | `120`   | Beats per minute                       |
| `ppqn`         | `number`       | `24`    | Pulses per quarter-note                |
| `lookahead`    | `number` (ms)  | `50`    | How far ahead to schedule events       |
| `interval`     | `number` (ms)  | `20`    | Main loop interval                     |
| `audioContext` | `AudioContext` | `-`     | Optional for sample-accurate audioTime |

#### Methods

- `clock.start()` → `void`  
  Start the clock (no-op if already running).

- `clock.stop()` → `void`  
  Stop the clock.

- `clock.setBpm(bpm: number)` → `void`  
  Change the tempo on the fly.

- `clock.setPpqn(ppqn: number)` → `void`  
  Change the resolution on the fly.

- `clock.on('tick', callback)` → `void`  
  Subscribe to tick events.  
  `callback(e: { timeMs: number; audioTime: number; tick: number })`

- `clock.off('tick', callback)` → `void`  
  Unsubscribe from tick events.

- `clock.scheduleAt(callback: () => void, timeMs: number)` → `void`  
  Schedule a one-off callback at a specific `performance.now()` timestamp.

---

## DeadOnSequencer<P>

A fixed-length, latency-free step sequencer built on top of `DeadOnClock`.

```ts
import { DeadOnSequencer, StepAction } from "dead-on";

// Create a 16-step sequencer
const seq = new DeadOnSequencer(clock, 16);

// Define a pattern
type Note = { freq: number; durationMs: number };
const pattern: Array<StepAction<Note> | null> = Array(16).fill(null);
pattern[0] = {
  payload: [{ freq: 440, durationMs: 200 }],
  subdivs: 0, // play all payloads at once
  offsetMs: 10, // shift by 10ms
};

seq.setSequence(pattern);

// Play payloads on each tick
clock.on("tick", (e) => {
  const payloads = seq.getPayloadsForTick(e.tick);
  for (const note of payloads) {
    const osc = audioCtx.createOscillator();
    DeadOnSequencer.triggerAudio(osc, e.audioTime, note.durationMs);
  }
});
```

### StepAction<P>

```ts
interface StepAction<P> {
  payload: P[]; // one or more items to schedule
  subdivs?: number; // subdivisions per step (default: 0)
  offsetMs?: number; // humanization or timing offset in ms
}
```

### Methods

| Method                              | Description                                   |
| ----------------------------------- | --------------------------------------------- |
| `new DeadOnSequencer(clock, steps)` | Create a sequencer with given number of steps |
| `seq.setSequence(seq)`              | Replace entire sequence at once               |
| `seq.setStep(step, action)`         | Set or clear a single step                    |
| `seq.clearSequence()`               | Clear all steps                               |
| `seq.clearStep(step)`               | Clear a specific step                         |
| `seq.setBpm(bpm)`                   | Change sequencer tempo                        |
| `seq.setPpqn(ppqn)`                 | Change sequencer resolution                   |
| `seq.setDivision(div)`              | Speed up/slow down playback (1 = normal)      |
| `seq.getPayloadsForTick(tick)`      | Get payloads scheduled on a given tick        |

### Static Helpers

- `DeadOnSequencer.triggerAudio(osc: OscillatorNode, startTimeSec: number, durationMs?: number)`
- `DeadOnSequencer.triggerMidi(midiOut: MIDIOutput, note: number, velocity: number, startTimeMs: number, offTimeMs?: number)`

---

## License

Apache 2.0 © 2xAA

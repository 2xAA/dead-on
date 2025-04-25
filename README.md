<br/>
<p align="center" dir="auto">
  <img src="./DeadOn Logo.png" width="80%">
</p>

<br/>

# DeadOn

DeadOn is a lightweight, precision-timing library for web applications. Leveraging the AudioWorklet API, it delivers sample-accurate clock ticks at a configurable pulses-per-quarter-note resolution.

With DeadOn, you get a unified timebase for scheduling Web Audio and Web MIDI events, ensuring consistent timing even under heavy load.

---

## Table of Contents

- [Why DeadOn?](#why-deadon)
- [Getting Started](#getting-started)
- [Main Concepts](#main-concepts)
- [Using `audioTime`](#using-audiotime)
- [Example: deriving quarter & bar](#example-deriving-quarter--bar)
- [API Reference](#api-reference)
  - [`new DeadOnClock(opts)`](#new-deadonclockopts)
  - [`clock.start()`](#clockstart)
  - [`clock.stop()`](#clockstop)
  - [`clock.setBpm(bpm)`](#clocksetbpmbpm)
  - [`clock.setPpqn(ppqn)`](#clocksetppqnppqn)
  - [`clock.on('tick', callback)`](#clockontick-callback)
  - [`clock.off('tick', callback)`](#clockofftick-callback)
- [ClockTickEvent](#clocktickevent)
- [Browser Support](#browser-support)
- [License](#license)

---

## Why DeadOn?

In web-based audio and MIDI applications, precise timing is essential. Traditional JavaScript timers can suffer from event loop delays and CPU contention, leading to drift and jitter. DeadOn solves these challenges by running timing on a dedicated audio thread:

- **Sample-accurate ticks:** Configurable PPQN delivers consistent timing at any musical resolution.
- **Seamless tempo and resolution changes:** Update BPM or PPQN on the fly without dropping ticks.
- **Unified scheduling base:** One clock for both Web Audio and Web MIDI, simplifying synchronization.
- **Minimal setup:** Load the worklet in one line and subscribe to `"tick"` events with a clear API.
- **TypeScript support:** Built-in type definitions for improved developer experience.

DeadOn abstracts low-level scheduling details, allowing you to focus on building your audio and MIDI logic.

---

## Getting Started

Install via npm:

```bash
npm install @2xAA/deadon
```

Load the worklet and create a clock:

```ts
import { DeadOnClock } from "dead-on";

const audioCtx = new AudioContext();

const clock = new DeadOnClock({
  bpm: 120, // starting tempo
  audioContext: audioCtx, // optional, defaults to new AudioContext()
  lookaheadMs: 10, // optional scheduling lookahead (default 10ms)
  ppqn: 24, // pulses per quarter-note (default 24)
});

(async () => {
  // Start the clock
  await clock.start();

  const quarterTicks = clock.ppqn; // ticks per quarter‑note
  const barTicks = clock.ppqn * 4; // ticks per bar (4/4)
  const quarterSeconds = 60 / clock.bpm; // seconds per quarter‑note

  // Subscribe to ticks and derive events
  clock.on("tick", (e) => {
    if (e.tick % quarterTicks === 0) {
      // quarter-note event
      playHiHat(e.audioTime);
    }

    if (e.tick % barTicks === 0) {
      // bar event
      playChord(e.audioTime);
    }
  });
})();
```

---

## Main Concepts

- **PPQN (Pulses Per Quarter Note)**  
  The number of internal ticks per quarter-note. Controls timing resolution.
- **Ticks**  
  Each “tick” is emitted by the audio worklet at intervals of `(60 / (bpm * ppqn))` seconds.
- **audioTime**  
  The `audioTime` property is the `AudioContext.currentTime` (in seconds) when the tick occurs, enabling sample-accurate scheduling.
- **Events**  
  DeadOn only emits `"tick"` events. Derive higher‑level musical timing (quarters, bars, steps) from the tick count in your application code.

---

## Using `audioTime`

The `audioTime` property is the exact `AudioContext.currentTime` (in seconds) when the tick occurs. This lets you schedule Web Audio or Web MIDI events with sample-accurate timing aligned to the audio engine.

### Scheduling Web Audio

You can use `audioTime` directly to start or stop oscillators, envelopes, or effects exactly on the tick:

```ts
clock.on("tick", (e) => {
  if (e.tick % quarterTicks === 0) {
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 440;
    osc.connect(audioCtx.destination);
    // Starts precisely at the tick
    osc.start(e.audioTime);
    osc.stop(e.audioTime + 0.1);
  }
});
```

### Scheduling Web MIDI

The Web MIDI API's `MIDIOutput.send()` accepts an optional timestamp in milliseconds (DOMHighResTimeStamp). To align MIDI messages to the same tick, convert `audioTime` to the corresponding performance timestamp:

```ts
clock.on("tick", (e) => {
  if (e.tick % quarterTicks === 0) {
    const nowMs = performance.now();
    const scheduleTimeMs = nowMs + (e.audioTime - audioCtx.currentTime) * 1000;
    // Send a middle C note-on (0x90, note, velocity)
    midiOutput.send([0x90, 60, 0x7f], scheduleTimeMs);
  }
});
```

This ensures your MIDI hardware plays in perfect sync with your audio events.

---

## Example: deriving quarter & bar

DeadOn emits only ticks. For example, with 24 ppqn:

```ts
clock.on("tick", (e) => {
  const ticksPerQuarter = 24 / 4;
  const ticksPerBar = 24; // 4/4 time
  if (e.tick % ticksPerQuarter === 0) {
    // quarter-note event
    playHiHat(e.audioTime);
  }
  if (e.tick % ticksPerBar === 0) {
    // bar event
    playChord(e.audioTime);
  }
});
```

---

### `new DeadOnClock(opts)`

Creates a new scheduler. Options:

- `bpm: number` — starting tempo
- `audioContext?: AudioContext` — context for scheduling
- `lookaheadMs?: number` — internal buffer in ms (default 10)
- `ppqn?: number` — pulses‑per‑quarter‑note (default 24)

```ts
const clock = new DeadOnClock({ bpm: 128, ppqn: 96 });
```

---

### `clock.start() → Promise<void>`

Begins ticking. Returns once the worklet and initial scheduling are set up. Safe to call multiple times (no-ops if already started).

```ts
await clock.start();
```

---

### `clock.stop() → void`

Stops ticking and disconnects the worklet. You can restart with `clock.start()`.

```ts
clock.stop();
```

---

### `clock.setBpm(bpm) → void`

Change tempo on the fly. Re-bases timing origin to avoid dropped ticks.

```ts
clock.setBpm(140);
```

---

### `clock.setPpqn(ppqn) → void`

Change PPQN resolution in real time. Re-bases timing origin to avoid missed ticks.

```ts
clock.setPpqn(96);
```

---

### `clock.on('tick', callback) → void`

Subscribe to tick events. Callback signature:

```ts
callback(e: ClockTickEvent): void;
```

---

### `clock.off('tick', callback) → void`

Unsubscribe from tick events.

```ts
clock.off("tick", handler);
```

---

## ClockTickEvent

```ts
interface ClockTickEvent {
  scheduledTimeMs: number; // wall-clock time (ms) when the tick was scheduled
  audioTime: number; // AudioContext.currentTime for the tick
  tick: number; // integer tick count (0, 1, 2, ...)
  bpm: number; // current BPM
}
```

---

## Browser Support

- Chrome, Edge, Safari, Firefox (latest)
- Requires Web Audio `AudioWorkletProcessor`

---

## License

Apache 2.0 © 2xAA

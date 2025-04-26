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
- [Scheduling Events](#scheduling-events)
  - [Example: Scheduling Web Audio](#example-scheduling-web-audio)
  - [Example: Scheduling Web MIDI](#example-scheduling-web-midi)
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
- **Unified scheduling base:** One clock for both Web Audio and Web MIDI, simplifying synchronisation.
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
- **wall-clock (scheduledTimeMs)**  
  The `scheduledTimeMs` property is a `performance.now()` timestamp (in ms) when the tick was scheduled. Use it with `DeadOnClock.scheduleAt()` to align UI updates, animations, or Web MIDI events exactly to the tick.
- **Events**  
  DeadOn only emits `"tick"` events. Derive higher‑level musical timing (quarters, bars, steps) from the tick count in your application code.

---

## Scheduling Events

DeadOn provides two timing references on each tick:

- **`audioTime`** (seconds): the `AudioContext.currentTime` for sample-accurate scheduling of Web Audio nodes.
- **`scheduledTimeMs`** (ms): a high-resolution wall-clock timestamp (`performance.now()`) for scheduling UI, animations, or Web MIDI via `DeadOnClock.scheduleAt()`.

### Example: Scheduling Web Audio

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

### Example: Scheduling Web MIDI

The Web MIDI API's `MIDIOutput.send()` accepts an optional timestamp in milliseconds (DOMHighResTimeStamp). To align MIDI messages to the same tick, use `e.scheduledTimeMs`:

```ts
clock.on("tick", (e) => {
  if (e.tick % quarterTicks === 0) {
    // Send a middle C note-on (0x90, note, velocity)
    midiOutput.send([0x90, 60, 0x7f], e.scheduledTimeMs);
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

## API Reference

### `new DeadOnClock(opts)`

Creates a new scheduler. Options:

- `bpm: number` — starting tempo
- `audioContext?: AudioContext` — context for scheduling
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

### Helper: `scheduleAt`

DeadOnClock includes a built-in static helper to schedule callbacks precisely at wall-clock times:

```ts
import { DeadOnClock } from "dead-on";

const highlight = (beatIndex) => {
  indicators.forEach((el) => (el.style.opacity = "0.3"));
  indicators[beatIndex].style.opacity = "1";
};

clock.on("tick", (e) => {
  const beatIndex = (e.tick / quarterTicks) % indicators.length;
  DeadOnClock.scheduleAt(e.scheduledTimeMs, () => highlight(beatIndex));
});
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

### Understanding `scheduledTimeMs` (wall time)

Wall-clock time refers to the browser’s high-resolution system clock, accessible via `performance.now()`, representing the real-world elapsed time since page load on the main JavaScript thread. The `scheduledTimeMs` property is such a high-resolution timestamp (in milliseconds) indicating **when** the tick was scheduled by the AudioWorklet. Because it runs on the main thread’s timing system (not the audio context’s), `scheduledTimeMs` lets you coordinate non-audio events or UI updates precisely at the tick moment. Use `scheduledTimeMs` to:

- Synchronise UI updates or animations to the exact tick moment
- Measure and log scheduling latency by comparing `scheduledTimeMs` against `performance.now()` on the main thread
- Coordinate non-audio events (network calls, other JavaScript timers) with your audio timeline

Example:

```ts
// Measure scheduling latency
clock.on("tick", (e) => {
  const now = performance.now();
  console.log(`Tick latency: ${(now - e.scheduledTimeMs).toFixed(2)} ms`);
});
```

```ts
// Highlight a beat in the UI exactly on the tick
clock.on("tick", (e) => {
  const delay = e.scheduledTimeMs - performance.now();
  const highlight = () =>
    document.getElementById("beat-indicator")?.classList.add("active");
  if (delay > 0) {
    setTimeout(highlight, delay);
  } else {
    highlight();
  }
});
```

---

## Browser Support

- Chrome, Edge, Safari, Firefox (latest)
- Requires Web Audio `AudioWorkletProcessor`

---

## License

Apache 2.0 © 2xAA

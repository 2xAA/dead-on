// Don't worry about the complexity of this file!
// It's mostly just a bunch of code that's used to make the demo work.
// ---
// Focus on playBlip and playChord - they show how to use e.audioTime
// to schedule Web Audio events.

import { ClockTickEvent, DeadOnClock } from "./deadon";

let currentPpqn = 24;
let selectedChord = 0;

// Minor-9th chords
const chordOptions: number[][] = [
  [220.0, 261.63, 329.63, 392.0, 493.88, 587.33], // Am9 (A–C–E–G–B–D)
  [146.83, 174.61, 220.0, 261.63, 329.63, 392.0], // Dm9 (D–F–A–C–E–G)
  [174.61, 207.65, 261.63, 311.13, 392.0, 466.16], // Fm9 (F–A♭–C–E♭–G–B♭)
  [196.0, 233.08, 293.66, 349.23, 440.0, 523.25], // Gm9 (G–B♭–D–F–A–C)
];

// Primary UI colors
const primaryColors: string[] = ["#c24a4a", "#c2864a", "#4ac286", "#4a86c2"];

// Arpeggiator index
let arpIndex = 0;
let playArp: (audioTime: number, freq: number) => void;
let playBlip: (audioTime: number, tick: number) => void;
let playKick: (audioTime: number, tick: number) => void;
let playChord: (audioTime: number) => void;

function setPrimaryColor(color: number) {
  const root = document.documentElement;
  root.style.setProperty("--primary-color", primaryColors[color]);
}

let _clock: DeadOnClock | null = null;

export function setup(clock: DeadOnClock, ctx: AudioContext) {
  _clock = clock;

  // Stats setup
  let lastTickTime: number | null = null;
  let minTick = Infinity;
  let maxTick = -Infinity;
  let tickSum = 0;
  let tickSumSq = 0;
  let tickCount = 0;
  let accurateTicks = 0;
  let bpm = 120;

  function getTargetTick() {
    return (60 / (bpm * currentPpqn)) * 1000;
  }

  function updateStatsDisplay() {
    const avgTick = tickCount ? tickSum / tickCount : 0;
    let variance = tickCount ? tickSumSq / tickCount - avgTick ** 2 : 0;
    if (variance < 0) variance = 0;
    const stdDev = Math.sqrt(variance);
    const accuracy = tickCount ? (accurateTicks / tickCount) * 100 : 0;
    const targetTick = getTargetTick();
    const statsDiv = document.getElementById("stats")!;
    statsDiv.innerHTML = `
    <b>Tick Stats</b><br>
    Target Tick: ${targetTick.toFixed(2)} ms<br>
    Avg Tick: ${avgTick.toFixed(2)} ms<br>
    Std Dev: ${stdDev.toFixed(2)} ms<br>
    Min Tick: ${minTick === Infinity ? "-" : minTick.toFixed(2)} ms<br>
    Max Tick: ${maxTick === -Infinity ? "-" : maxTick.toFixed(2)} ms<br>
    Accurate Ticks (&plusmn;0.1ms): ${accuracy.toFixed(2)}%<br>
    Total Ticks: ${tickCount}
  `;
  }

  const kickGain = ctx.createGain();
  const kickTime = 0.12;
  playKick = (audioTime: number, tick: number) => {
    const kick = ctx.createOscillator();
    kick.frequency.value = 16.35 * 13;
    kick.type = "square";
    kick.frequency.linearRampToValueAtTime(0, audioTime + kickTime);
    kickGain.gain.value = 0.5;
    kickGain.gain.setTargetAtTime(0, audioTime, kickTime);

    // low pass filter with high resonance
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    filter.frequency.value = 500;
    filter.frequency.linearRampToValueAtTime(16, audioTime + kickTime);

    kick.connect(filter).connect(kickGain).connect(ctx.destination);
    kick.start(audioTime);
    kick.stop(audioTime + kickTime);
  };

  const blipGain = ctx.createGain();

  // WebAudio Schedulers
  playBlip = (audioTime: number, tick: number) => {
    const osc = ctx.createOscillator();
    osc.type = "square";

    // Accent only the first blip of each bar
    const barSize = currentPpqn * 4; // ticks per bar (4/4)
    const baseFreq = 980;
    const isFirstOfBar = tick % barSize === 0;
    osc.frequency.value = isFirstOfBar ? baseFreq * 2 : baseFreq;
    osc.connect(blipGain).connect(ctx.destination);

    osc.start(audioTime);
    osc.stop(audioTime + 0.04);
    blipGain.gain.setValueAtTime(0.07, audioTime);
    blipGain.gain.linearRampToValueAtTime(0, audioTime + 0.04);
  };

  const chordGain = ctx.createGain();
  chordGain.gain.value = 0.15;
  const chordLength = 1.5;

  playChord = (audioTime: number) => {
    const freqs = chordOptions[selectedChord];
    chordGain.connect(ctx.destination);

    const playFifth = Math.round(Math.random()) ? 1 : 0;
    const playSixth = Math.round(Math.random()) ? 1 : 0;

    freqs.forEach((freq, i) => {
      // Skip the 5th and 6th notes if not selected
      if ((i === 4 && !playFifth) || (i === 5 && !playSixth)) {
        return;
      }

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 3;

      // Slight stereo spread
      const chordPan = ctx.createStereoPanner();
      const panValue = (Math.round(Math.random()) - 0.5) * 0.2;
      chordPan.pan.value = panValue;
      osc.connect(chordPan).connect(chordGain);
      osc.start(audioTime);
      osc.stop(audioTime + chordLength);
    });

    chordGain.gain.setValueAtTime(0.15, audioTime);
    chordGain.gain.linearRampToValueAtTime(0, audioTime + chordLength);
  };

  const arpGain = ctx.createGain();
  const pan = ctx.createStereoPanner();

  // 16th-note arpeggiator helper
  playArp = (audioTime: number, freq: number) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value =
      freq *
      (Math.round(Math.random()) ? 2 : Math.round(Math.random()) ? 1 : 0.5);
    arpGain.gain.setValueAtTime(0, audioTime);
    arpGain.gain.linearRampToValueAtTime(0.2, audioTime + 0.04);
    arpGain.gain.linearRampToValueAtTime(0, audioTime + 0.2);

    // Random stereo panning
    pan.pan.value = Math.round(Math.random()) ? -1 : 1;

    osc.connect(pan).connect(arpGain).connect(ctx.destination);
    osc.start(audioTime);
    osc.stop(audioTime + 0.4);
  };

  // DeadOn clock event handlers
  clock.on("tick", ({ timeMs }) => {
    if (lastTickTime !== null) {
      const tickMs = timeMs - lastTickTime;
      tickSum += tickMs;
      tickSumSq += tickMs * tickMs;
      if (Math.abs(tickMs - getTargetTick()) < 0.1) accurateTicks++;
      if (tickMs < minTick) minTick = tickMs;
      if (tickMs > maxTick) maxTick = tickMs;
      tickCount++;
      updateStatsDisplay();
    }
    lastTickTime = timeMs;
  });

  function resetStats() {
    lastTickTime = null;
    minTick = Infinity;
    maxTick = -Infinity;
    tickSum = 0;
    tickSumSq = 0;
    tickCount = 0;
    accurateTicks = 0;
  }

  const bpmInput = document.getElementById("bpm") as HTMLInputElement;
  bpmInput.onchange = (e) => {
    bpm = +bpmInput.value;
    clock.setBpm(bpm);
    resetStats();
  };

  // Toggle single Start/Stop button
  const startStopBtn = document.getElementById(
    "startStop"
  ) as HTMLButtonElement;
  startStopBtn.onclick = async () => {
    if (!clock.started) {
      selectedChord = 0;
      await ctx.resume();
      await clock.start();
      startStopBtn.textContent = "Stop";
    } else {
      clock.stop();
      resetStats();
      updateStatsDisplay();
      startStopBtn.textContent = "Start";
    }
  };

  const ppqnSelect = document.getElementById("ppqn") as HTMLSelectElement;
  ppqnSelect.onchange = () => {
    currentPpqn = +ppqnSelect.value;
    clock.setPpqn(currentPpqn);
    resetStats();
  };

  updateStatsDisplay();
}

// Exported arpeggiator action
export const sixteenthNoteActions = (e: ClockTickEvent) => {
  // Determine the chord index that was just played at the bar
  const chordIndex =
    (selectedChord + chordOptions.length - 1) % chordOptions.length;
  const freqs = chordOptions[chordIndex];
  // Play notes in sequence through the previous chord
  const freq = freqs[arpIndex % freqs.length];
  playArp(e.audioTime, freq);
  arpIndex = (arpIndex + 1) % freqs.length;
};

export const quarterNoteActions = (e: ClockTickEvent) => {
  console.log(e.audioTime * 1000, e.timeMs, performance.now());
  playBlip(e.audioTime, e.tick);
  playKick(e.audioTime, e.tick);
};

export const barActions = (e: ClockTickEvent) => {
  // Reset arpeggiator at the start of the bar
  arpIndex = 0;
  playChord(e.audioTime);
  // Advance to next chord
  selectedChord = (selectedChord + 1) % chordOptions.length;

  const index =
    (selectedChord + primaryColors.length - 1) % primaryColors.length;

  _clock!.scheduleAt(() => setPrimaryColor(index), e.timeMs);
};

export const getCurrentPpqn = () => currentPpqn;

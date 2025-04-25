// Don't worry about the complexity of this file!
// It's mostly just a bunch of code that's used to make the demo work.
// ---
// Focus on playBlip and playChord - they show how to use e.audioTime
//   to schedule Web Audio events.

let currentPpqn = 24;
import { ClockTickEvent } from "./deadon";
import { clock, ctx, bpmInputInit } from "./index";

// Minor-9th chords
const chordOptions: number[][] = [
  [220.0, 261.63, 329.63, 392.0, 493.88, 587.33], // Am9 (A–C–E–G–B–D)
  [146.83, 174.61, 220.0, 261.63, 329.63, 392.0], // Dm9 (D–F–A–C–E–G)
  [174.61, 207.65, 261.63, 311.13, 392.0, 466.16], // Fm9 (F–A♭–C–E♭–G–B♭)
  [196.0, 233.08, 293.66, 349.23, 440.0, 523.25], // Gm9 (G–B♭–D–F–A–C)
];
let selectedChord = 0;
// Arpeggiator index
let arpIndex = 0;

// Stats setup
let lastTickTime: number | null = null;
let minTick = Infinity;
let maxTick = -Infinity;
let tickSum = 0;
let tickSumSq = 0;
let tickCount = 0;
let accurateTicks = 0;
let bpm = bpmInputInit;

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

const blipGain = ctx.createGain();

// WebAudio Schedulers
function playBlip(audioTime: number, tick: number) {
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
}

const chordGain = ctx.createGain();
chordGain.gain.value = 0.15;
const chordLength = 1.5;

function playChord(audioTime: number) {
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
}

const arpGain = ctx.createGain();
const pan = ctx.createStereoPanner();

// 16th-note arpeggiator helper
function playArp(audioTime: number, freq: number) {
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

// DeadOn clock event handlers
clock.on("tick", (e) => {
  if (lastTickTime !== null) {
    const tickMs = e.scheduledTimeMs - lastTickTime;
    tickSum += tickMs;
    tickSumSq += tickMs * tickMs;
    if (Math.abs(tickMs - getTargetTick()) < 0.1) accurateTicks++;
    if (tickMs < minTick) minTick = tickMs;
    if (tickMs > maxTick) maxTick = tickMs;
    tickCount++;
    updateStatsDisplay();
  }
  lastTickTime = e.scheduledTimeMs;
});

export const quarterNoteActions = (e: ClockTickEvent) => {
  playBlip(e.audioTime, e.tick);
};

export const barActions = (e: ClockTickEvent) => {
  // Reset arpeggiator at the start of the bar
  arpIndex = 0;
  playChord(e.audioTime);
  // Advance to next chord
  selectedChord = (selectedChord + 1) % chordOptions.length;
};

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
const startStopBtn = document.getElementById("startStop") as HTMLButtonElement;
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

export const getCurrentPpqn = () => currentPpqn;

updateStatsDisplay();

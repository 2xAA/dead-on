// Don't worry about the complexity of this file!
// It's mostly just a bunch of code that's used to make the demo work.
// ---
// Focus on playBlip and playChord - they show how to use e.audioTime
//   to schedule Web Audio events.

let currentPpqn = 24;
import { ClockTickEvent } from "./deadon";
import { clock, ctx, bpmInputInit } from "./index";

// Chord selection slider
const chordOptions: number[][] = [
  [174.61, 207.65, 261.63], // F minor
  [220.0, 261.63, 329.63], // A minor
  [196.0, 233.08, 293.66], // G minor
  [146.83, 220.0, 261.63], // D minor
];
const chordLabels: string[] = ["Fm", "Am", "Gm", "Dm"];
let selectedChord = 0;

// Stats setup
let lastTickTime: number | null = null;
let minTick = Infinity;
let maxTick = -Infinity;
let tickSum = 0;
let tickSumSq = 0;
let tickCount = 0;
let accurateTicks = 0;
let bpm = bpmInputInit;

// Quarter-note static visualiser
const quarterCount = 4;
let currentQuarter = 0;
function updateQuarterViz() {
  let viz = "[";
  for (let i = 0; i < quarterCount; i++) {
    viz += i === currentQuarter ? "*" : "-";
  }
  viz += "]";
  (document.getElementById("viz") as HTMLElement).textContent = viz;
}

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

const gain = ctx.createGain();
gain.gain.value = 0.1;

// WebAudio Schedulers
function playBlip(audioTime: number, tick: number) {
  const osc = ctx.createOscillator();
  osc.type = "square";

  // Accent only the first blip of each bar
  const barSize = currentPpqn * 4; // ticks per bar (4/4)
  const baseFreq = 980;
  const isFirstOfBar = tick % barSize === 0;
  osc.frequency.value = isFirstOfBar ? baseFreq * 2 : baseFreq;
  osc.connect(gain).connect(ctx.destination);

  osc.start(audioTime);
  osc.stop(audioTime + 0.04);
  gain.gain.setValueAtTime(0.1, audioTime);
  gain.gain.linearRampToValueAtTime(0, audioTime + 0.04);
}

const chordGain = ctx.createGain();
chordGain.gain.value = 0.15;

function playChord(audioTime: number) {
  const freqs = chordOptions[selectedChord];
  chordGain.connect(ctx.destination);

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = (i - 1) * 5;
    osc.connect(chordGain);
    osc.start(audioTime);
    osc.stop(audioTime + 0.18);
  });

  chordGain.gain.setValueAtTime(0.15, audioTime);
  chordGain.gain.linearRampToValueAtTime(0, audioTime + 0.18);
}

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
  updateQuarterViz();
  currentQuarter = (currentQuarter + 1) % quarterCount;
};

export const barActions = (e: ClockTickEvent) => {
  playChord(e.audioTime);
};

document.body.innerHTML = `
  <div class="container">
    <h1>DeadOn Demo</h1>
    <div class="controls">
      <button id="startStop">Start</button>
    </div>
    <div class="settings">
      <label>BPM: <input id="bpm" type="number" value="${bpm}" min="20" max="300" step="1"></label>
      <label>PPQN:
        <select id="ppqn">
          <option value="24" selected>24 (MIDI Clock)</option>
          <option value="48">48 (Volca Sync)</option>
          <option value="96">96 (Hardware Sequencer)</option>
          <option value="960">960 (DAW)</option>
        </select>
      </label>
      <label>Chord:
        <input id="chord" type="range" min="0" max="3" step="1" value="${selectedChord}" style="margin:0 0.5rem;padding:0;vertical-align:middle;">
        <span id="chordLabel">${chordLabels[selectedChord]}</span>
      </label>
    </div>
    <div id="stats"></div>
    <pre id="viz"></pre>
  </div>
`;

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

const chordSlider = document.getElementById("chord") as HTMLInputElement;
const chordLabel = document.getElementById("chordLabel")!;
chordSlider.oninput = () => {
  selectedChord = +chordSlider.value;
  chordLabel.textContent = chordLabels[selectedChord];
};

// Toggle single Start/Stop button
const startStopBtn = document.getElementById("startStop") as HTMLButtonElement;
startStopBtn.onclick = async () => {
  if (!clock.started) {
    await ctx.resume();
    await clock.start();
    currentQuarter = 0;
    updateQuarterViz();
    startStopBtn.textContent = "Stop";
  } else {
    clock.stop();
    await ctx.suspend();
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
updateQuarterViz();

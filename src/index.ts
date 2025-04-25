import { DeadOnClock } from "./deadon";

const bpmInputInit = 120;
const ctx = new AudioContext();
const clock = new DeadOnClock({ bpm: bpmInputInit, audioContext: ctx });

// --- Stats setup ---
let lastTickTime: number | null = null;
let minTick = Infinity;
let maxTick = -Infinity;
let tickSum = 0;
let tickSumSq = 0;
let tickCount = 0;
let accurateTicks = 0;
let bpm = bpmInputInit;
function getTargetTick() {
  return (60 / (bpm * 24)) * 1000;
}

// --- Analyser setup for ASCII visualiser ---
const analyser = ctx.createAnalyser();
analyser.fftSize = 128;
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

let rafId: number | null = null;

function updateStatsDisplay() {
  const avgTick = tickCount ? tickSum / tickCount : 0;
  const stdDev = tickCount ? Math.sqrt((tickSumSq / tickCount) - (avgTick ** 2)) : 0;
  const accuracy = tickCount ? (accurateTicks / tickCount) * 100 : 0;
  const targetTick = getTargetTick();
  const statsDiv = document.getElementById("stats")!;
  statsDiv.innerHTML = `
    <b>Tick Stats</b><br>
    Target Tick: ${targetTick.toFixed(2)} ms<br>
    Avg Tick: ${avgTick.toFixed(2)} ms<br>
    Std Dev: ${stdDev.toFixed(2)} ms<br>
    Min Tick: ${minTick === Infinity ? '-' : minTick.toFixed(2)} ms<br>
    Max Tick: ${maxTick === -Infinity ? '-' : maxTick.toFixed(2)} ms<br>
    Accurate Ticks (&plusmn;0.1ms): ${accuracy.toFixed(2)}%<br>
    Total Ticks: ${tickCount}
  `;
}

// --- WebAudio Schedulers ---
function playBlip(audioTime: number) {
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 880;
  const gain = ctx.createGain();
  gain.gain.value = 0.12;
  osc.connect(gain).connect(analyser).connect(ctx.destination);

  osc.start(audioTime);
  osc.stop(audioTime + 0.03);
  gain.gain.setValueAtTime(0.12, audioTime);
  gain.gain.linearRampToValueAtTime(0, audioTime + 0.03);
}

function playChord(audioTime: number) {
  // C major triad: C4, E4, G4
  const freqs = [261.63, 329.63, 392.00];
  const chordGain = ctx.createGain();
  chordGain.gain.value = 0.15;
  chordGain.connect(analyser).connect(ctx.destination);

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

// --- ASCII visualiser ---
function drawAscii() {
  analyser.getByteTimeDomainData(dataArray);
  let ascii = '';
  const width = 60;
  for (let x = 0; x < width; x++) {
    const dataIdx = Math.floor((x / width) * bufferLength);
    const v = dataArray[dataIdx] / 255;
    const row = Math.round(v * 15);
    ascii += '....................::::::::;;;;####@@@@'[row] || '.';
  }
  document.getElementById("viz")!.textContent = ascii;
  rafId = requestAnimationFrame(drawAscii);
}

function stopAscii() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  document.getElementById("viz")!.textContent = '';
}

// --- DeadOn clock event handlers ---
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

clock.on("quarter", (e) => {
  playBlip(e.audioTime);
});

clock.on("bar", (e) => {
  playChord(e.audioTime);
});

document.body.innerHTML = `
<button id="start">Start Clock</button>
<button id="stop">Stop</button>
<label>BPM: <input id="bpm" type="number" value="${bpm}" min="20" max="300" step="1"></label>
<div id="stats" style="font-family:monospace;margin-top:1em"></div>
<pre id="viz" style="font-size:16px;line-height:1.2em;margin-top:1em;color:#00ff5f;background:#202020;border-radius:6px;padding:8px;"></pre>
`;

document.getElementById("start")!.onclick = async () => {
  if (clock.started) return;
  await ctx.resume();
  await clock.start();
  if (!rafId) drawAscii();
};

document.getElementById("stop")!.onclick = async () => {
  clock.stop();
  await ctx.suspend();
  stopAscii();
  // Reset stats
  lastTickTime = null; minTick = Infinity; maxTick = -Infinity;
  tickSum = 0; tickSumSq = 0; tickCount = 0; accurateTicks = 0;
  updateStatsDisplay();
};

document.getElementById("bpm")!.onchange = (e) => {
  bpm = +(e.target as HTMLInputElement).value;
  clock.setBpm(bpm);
  updateStatsDisplay();
};

updateStatsDisplay();
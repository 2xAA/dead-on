import { DeadOnClock } from "./deadon";
import { DeadOnSequencer } from "./sequencer";

// Set up AudioContext, worklet, clock, MIDI, and UI helpers.
export async function initDemoEnv() {
  let midiAccess: MIDIAccess | null = null;
  // 1) AudioContext + worklet + clock
  const audioCtx = new AudioContext();
  const clock = new DeadOnClock({ bpm: 120, audioContext: audioCtx, ppqn: 24 });

  // 2) MIDI output devices
  const midiOutputs: MIDIOutput[] = [];
  if ("requestMIDIAccess" in navigator) {
    midiAccess = await navigator.requestMIDIAccess();
    for (const output of midiAccess.outputs.values()) {
      midiOutputs.push(output);
    }
  }
  const midiInterval = clock.ppqn / 24;

  // 3) UI beat indicators
  const indicators = Array.from(
    document.querySelectorAll(".beat-indicator")
  ) as HTMLElement[];

  // 4) Swing offset for hi-hats
  const swingMs = 30;

  // 5) Helper to play a kick
  function playKick(at: number) {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(0.001, at + 0.2);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(1, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
    osc.connect(g).connect(audioCtx.destination);
    DeadOnSequencer.triggerAudio(osc, at, 200);
  }

  // 6) Helper to play a hi-hat (noise)
  const noiseBuf = (() => {
    const buf = audioCtx.createBuffer(
      1,
      audioCtx.sampleRate * 0.1,
      audioCtx.sampleRate
    );
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  })();
  function playHat(at: number) {
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = audioCtx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 8000;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.3, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    src.connect(filt).connect(g).connect(audioCtx.destination);
    DeadOnSequencer.triggerAudio(src, at, 50);
  }

  // 7) Start/stop button and tempo controls
  const startStopBtn = document.getElementById(
    "startStop"
  ) as HTMLButtonElement;
  startStopBtn.onclick = async () => {
    if (!clock.started) {
      await audioCtx.resume();
      await clock.start();
      startStopBtn.textContent = "Stop";
    } else {
      clock.stop();
      startStopBtn.textContent = "Start";
    }
  };

  return {
    audioCtx,
    clock,
    midiOutputs,
    midiAccess,
    midiInterval,
    indicators,
    swingMs,
    playKick,
    playHat,
  };
}

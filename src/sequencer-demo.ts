import { DeadOnClock } from "./deadon";
import { DeadOnSequencer } from "./sequencer";
import type { StepAction } from "./sequencer";
import { initDemoEnv } from "./sequencer-demo-other";

(async () => {
  let {
    audioCtx,
    clock,
    midiOutputs,
    midiAccess,
    midiInterval: initialMidiInterval,
    indicators,
    swingMs,
    playKick,
    playHat,
  } = await initDemoEnv();
  let midiInterval = initialMidiInterval;
  let midiOutput = midiOutputs[0] ?? null;

  // Populate MIDI Out dropdown
  const midiSelect = document.getElementById("midiOut") as HTMLSelectElement;
  midiOutputs.forEach((out, idx) => {
    const opt = document.createElement("option");
    opt.value = idx.toString();
    opt.text = out.name!;
    midiSelect.appendChild(opt);
  });
  // Switch MIDI output on user selection
  midiSelect.onchange = () => {
    midiOutput = midiOutputs[+midiSelect.value];
  };
  // Update dropdown when MIDI devices change
  if (midiAccess) {
    midiAccess.onstatechange = () => {
      midiOutputs = Array.from(midiAccess.outputs.values());
      const midiSelect = document.getElementById(
        "midiOut"
      ) as HTMLSelectElement;
      midiSelect.innerHTML = "";
      midiOutputs.forEach((out, idx) => {
        const opt = document.createElement("option");
        opt.value = idx.toString();
        opt.text = out.name!;
        midiSelect.appendChild(opt);
      });
      // reset selected output
      midiOutput = midiOutputs[+midiSelect.value] ?? null;
    };
  }

  // 2) Create one sequencer per channel (0 = drums, 1–15 = melodic)
  const channels = Array.from(
    { length: 16 },
    () => new DeadOnSequencer(clock, 16)
  );

  // Update sequencers and MIDI interval when BPM or PPQN change
  const bpmInput = document.getElementById("bpm") as HTMLInputElement;
  bpmInput.onchange = () => {
    const newBpm = +bpmInput.value;
    clock.setBpm(newBpm);
    channels.forEach((seq) => seq.setBpm(newBpm));
  };

  const ppqnSelect = document.getElementById("ppqn") as HTMLSelectElement;
  ppqnSelect.onchange = () => {
    const newPpqn = +ppqnSelect.value;
    clock.setPpqn(newPpqn);
    channels.forEach((seq) => seq.setPpqn(newPpqn));
    midiInterval = newPpqn / 24;
  };

  // 3) Populate the drum channel (channel 0)
  const drumSeq = channels[0];
  const drumSeq2 = channels[4];

  // Example StepAction-based drum sequence
  type DrumPayload = { kind: string };
  const drumPattern: Array<StepAction<DrumPayload> | null> =
    Array(16).fill(null);
  const drumPattern2: Array<StepAction<DrumPayload> | null> =
    Array(16).fill(null);
  // Kick on step 0
  drumPattern[0] = { payload: [{ kind: "kick" }] };

  for (let i = 0; i < 15; i += 4) {
    drumPattern2[i] = { payload: [{ kind: "kick" }] };
  }

  // Swinging hi-hats on every 8th note
  const hatSteps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  hatSteps.forEach((step, idx) => {
    drumPattern[step - 1] = {
      payload: [{ kind: "hat" }],
      offsetMs: idx % 2 ? swingMs : 0,
    };
  });

  drumSeq.setSequence(drumPattern);
  drumSeq2.setSequence(drumPattern2);

  // Example melodic sequence on channel 1
  type MelPayload = { freq: number };
  const melSeq = channels[1];
  const melPattern: Array<StepAction<MelPayload> | null> = Array(16).fill(null);
  melPattern[2] = { payload: [{ freq: 523.25 }], offsetMs: 10 };
  melPattern[6] = { payload: [{ freq: 1046.5 }], offsetMs: -420 };

  melSeq.setSequence(melPattern);

  // Example arpeggio sequence on channel 2
  type ArpPayload = { freq: number };
  const arpSeq = channels[2];
  const arpPattern: Array<StepAction<ArpPayload> | null> = Array(16).fill(null);
  // A 4-note arpeggio on step 0, with 4 subdivisions (ratchet)
  arpPattern[0] = {
    payload: [
      { freq: 130.81 * 2 },
      { freq: 164.81 * 2 },
      { freq: 196 * 2 },
      { freq: 261.63 * 2 },
    ],
    subdivs: 1,
  };

  arpPattern[8] = {
    payload: [
      { freq: 130.81 * 2 },
      { freq: 164.81 * 2 },
      { freq: 196 * 2 },
      { freq: 261.63 * 2 },
    ],
    subdivs: 2,
  };

  arpPattern[12] = {
    payload: [
      { freq: 130.81 * 2 },
      { freq: 164.81 * 2 },
      { freq: 196 * 2 },
      { freq: 261.63 * 2 },
    ],
    subdivs: 3,
  };
  arpSeq.setSequence(arpPattern);

  // Example MIDI sequence on channel 3 (sends to selected MIDI device)
  type MidiPayload = {
    midiNote: number;
    velocity?: number;
    durationMs?: number;
  };
  const midiSeq = channels[3];
  const midiPattern: Array<StepAction<MidiPayload> | null> =
    Array(16).fill(null);

  midiPattern[0] = {
    payload: [{ midiNote: 60, velocity: 0x7f, durationMs: 200 }],
    subdivs: 0,
  };

  midiPattern[4] = {
    payload: [{ midiNote: 60, velocity: 0x7f, durationMs: 200 }],
    subdivs: 0,
  };

  midiPattern[8] = {
    payload: [{ midiNote: 60, velocity: 0x7f, durationMs: 200 }],
    subdivs: 0,
  };

  midiPattern[12] = {
    payload: [{ midiNote: 60, velocity: 0x7f, durationMs: 200 }],
    subdivs: 0,
  };

  midiSeq.setSequence(midiPattern);

  // 5) Single clock tick handler for all channels
  clock.on("tick", (e) => {
    // Send MIDI Clock messages at MIDI ppqn (24 pulses per quarter)
    if (midiOutput && e.tick % midiInterval === 0) {
      midiOutput.send([0xf8], e.timeMs);
    }

    // UI quarter-beat indicator sync
    if (e.tick % (clock.ppqn / 4) === 0) {
      const beatIndex = (e.tick / (clock.ppqn / 4)) % indicators.length;
      clock.scheduleAt(() => {
        indicators.forEach((el, i) => {
          el.style.opacity = i === beatIndex ? "1" : "0.2";
        });
      }, e.timeMs);
    }

    for (let ch = 0; ch < 16; ch++) {
      const seq = channels[ch];
      const payloads = seq.getPayloadsForTick(e.tick);

      if (payloads.length === 0) continue;

      for (const payload of payloads) {
        const playTimeSec = e.audioTime;

        if (ch === 0 || ch === 4) {
          // drum channel
          if ((payload as DrumPayload).kind === "kick") {
            playKick(playTimeSec);
          } else if ((payload as DrumPayload).kind === "hat") {
            playHat(playTimeSec);
          }
        } else if (ch === 1 || ch === 2) {
          // melodic/or arpeggio channels with duration support
          const { freq, durationMs = 200 } = payload as {
            freq: number;
            durationMs?: number;
          };

          // create oscillator and envelope
          const osc = audioCtx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, playTimeSec);
          const g = audioCtx.createGain();
          g.gain.setValueAtTime(0.2, playTimeSec);
          g.gain.exponentialRampToValueAtTime(
            0.001,
            playTimeSec + durationMs / 1000
          );
          osc.connect(g).connect(audioCtx.destination);

          // schedule start and stop via helper
          DeadOnSequencer.triggerAudio(osc, playTimeSec, durationMs);
        }

        // MIDI channel handling
        if (ch === 3 && midiOutput) {
          const {
            midiNote,
            velocity = 0x7f,
            durationMs = 200,
          } = payload as MidiPayload;

          DeadOnSequencer.triggerMidi(
            midiOutput,
            midiNote,
            velocity,
            e.timeMs,
            e.timeMs + durationMs
          );
        }
      }
    }
  });
})();

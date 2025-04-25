import { DeadOnClock } from "./deadon";

export const bpmInputInit = 120;
export const ctx = new AudioContext();
export const clock = new DeadOnClock({ bpm: bpmInputInit, audioContext: ctx });

import "./other";
import { quarterNoteActions, barActions, getCurrentPpqn } from "./other";

clock.on("tick", (e) => {
  const currentPpqn = getCurrentPpqn();
  if (e.tick % (currentPpqn / 4) === 0) quarterNoteActions(e);
  if (e.tick % currentPpqn === 0) barActions(e);
});

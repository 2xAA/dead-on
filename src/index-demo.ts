import { DeadOnClock } from "./deadon";
import {
  quarterNoteActions,
  barActions,
  sixteenthNoteActions,
  getCurrentPpqn,
  setup,
} from "./index-demo-other";

export const bpmInputInit = 120;
const ctx = new AudioContext();
const clock = new DeadOnClock({
  bpm: bpmInputInit,
  audioContext: ctx,
});

// Grab the four indicators after the DOM is created
const indicators = Array.from(
  document.querySelectorAll(".beat-indicator")
) as HTMLElement[];
let beatIndex = 0;

const highlight = (beatIndex: number) => {
  indicators.forEach((el) => (el.style.opacity = "0.3"));
  const el = indicators[beatIndex];
  if (el) {
    el.style.opacity = "1";
    setTimeout(() => (el.style.opacity = "0.3"), 100);
  }
};

clock.on("tick", (e) => {
  const ppqn = getCurrentPpqn();

  // 16th-note arpeggiator
  if (e.tick % (ppqn / 4) === 0) {
    sixteenthNoteActions(e);
  }

  // Every quarter note (ppqn ticks)
  if (e.tick % ppqn === 0) {
    quarterNoteActions(e);

    // Schedule indicator highlight at the precise tick time
    const beatIndex = (e.tick / ppqn) % indicators.length;

    clock.scheduleAt(() => highlight(beatIndex), e.timeMs);
  }

  // Every bar (4 quarters)
  if (e.tick % (ppqn * 4) === 0) {
    barActions(e);
  }
});

setup(clock, ctx);

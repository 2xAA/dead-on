/**
 * Protocol (main -> worker):
 *   { type: 'start', bpm, ppqn, lookahead, interval }
 *   { type: 'stop' }
 *   { type: 'setBpm', bpm }
 *   { type: 'setPpqn', ppqn }
 *   { type: 'setLookahead', lookahead }
 *
 * Protocol (worker -> main):
 *   { type: 'started', startPerf }
 *   { type: 'tick', tick, timeMs }
 */

let bpm = 120;
let ppqn = 24;
let lookahead = 50;
let interval = 20;
let running = false;

let tickCount = 0;
let nextTickPerf = 0;
let lastEmittedTick = -1;

function tickIntervalMs(): number {
  return 60_000 / bpm / ppqn;
}

function schedule(): void {
  if (!running) return;

  const now = performance.now();
  const horizon = now + lookahead;
  const step = tickIntervalMs();

  while (nextTickPerf <= horizon) {
    const timeMs = nextTickPerf;
    const tick = tickCount++;
    if (tick !== lastEmittedTick) {
      const tickDelay = Math.max(0, timeMs - now);
      setTimeout(() => {
        self.postMessage({ type: "tick", tick, timeMs });
      }, tickDelay);
      lastEmittedTick = tick;
    }
    nextTickPerf += step;
  }

  const drift = performance.now() - now;
  const delay = Math.max(0, interval - drift);
  setTimeout(schedule, delay);
}

self.onmessage = (e: MessageEvent) => {
  const { data } = e;
  switch (data.type) {
    case "start":
      bpm = data.bpm;
      ppqn = data.ppqn;
      lookahead = data.lookahead;
      interval = data.interval;
      running = true;
      tickCount = 0;
      lastEmittedTick = -1;
      nextTickPerf = performance.now();
      self.postMessage({ type: "started", startPerf: nextTickPerf });
      schedule();
      break;

    case "stop":
      running = false;
      break;

    case "setBpm":
      bpm = data.bpm;
      break;

    case "setPpqn":
      ppqn = data.ppqn;
      break;

    case "setLookahead":
      lookahead = data.lookahead;
      break;
  }
};

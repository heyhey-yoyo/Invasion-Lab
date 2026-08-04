import { SimulationEngine } from './engine.js';

export const SIMULATION_STEP_SECONDS = 1 / 30;
const MAX_ELAPSED_SECONDS = 0.25;
const MAX_STEPS_PER_TICK = 16;

export function normalizePlaybackSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.25, Math.min(4, numeric));
}

export class SimulationWorkerRuntime {
  constructor(send) {
    this.send = send;
    this.engine = null;
    this.running = false;
    this.speed = 1;
    this.lastEventCount = 0;
    this.lastTickMs = null;
    this.accumulator = 0;
    this.resultSent = false;
  }

  handle(message = {}, nowMs = 0) {
    switch (message.type) {
      case 'init':
        this.engine = new SimulationEngine(message.config);
        this.running = false;
        this.lastEventCount = 0;
        this.lastTickMs = null;
        this.accumulator = 0;
        this.resultSent = false;
        this.#sendFrame();
        break;
      case 'start':
        if (!this.engine || this.engine.finished) break;
        this.running = true;
        this.speed = normalizePlaybackSpeed(message.speed ?? this.speed);
        this.lastTickMs = nowMs;
        this.accumulator = 0;
        break;
      case 'pause':
        this.running = false;
        this.lastTickMs = null;
        this.accumulator = 0;
        break;
      case 'speed':
        this.speed = normalizePlaybackSpeed(message.speed);
        break;
      case 'step':
        if (this.engine && !this.running && !this.engine.finished) {
          this.engine.step(SIMULATION_STEP_SECONDS);
          this.#sendFrame();
        }
        break;
      case 'perturb':
        if (this.engine?.applyPerturbation(message.perturbation)) this.#sendFrame();
        break;
      case 'result':
        if (this.engine) this.send({ type: 'result', result: this.engine.getResult() });
        break;
    }
  }

  tick(nowMs) {
    if (!this.running || !this.engine) return;
    if (this.lastTickMs === null) {
      this.lastTickMs = nowMs;
      return;
    }

    const elapsed = Math.max(0, Math.min(MAX_ELAPSED_SECONDS, (nowMs - this.lastTickMs) / 1000));
    this.lastTickMs = nowMs;
    this.accumulator += elapsed * this.speed;
    const availableSteps = Math.floor((this.accumulator + 1e-12) / SIMULATION_STEP_SECONDS);
    const steps = Math.min(MAX_STEPS_PER_TICK, availableSteps);
    if (steps < 1) return;

    let completedSteps = 0;
    while (completedSteps < steps && !this.engine.finished) {
      this.engine.step(SIMULATION_STEP_SECONDS);
      completedSteps += 1;
    }
    this.accumulator = Math.max(0, this.accumulator - completedSteps * SIMULATION_STEP_SECONDS);
    this.#sendFrame();
  }

  #sendFrame() {
    if (!this.engine) return;
    const frame = this.engine.getFrame();
    const newEvents = this.engine.events.slice(this.lastEventCount);
    this.lastEventCount = this.engine.events.length;
    this.send({ type: 'frame', data: frame.data, meta: frame.meta, events: newEvents }, [frame.data.buffer]);

    if (this.engine.finished && !this.resultSent) {
      this.resultSent = true;
      this.running = false;
      this.lastTickMs = null;
      this.accumulator = 0;
      this.send({ type: 'result', result: this.engine.getResult() });
    }
  }

}

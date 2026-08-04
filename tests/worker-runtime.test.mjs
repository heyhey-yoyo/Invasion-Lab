import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationWorkerRuntime, normalizePlaybackSpeed } from '../simulation/worker-runtime.js';

function createRuntime(config) {
  const messages = [];
  const runtime = new SimulationWorkerRuntime(message => messages.push(message));
  runtime.handle({ type: 'init', config }, 0);
  return { runtime, messages };
}

function advance(runtime, durationMs, intervalMs = 16) {
  for (let now = intervalMs; now <= durationMs; now += intervalMs) runtime.tick(now);
}

test('playback speed is finite and bounded', () => {
  assert.equal(normalizePlaybackSpeed('bad'), 1);
  assert.equal(normalizePlaybackSpeed(0), 0.25);
  assert.equal(normalizePlaybackSpeed(10), 4);
});

test('0.5x, 1x, and 2x advance approximately their labelled simulation time', () => {
  for (const speed of [0.5, 1, 2]) {
    const { runtime } = createRuntime({ scenarioId: 'narrow-gap', presetId: 'jam', maxTime: 20 });
    runtime.handle({ type: 'start', speed }, 0);
    advance(runtime, 1008);
    assert.ok(Math.abs(runtime.engine.time - speed) < 0.08, `${speed}x advanced ${runtime.engine.time}`);
  }
});

test('worker emits a final frame and exactly one result for every scenario', () => {
  for (const scenarioId of ['narrow-gap', 'budding', 'leader-follower', 'unjamming']) {
    const { runtime, messages } = createRuntime({ scenarioId, maxTime: 12.05, seed: 20260803 });
    runtime.handle({ type: 'start', speed: 4 }, 0);
    for (let now = 16; now <= 30000 && !runtime.engine.finished; now += 16) runtime.tick(now);
    const results = messages.filter(message => message.type === 'result');
    assert.equal(runtime.engine.finished, true);
    assert.equal(results.length, 1, `${scenarioId} should emit exactly one final result`);
    assert.equal(messages.at(-1).type, 'result');
    assert.equal(messages.at(-2).type, 'frame');
  }
});

test('single-step mode emits completion result when the step finishes the run', () => {
  const { runtime, messages } = createRuntime({ scenarioId: 'narrow-gap', maxTime: 12 });
  while (!runtime.engine.finished) runtime.handle({ type: 'step' }, 0);
  assert.equal(messages.filter(message => message.type === 'result').length, 1);
});


test('worker messages are correlated to the active run and stale commands are ignored', () => {
  const messages = [];
  const runtime = new SimulationWorkerRuntime(message => messages.push(message));
  runtime.handle({ type: 'init', runId: 7, config: { scenarioId: 'narrow-gap', maxTime: 12 } }, 0);
  const initialTime = runtime.engine.time;
  runtime.handle({ type: 'step', runId: 6 }, 0);
  assert.equal(runtime.engine.time, initialTime);
  runtime.handle({ type: 'step', runId: 7 }, 0);
  assert.ok(runtime.engine.time > initialTime);
  assert.ok(messages.every(message => message.runId === 7));
});

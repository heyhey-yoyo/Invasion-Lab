import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, SCENARIOS } from '../simulation/model.js';
import { SimulationEngine } from '../simulation/engine.js';

function run(config, perturbation = null, perturbAt = 8) {
  const engine = new SimulationEngine({ maxTime: 42, seed: 20260803, ...config });
  while (!engine.finished) {
    engine.step();
    if (perturbation && !engine.perturbation && engine.time >= perturbAt) engine.applyPerturbation(perturbation);
  }
  return { engine, result: engine.getResult() };
}

test('the four behavior personalities preserve four distinct narrow-gap outcomes', () => {
  const expected = {
    jam: 'jammed',
    collective: 'collective-advance',
    budding: 'tumor-budding',
    escape: 'single-cell-escape'
  };
  for (const [id, preset] of Object.entries(PRESETS)) {
    const { result } = run({ ...preset, scenarioId: 'narrow-gap', presetId: id });
    assert.equal(result.mode.id, expected[id], `${id} should produce ${expected[id]}`);
  }
});

test('all four v4 scenarios complete with finite common and scenario metrics', () => {
  for (const scenario of Object.values(SCENARIOS)) {
    const { result } = run({ scenarioId: scenario.id, presetId: scenario.defaultPresetId });
    for (const key of ['passRate', 'integrity', 'meanPressure', 'meanSpeed', 'mobilityIndex', 'frontPosition']) {
      assert.ok(Number.isFinite(result.metrics[key]), `${scenario.id}.${key} should be finite`);
    }
    assert.ok(result.mode.id);
    assert.equal(result.scenario.id, scenario.id);
    assert.equal(result.reproducibility.scenarioHash, result.config.scenarioHash);
  }
});

test('default scenarios produce their intended teaching baselines', () => {
  const expected = {
    'narrow-gap': 'collective-advance',
    budding: 'tumor-budding',
    'leader-follower': 'leader-guided',
    unjamming: 'jammed'
  };
  for (const [scenarioId, mode] of Object.entries(expected)) {
    const { result } = run({ scenarioId });
    assert.equal(result.mode.id, mode, `${scenarioId} should produce ${mode}`);
  }
});

test('local release converts the unjamming baseline into a detected transition', () => {
  const { engine, result } = run({ scenarioId: 'unjamming', maxTime: 46 }, 'release');
  assert.equal(result.mode.id, 'unjamming');
  assert.equal(result.metrics.jammed, true);
  assert.equal(result.metrics.unjammed, true);
  assert.ok(engine.events.some(event => event.type === 'jam'));
  assert.ok(engine.events.some(event => event.type === 'unjam'));
});

test('leader removal is recorded and strong alignment can promote a replacement', () => {
  const { engine } = run({ scenarioId: 'leader-follower', presetId: 'collective', alignment: 0.9, maxTime: 24 }, 'remove-leader', 6);
  assert.ok(engine.events.some(event => event.type === 'leader-lost'));
  assert.ok(engine.events.some(event => event.type === 'leader-replaced'));
});

test('budding scenario emits an explicit bud event', () => {
  const { engine, result } = run({ scenarioId: 'budding', presetId: 'budding' });
  assert.equal(result.mode.id, 'tumor-budding');
  assert.ok(engine.events.some(event => event.type === 'bud'));
  assert.ok(result.metrics.budCount >= 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_VERSION,
  MODEL_VERSION,
  PRESETS,
  SCENARIOS,
  classifyOutcome,
  makeConfig,
  migrateConfig
} from '../src/simulation/model.js';
import { SimulationEngine } from '../src/simulation/engine.js';

test('v2 configuration is sanitized, scenario-aware, hashed, and versioned', () => {
  const config = makeConfig({
    scenarioId: 'unknown',
    presetId: 'unknown',
    adhesion: 9,
    deformability: -1,
    alignment: 'not-a-number',
    gapWidth: 500,
    cellCount: 2,
    maxTime: Number.NaN,
    seed: 0
  });
  assert.equal(config.scenarioId, 'narrow-gap');
  assert.equal(config.presetId, SCENARIOS['narrow-gap'].defaultPresetId);
  assert.equal(config.adhesion, 0.98);
  assert.equal(config.deformability, 0.05);
  assert.equal(config.alignment, PRESETS.collective.alignment);
  assert.equal(config.gapWidth, 140);
  assert.equal(config.cellCount, 24);
  assert.equal(config.maxTime, SCENARIOS['narrow-gap'].defaultMaxTime);
  assert.equal(config.seed, 1);
  assert.equal(config.appVersion, APP_VERSION);
  assert.equal(config.modelVersion, MODEL_VERSION);
  assert.match(config.configHash, /^[0-9a-f]{8}$/);
  assert.match(config.scenarioHash, /^[0-9a-f]{8}$/);
});

test('configuration hashes are stable and change with scientific inputs', () => {
  const a = makeConfig({ scenarioId: 'budding', seed: 42 });
  const b = makeConfig({ scenarioId: 'budding', seed: 42 });
  const c = makeConfig({ scenarioId: 'budding', seed: 43 });
  const d = makeConfig({ scenarioId: 'leader-follower', seed: 42 });
  assert.equal(a.configHash, b.configHash);
  assert.notEqual(a.configHash, c.configHash);
  assert.notEqual(a.scenarioHash, d.scenarioHash);
});

test('v1 configuration migrates to the v2 narrow-gap schema', () => {
  const migrated = migrateConfig({ presetId: 'escape', seed: 123, adhesion: 0.2, appVersion: '1.1.0' });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.scenarioId, 'narrow-gap');
  assert.equal(migrated.presetId, 'escape');
  assert.equal(migrated.seed, 123);
});

test('scenario-aware classifier covers new v2 modes', () => {
  assert.equal(classifyOutcome({ passRate: 0.01, mobilityIndex: 0.1, jammed: true }, makeConfig({ scenarioId: 'unjamming' })).id, 'jammed');
  assert.equal(classifyOutcome({ passRate: 0.5, mobilityIndex: 0.7, mobilityGain: 0.5, unjammed: true }, makeConfig({ scenarioId: 'unjamming' })).id, 'unjamming');
  assert.equal(classifyOutcome({ passRate: 0.6, integrity: 0.8, leaderFollowerRate: 0.9, branchCount: 1 }, makeConfig({ scenarioId: 'leader-follower' })).id, 'leader-guided');
  assert.equal(classifyOutcome({ passRate: 0.5, integrity: 0.7, leaderFollowerRate: 0.5, branchCount: 2 }, makeConfig({ scenarioId: 'leader-follower' })).id, 'split-migration');
  assert.equal(classifyOutcome({ passRate: 0.4, integrity: 0.65, isolatedRate: 0.1, fragments: 3, budCount: 1 }, makeConfig({ scenarioId: 'budding' })).id, 'tumor-budding');
});

test('engine remains deterministic for the same v2 configuration', () => {
  const config = { scenarioId: 'leader-follower', presetId: 'collective', seed: 123, maxTime: 8 };
  const a = new SimulationEngine(config);
  const b = new SimulationEngine(config);
  for (let i = 0; i < 180; i++) {
    a.step();
    b.step();
  }
  assert.deepEqual([...a.getFrame().data], [...b.getFrame().data]);
  assert.deepEqual(a.events, b.events);
});

test('engine stops exactly at a non-frame-aligned maximum time', () => {
  const engine = new SimulationEngine({ scenarioId: 'narrow-gap', presetId: 'jam', maxTime: 12.05 });
  while (!engine.finished) engine.step();
  assert.ok(Math.abs(engine.time - 12.05) < 1e-9);
});

test('only one scenario perturbation is accepted per run', () => {
  const engine = new SimulationEngine({ scenarioId: 'leader-follower' });
  assert.equal(engine.applyPerturbation('remove-leader'), true);
  assert.equal(engine.applyPerturbation('align'), false);
  assert.equal(engine.getResult().perturbation.type, 'remove-leader');
});

test('frame exposes versioned stride and serializable scenario geometry', () => {
  const engine = new SimulationEngine({ scenarioId: 'leader-follower' });
  const frame = engine.getFrame();
  assert.equal(frame.meta.stride, 11);
  assert.equal(frame.data.length, engine.cells.length * frame.meta.stride);
  assert.equal(frame.meta.geometry.openings.length, 2);
  assert.ok(frame.meta.geometry.obstacles.length >= 2);
});

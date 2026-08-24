import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_VERSION,
  MODEL_VERSION,
  INTERVENTIONS,
  PRESETS,
  SCENARIOS,
  classifyOutcome,
  makeConfig,
  migrateConfig
} from '../simulation/model.js';
import { SimulationEngine } from '../simulation/engine.js';

test('v4 configuration is sanitized, scenario-aware, intervention-aware, hashed, and versioned', () => {
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



test('v4 interventions are sanitized and contribute to the reproducibility hash', () => {
  const control = makeConfig({ scenarioId: 'budding', seed: 19, interventionId: 'control' });
  const blocked = makeConfig({ scenarioId: 'budding', seed: 19, interventionId: 'degradation-block' });
  const invalid = makeConfig({ scenarioId: 'budding', seed: 19, interventionId: 'not-real' });
  assert.equal(blocked.interventionId, INTERVENTIONS['degradation-block'].id);
  assert.equal(invalid.interventionId, 'control');
  assert.notEqual(control.configHash, blocked.configHash);
  assert.equal(control.scenarioHash, blocked.scenarioHash);
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

test('legacy configuration migrates to the v4 narrow-gap schema', () => {
  const migrated = migrateConfig({ presetId: 'escape', seed: 123, adhesion: 0.2, appVersion: '1.1.0' });
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.interventionId, 'control');
  assert.equal(migrated.scenarioId, 'narrow-gap');
  assert.equal(migrated.presetId, 'escape');
  assert.equal(migrated.seed, 123);
});

test('scenario-aware classifier covers v4 modes', () => {
  assert.equal(classifyOutcome({ passRate: 0.01, mobilityIndex: 0.1, jammed: true }, makeConfig({ scenarioId: 'unjamming' })).id, 'jammed');
  assert.equal(classifyOutcome({ passRate: 0.5, mobilityIndex: 0.7, mobilityGain: 0.5, unjammed: true }, makeConfig({ scenarioId: 'unjamming' })).id, 'unjamming');
  assert.equal(classifyOutcome({ passRate: 0.6, integrity: 0.8, leaderFollowerRate: 0.9, branchCount: 1 }, makeConfig({ scenarioId: 'leader-follower' })).id, 'leader-guided');
  assert.equal(classifyOutcome({ passRate: 0.5, integrity: 0.7, leaderFollowerRate: 0.5, branchCount: 2 }, makeConfig({ scenarioId: 'leader-follower' })).id, 'split-migration');
  assert.equal(classifyOutcome({ passRate: 0.4, integrity: 0.65, isolatedRate: 0.1, fragments: 3, budCount: 1 }, makeConfig({ scenarioId: 'budding' })).id, 'tumor-budding');
});

test('engine remains deterministic for the same v4 configuration', () => {
  const config = { scenarioId: 'leader-follower', presetId: 'collective', seed: 123, maxTime: 8 };
  const a = new SimulationEngine(config);
  const b = new SimulationEngine(config);
  for (let i = 0; i < 180; i++) {
    a.step();
    b.step();
  }
  const frameA = a.getFrame();
  const frameB = b.getFrame();
  assert.deepEqual([...frameA.data], [...frameB.data]);
  assert.deepEqual([...frameA.ecm.packed], [...frameB.ecm.packed]);
  assert.deepEqual(a.events, b.events);
});



test('first-contact is emitted only after a cell actually reaches a modeled boundary', () => {
  for (const scenarioId of ['narrow-gap', 'budding', 'leader-follower', 'unjamming']) {
    const engine = new SimulationEngine({ scenarioId, seed: 20260803, maxTime: 20 });
    for (let index = 0; index < 10; index++) engine.step();
    assert.equal(engine.events.some(event => event.type === 'first-contact'), false, `${scenarioId} reported contact before reaching a boundary`);
    while (!engine.finished && !engine.events.some(event => event.type === 'first-contact')) engine.step();
    const contact = engine.events.find(event => event.type === 'first-contact');
    assert.ok(contact, `${scenarioId} should eventually report a real boundary contact`);
    assert.ok(contact.time >= 0.9, `${scenarioId} contact occurred implausibly early at ${contact.time}`);
  }
});

test('leader emergence does not globally overwrite follower branch choices', () => {
  const engine = new SimulationEngine({
    scenarioId: 'leader-follower',
    presetId: 'collective',
    seed: 20260803,
    maxTime: 24,
    cellCount: 48
  });
  while (!engine.finished && !engine.events.some(event => event.type === 'leader-emerged')) engine.step();
  assert.ok(engine.events.some(event => event.type === 'leader-emerged'));
  const activeBranches = new Set(engine.cells.filter(cell => !cell.passed).map(cell => cell.branch));
  assert.deepEqual([...activeBranches].sort(), [0, 1]);
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
  assert.equal(frame.meta.stride, 20);
  assert.equal(frame.data.length, engine.cells.length * frame.meta.stride);
  assert.equal(frame.meta.geometry.openings.length, 2);
  assert.ok(frame.meta.geometry.obstacles.length >= 2);
  assert.equal(frame.meta.modelKind, 'multiscale-deformable-cell-nucleus-ecm');
  assert.equal(frame.ecm.packed.length, frame.ecm.columns * frame.ecm.rows * 4);
  assert.ok(frame.meta.geometry.guidanceArrows.length > 20);
});

test('v4 cell boundaries conserve area while changing aspect ratio', () => {
  const engine = new SimulationEngine({ scenarioId: 'narrow-gap', presetId: 'collective', gapWidth: 26, maxTime: 12 });
  for (let index = 0; index < 240; index++) engine.step();
  const frame = engine.getFrame();
  const strains = [];
  for (let offset = 0; offset < frame.data.length; offset += frame.meta.stride) strains.push(frame.data[offset + 7]);
  assert.ok(strains.some(value => value > 0.08));
  assert.equal(frame.meta.metrics.areaConservationError, 0);
  assert.ok(Number.isFinite(frame.meta.metrics.meanShapeIndex));
});

test('v4 exposes explicit nuclear deformation and contact-network metrics', () => {
  const engine = new SimulationEngine({ scenarioId: 'unjamming', presetId: 'jam', maxTime: 12 });
  while (!engine.finished) engine.step();
  const metrics = engine.getMetrics();
  assert.ok(metrics.meanNuclearStrain >= 0);
  assert.ok(metrics.meanContactNumber >= 0);
  assert.ok(Number.isFinite(metrics.highNuclearStrainRate));
});

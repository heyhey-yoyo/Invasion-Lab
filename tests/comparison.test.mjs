import test from 'node:test';
import assert from 'node:assert/strict';
import { runPairedComparison } from '../simulation/comparison.js';

const compact = { seedCount: 3, maxTime: 12, cellCount: 24 };

test('paired comparison is deterministic and uses identical seeds in both groups', () => {
  const input = { scenarioId: 'budding', presetId: 'budding', seed: 20260803 };
  const a = runPairedComparison(input, 'degradation-block', compact);
  const b = runPairedComparison(input, 'degradation-block', compact);
  assert.deepEqual(a, b);
  assert.equal(a.seedCount, 3);
  assert.equal(a.reproducibility.pairedSeeds.length, 3);
  assert.equal(new Set(a.reproducibility.pairedSeeds).size, 3);
});

test('degradation inhibition reduces remodeled ECM in paired budding experiments', () => {
  const result = runPairedComparison(
    { scenarioId: 'budding', presetId: 'budding', seed: 42 },
    'degradation-block',
    compact
  );
  assert.ok(result.metrics.degradedAreaRate.difference < -0.005);
  assert.ok(result.metrics.mobilityIndex.difference < 0);
});

test('stiffer matrix lowers movement or passage under the same paired seeds', () => {
  const result = runPairedComparison(
    { scenarioId: 'narrow-gap', presetId: 'collective', seed: 42 },
    'stiff-matrix',
    compact
  );
  assert.ok(result.metrics.mobilityIndex.difference < -0.02);
  assert.ok(result.metrics.passRate.difference <= 0);
});

test('leader suppression reduces branch-following consistency in a full comparison window', () => {
  const result = runPairedComparison(
    { scenarioId: 'leader-follower', presetId: 'collective', seed: 20260803 },
    'leader-suppression',
    { seedCount: 3, maxTime: 24, cellCount: 48 }
  );
  assert.ok(result.metrics.leaderFollowerRate.difference < -0.04);
  assert.ok(result.metrics.tractionAsymmetry.difference < 0);
});


test('comparison reports right-censoring metadata and a small-sample t interval', () => {
  const result = runPairedComparison(
    { scenarioId: 'narrow-gap', presetId: 'jam', seed: 99 },
    'stiff-matrix',
    { seedCount: 3, maxTime: 12, cellCount: 24 }
  );
  const metric = result.metrics.firstPassTime;
  assert.equal(metric.censored.observationWindow, 12);
  assert.ok(metric.censored.control >= 0 && metric.censored.control <= 3);
  assert.ok(metric.censored.treatment >= 0 && metric.censored.treatment <= 3);
  const differences = result.reproducibility.pairedSeeds.length;
  assert.equal(differences, 3);
  assert.ok(metric.interval[0] <= metric.difference && metric.interval[1] >= metric.difference);
  assert.match(result.scientificScope, /right-censored/);
  assert.equal(result.baseConfig.scenarioId, 'narrow-gap');
});

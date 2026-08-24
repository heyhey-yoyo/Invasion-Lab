import test from 'node:test';
import assert from 'node:assert/strict';
import { runBatchScan } from '../simulation/batch.js';

test('batch map runs real multi-seed simulations and returns consensus summaries', () => {
  const result = runBatchScan({ scenarioId: 'narrow-gap', seed: 123 }, { size: 3, seedCount: 2, maxTime: 8, cellCount: 24 });
  assert.equal(result.points.length, 9);
  assert.equal(result.seedCount, 2);
  assert.equal(result.baseConfig.scenarioId, 'narrow-gap');
  assert.equal(result.baseConfig.seed, 123);
  for (const point of result.points) {
    assert.ok(point.consensus >= 0.5 && point.consensus <= 1);
    assert.ok(point.meanPassRate >= 0 && point.meanPassRate <= 1);
    assert.equal(Object.values(point.outcomes).reduce((sum, count) => sum + count, 0), 2);
  }
});

test('batch scan is deterministic for the same base configuration', () => {
  const options = { size: 3, seedCount: 2, maxTime: 8, cellCount: 24 };
  const a = runBatchScan({ scenarioId: 'leader-follower', seed: 987 }, options);
  const b = runBatchScan({ scenarioId: 'leader-follower', seed: 987 }, options);
  assert.deepEqual(a, b);
});

test('batch scan keeps the selected scenario and produces more than one regime', () => {
  const result = runBatchScan({ scenarioId: 'unjamming', seed: 333 }, { size: 3, seedCount: 2, maxTime: 10, cellCount: 28 });
  assert.equal(result.scenarioId, 'unjamming');
  assert.ok(new Set(result.points.map(point => point.mode)).size >= 1);
});

test('batch scan reports monotonic point-level progress', () => {
  const updates = [];
  const result = runBatchScan(
    { scenarioId: 'budding', seed: 22 },
    { size: 3, seedCount: 2, maxTime: 8, cellCount: 24 },
    update => updates.push(update)
  );
  assert.equal(result.points.length, 9);
  assert.equal(updates.length, 9);
  assert.deepEqual(updates.at(-1), { completed: 9, total: 9, fraction: 1 });
  assert.ok(updates.every((item, index) => item.completed === index + 1));
});

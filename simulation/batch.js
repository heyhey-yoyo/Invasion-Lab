import { makeConfig } from './config.js';
import { SimulationEngine } from './engine.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function runBatchScan(inputConfig, options = {}, onProgress = null) {
  const base = makeConfig(inputConfig);
  const size = Math.round(clamp(Number(options.size) || 5, 3, 7));
  const seedCount = Math.round(clamp(Number(options.seedCount) || 3, 2, 5));
  const maxTime = clamp(Number(options.maxTime) || Math.min(16, base.maxTime), 8, 24);
  const cellCount = Math.round(clamp(Number(options.cellCount) || Math.min(44, base.cellCount), 24, 60));
  const points = [];
  const totalPoints = size * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const adhesion = 0.12 + (x / (size - 1)) * 0.82;
      const deformability = 0.12 + (y / (size - 1)) * 0.82;
      const results = [];
      for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
        const config = makeConfig({
          ...base,
          presetId: 'custom',
          adhesion,
          deformability,
          maxTime,
          cellCount,
          seed: (base.seed + seedIndex * 2654435761) >>> 0 || seedIndex + 1
        });
        const engine = new SimulationEngine(config);
        while (!engine.finished) engine.step();
        results.push(engine.getResult());
      }

      const counts = new Map();
      for (const result of results) counts.set(result.mode.id, (counts.get(result.mode.id) || 0) + 1);
      const [dominantMode, dominantCount] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      points.push({
        x,
        y,
        adhesion,
        deformability,
        mode: dominantMode,
        consensus: dominantCount / seedCount,
        seedCount,
        meanPassRate: mean(results.map(result => result.metrics.passRate)),
        meanIntegrity: mean(results.map(result => result.metrics.integrity)),
        meanMobility: mean(results.map(result => result.metrics.mobilityIndex)),
        outcomes: Object.fromEntries([...counts.entries()].sort())
      });
      if (typeof onProgress === 'function') {
        onProgress({ completed: points.length, total: totalPoints, fraction: points.length / totalPoints });
      }
    }
  }

  return {
    type: 'batch-result',
    size,
    seedCount,
    scenarioId: base.scenarioId,
    configHash: base.configHash,
    baseConfig: base,
    axes: { x: 'adhesion', y: 'deformability' },
    points
  };
}

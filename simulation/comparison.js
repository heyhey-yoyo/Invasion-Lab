import { makeConfig } from './config.js';
import { SimulationEngine } from './engine.js';
import { getIntervention } from './interventions.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}


function tCritical95(degreesOfFreedom) {
  const table = { 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447 };
  return table[degreesOfFreedom] || 1.96;
}

function run(config) {
  const engine = new SimulationEngine(config);
  while (!engine.finished) engine.step();
  return engine.getResult();
}

function metricValue(result, key, maxTime) {
  const value = result.metrics[key];
  if (key === 'firstPassTime') return Number.isFinite(value) ? value : maxTime;
  return Number.isFinite(value) ? value : 0;
}

export function runPairedComparison(inputConfig, treatmentId, options = {}, onProgress = null) {
  const base = makeConfig({ ...inputConfig, interventionId: 'control' });
  const treatment = getIntervention(treatmentId);
  if (treatment.id === 'control') throw new Error('comparison treatment must not be control');
  const seedCount = Math.round(clamp(Number(options.seedCount) || 5, 3, 7));
  const maxTime = clamp(Number(options.maxTime) || Math.min(base.maxTime, 24), 12, 36);
  const cellCount = Math.round(clamp(Number(options.cellCount) || Math.min(base.cellCount, 54), 24, 70));
  const metricKeys = ['passRate', 'firstPassTime', 'integrity', 'meanNuclearStrain', 'degradedAreaRate', 'mobilityIndex', 'leaderFollowerRate', 'tractionAsymmetry'];
  const pairs = [];

  for (let index = 0; index < seedCount; index++) {
    const seed = (base.seed + Math.imul(index, 2654435761)) >>> 0 || index + 1;
    const common = { ...base, seed, maxTime, cellCount, presetId: base.presetId };
    const control = run(makeConfig({ ...common, interventionId: 'control' }));
    const treated = run(makeConfig({ ...common, interventionId: treatment.id }));
    pairs.push({ seed, control, treated });
    if (typeof onProgress === 'function') onProgress({ completed: index + 1, total: seedCount, fraction: (index + 1) / seedCount });
  }

  const metrics = {};
  for (const key of metricKeys) {
    const controlValues = pairs.map(pair => metricValue(pair.control, key, maxTime));
    const treatmentValues = pairs.map(pair => metricValue(pair.treated, key, maxTime));
    const differences = treatmentValues.map((value, index) => value - controlValues[index]);
    const difference = mean(differences);
    const sd = standardDeviation(differences);
    const halfWidth = differences.length > 1 ? tCritical95(differences.length - 1) * sd / Math.sqrt(differences.length) : 0;
    metrics[key] = {
      control: mean(controlValues),
      treatment: mean(treatmentValues),
      difference,
      interval: [difference - halfWidth, difference + halfWidth],
      pairedEffect: sd > 1e-9 ? difference / sd : difference === 0 ? 0 : null,
      censored: key === 'firstPassTime' ? {
        control: pairs.filter(pair => !Number.isFinite(pair.control.metrics.firstPassTime)).length,
        treatment: pairs.filter(pair => !Number.isFinite(pair.treated.metrics.firstPassTime)).length,
        observationWindow: maxTime
      } : null
    };
  }

  return {
    type: 'comparison-result',
    schemaVersion: 1,
    scenarioId: base.scenarioId,
    baseConfig: base,
    treatment: { id: treatment.id, name: treatment.name, description: treatment.description },
    seedCount,
    maxTime,
    cellCount,
    metrics,
    outcomes: {
      control: Object.fromEntries([...new Set(pairs.map(pair => pair.control.mode.id))].map(id => [id, pairs.filter(pair => pair.control.mode.id === id).length])),
      treatment: Object.fromEntries([...new Set(pairs.map(pair => pair.treated.mode.id))].map(id => [id, pairs.filter(pair => pair.treated.mode.id === id).length]))
    },
    reproducibility: {
      baseSeed: base.seed,
      pairedSeeds: pairs.map(pair => pair.seed),
      configHash: base.configHash
    },
    scientificScope: 'Paired seeded qualitative comparison; 95% t intervals are exploratory, and non-passage first-pass times are right-censored at the observation window.'
  };
}

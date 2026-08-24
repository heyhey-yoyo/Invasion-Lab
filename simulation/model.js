export { APP_VERSION, CONFIG_SCHEMA_VERSION, MODEL_VERSION, RESULT_SCHEMA_VERSION } from './versions.js';
export { LEVELS, PRESETS } from './profiles.js';
export { getIntervention, INTERVENTIONS, interventionsForScenario } from './interventions.js';
export { DEFAULT_SCENARIO_ID, getScenario, SCENARIOS } from './scenarios/catalog.js';
export { makeConfig, migrateConfig } from './config.js';
export { classifyOutcome, explainOutcome, phaseLabel, recommendControl } from './outcomes.js';

import { classifyOutcome } from './outcomes.js';
import { makeConfig } from './config.js';

export function heuristicPhase(adhesion, deformability, gapWidth = 36, scenarioId = 'narrow-gap') {
  const config = makeConfig({ scenarioId, presetId: 'custom', adhesion, deformability, gapWidth });
  const opening = Math.max(0, Math.min(1, (gapWidth - 22) / 90));
  const throughput = deformability * 0.58 + opening * 0.42;
  const approximate = {
    passRate: Math.max(0, Math.min(1, throughput * (0.65 + config.persistence * 0.2))),
    integrity: Math.max(0, Math.min(1, adhesion * 0.8 + config.alignment * 0.2)),
    isolatedRate: Math.max(0, (0.35 - adhesion) * 1.8),
    fragments: adhesion < 0.68 && throughput > 0.42 ? 2 : 1,
    jammed: throughput < 0.35 && adhesion > 0.5,
    budCount: scenarioId === 'budding' && adhesion < 0.7 && throughput > 0.35 ? 1 : 0,
    leaderFollowerRate: config.alignment,
    branchCount: scenarioId === 'leader-follower' && config.alignment < 0.55 ? 2 : 1,
    mobilityIndex: throughput,
    mobilityGain: deformability - 0.45,
    unjammed: scenarioId === 'unjamming' && deformability > 0.65
  };
  return classifyOutcome(approximate, config).id;
}

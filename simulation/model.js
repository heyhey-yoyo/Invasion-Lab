export { APP_VERSION, CONFIG_SCHEMA_VERSION, MODEL_VERSION, RESULT_SCHEMA_VERSION } from './versions.js?v=1.0.1-upgrade-2';
export { LEVELS, PRESETS } from './profiles.js?v=1.0.1-upgrade-2';
export { getIntervention, INTERVENTIONS, interventionsForScenario } from './interventions.js?v=1.0.1-upgrade-2';
export { DEFAULT_SCENARIO_ID, getScenario, SCENARIOS } from './scenarios/catalog.js?v=1.0.1-upgrade-2';
export { makeConfig, migrateConfig } from './config.js?v=1.0.1-upgrade-2';
export { classifyOutcome, explainOutcome, phaseLabel, recommendControl } from './outcomes.js?v=1.0.1-upgrade-2';

import { classifyOutcome } from './outcomes.js?v=1.0.1-upgrade-2';
import { makeConfig } from './config.js?v=1.0.1-upgrade-2';

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

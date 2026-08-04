import { fnv1a32 } from './core/hash.js';
import { LEGACY_PRESET_ALIASES, PRESETS } from './profiles.js';
import { DEFAULT_SCENARIO_ID, getScenario, SCENARIOS } from './scenarios/catalog.js';
import {
  APP_VERSION,
  CONFIG_SCHEMA_VERSION,
  MODEL_VERSION,
  SCENARIO_CATALOG_VERSION
} from './versions.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function numberInRange(value, fallback, min, max) {
  const numeric = Number(value);
  return clamp(Number.isFinite(numeric) ? numeric : fallback, min, max);
}

function normalizeSeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 20260803;
  return Math.trunc(clamp(numeric, 1, 0xFFFFFFFF));
}

function normalizePresetId(value, fallback) {
  const requested = typeof value === 'string' ? value : '';
  const alias = LEGACY_PRESET_ALIASES[requested] || requested;
  return PRESETS[alias] ? alias : fallback;
}

export function makeConfig(input = {}) {
  const scenarioId = typeof input.scenarioId === 'string' && SCENARIOS[input.scenarioId]
    ? input.scenarioId
    : DEFAULT_SCENARIO_ID;
  const scenario = getScenario(scenarioId);
  const presetId = normalizePresetId(input.presetId, scenario.defaultPresetId);
  const preset = PRESETS[presetId];
  const requestedCustom = input.presetId === 'custom';

  const config = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    scenarioId,
    scenarioVersion: scenario.version,
    presetId: requestedCustom ? 'custom' : presetId,
    adhesion: numberInRange(input.adhesion, preset.adhesion, 0.05, 0.98),
    deformability: numberInRange(input.deformability, preset.deformability, 0.05, 0.98),
    alignment: numberInRange(input.alignment, preset.alignment, 0, 0.98),
    persistence: numberInRange(input.persistence, preset.persistence, 0, 0.98),
    noise: numberInRange(input.noise, preset.noise, 0, 0.6),
    speed: numberInRange(input.speed, preset.speed, 10, 42),
    gapWidth: numberInRange(input.gapWidth, scenario.defaultGapWidth, 22, 140),
    cellCount: Math.round(numberInRange(input.cellCount, scenario.defaultCellCount, 24, 140)),
    maxTime: numberInRange(input.maxTime, scenario.defaultMaxTime, 12, 120),
    leaderMode: typeof input.leaderMode === 'boolean' ? input.leaderMode : preset.leaderMode,
    seed: normalizeSeed(input.seed),
    appVersion: APP_VERSION,
    modelVersion: MODEL_VERSION,
    scenarioCatalogVersion: SCENARIO_CATALOG_VERSION
  };

  config.scenarioHash = fnv1a32({
    scenarioId: config.scenarioId,
    scenarioVersion: config.scenarioVersion,
    gapWidth: config.gapWidth,
    cellCount: config.cellCount
  });
  config.configHash = fnv1a32({
    ...config,
    appVersion: undefined,
    configHash: undefined
  });
  return config;
}

export function migrateConfig(input = {}) {
  if (!input || typeof input !== 'object') return makeConfig();
  if (input.schemaVersion === CONFIG_SCHEMA_VERSION && input.scenarioId) return makeConfig(input);
  return makeConfig({
    ...input,
    scenarioId: input.scenarioId || DEFAULT_SCENARIO_ID,
    presetId: input.presetId || 'collective'
  });
}

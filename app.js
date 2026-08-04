import {
  APP_VERSION,
  MODEL_VERSION,
  PRESETS,
  SCENARIOS,
  classifyOutcome,
  getScenario,
  interventionsForScenario,
  makeConfig,
  migrateConfig,
  phaseLabel
} from './simulation/model.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const elements = {
  scenarioGrid: $('#scenarioGrid'),
  presetGrid: $('#presetGrid'),
  experimentEyebrow: $('#experimentEyebrow'),
  experimentTitle: $('#experiment-title'),
  experimentLede: $('#experimentLede'),
  recommendationHint: $('#recommendationHint'),
  canvas: $('#simulationCanvas'),
  canvasWrap: $('#canvasWrap'),
  canvasLabelLeft: $('#canvasLabelLeft'),
  canvasLabelObstacle: $('#canvasLabelObstacle'),
  canvasLabelSource: $('#canvasLabelSource'),
  hoverTip: $('#hoverTip'),
  replayBadge: $('#replayBadge'),
  start: $('#startExperiment'),
  playPause: $('#playPauseButton'),
  reset: $('#resetButton'),
  step: $('#stepButton'),
  speed: $('#speedSelect'),
  status: $('#stageStatus'),
  statusDot: $('#statusDot'),
  scenarioBadge: $('#scenarioBadge'),
  observation: $('#observationText'),
  limiting: $('#limitingFactor'),
  explanationFactors: $('#explanationFactors'),
  timeNow: $('#timeNow'),
  timeMax: $('#timeMax'),
  progress: $('#progressBar'),
  timeline: $('#timeline'),
  seedBadge: $('#seedBadge'),
  modelBadge: $('#modelBadge'),
  first: $('#metricFirst'),
  pass: $('#metricPass'),
  integrity: $('#metricIntegrity'),
  mode: $('#metricMode'),
  firstLabel: $('#metricFirstLabel'),
  passLabel: $('#metricPassLabel'),
  integrityLabel: $('#metricIntegrityLabel'),
  modeLabel: $('#metricModeLabel'),
  resultCard: $('#resultCard'),
  resultMode: $('#resultMode'),
  resultExplanation: $('#resultExplanation'),
  resultRecommendation: $('#resultRecommendation'),
  resultConfidence: $('#resultConfidence'),
  resultConfigHash: $('#resultConfigHash'),
  resultScenarioHash: $('#resultScenarioHash'),
  gapRange: $('#gapRange'),
  gapOutput: $('#gapOutput'),
  geometryControlLabel: $('#geometryControlLabel'),
  seedInput: $('#seedInput'),
  cellCountInput: $('#cellCountInput'),
  durationInput: $('#durationInput'),
  configHash: $('#configHash'),
  scenarioHash: $('#scenarioHash'),
  perturbActions: $('#perturbActions'),
  scienceDialog: $('#scienceDialog'),
  mapDialog: $('#mapDialog'),
  keyboardDialog: $('#keyboardDialog'),
  invasionMap: $('#invasionMap'),
  mapLegend: $('#mapLegend'),
  mapSubtitle: $('#mapSubtitle'),
  mapProgress: $('#mapProgress'),
  comparisonTreatment: $('#comparisonTreatment'),
  comparisonDialog: $('#comparisonDialog'),
  comparisonProgress: $('#comparisonProgress'),
  comparisonSummary: $('#comparisonSummary'),
  comparisonMetrics: $('#comparisonMetrics'),
  toast: $('#toast')
};

const ctx = elements.canvas.getContext('2d', { alpha: false });
const worker = new Worker('./simulation/worker.js', { type: 'module' });
const batchWorker = new Worker('./simulation/batch-worker.js', { type: 'module' });
const comparisonWorker = new Worker('./simulation/comparison-worker.js', { type: 'module' });

const state = {
  mode: 'play',
  config: makeConfig(readUrlConfig()),
  running: false,
  started: false,
  completed: false,
  currentFrame: null,
  frames: [],
  events: [],
  result: null,
  perturbation: null,
  replay: null,
  hoveredCell: -1,
  installPrompt: null,
  needsRender: true,
  lastBatch: null,
  batchRunning: false,
  comparisonRunning: false,
  lastComparison: null,
  runId: 0,
  batchRequestId: 0,
  comparisonRequestId: 0
};

function readUrlConfig() {
  const query = new URLSearchParams(location.search);
  return {
    scenarioId: query.get('q') || 'narrow-gap',
    presetId: query.get('p') || undefined,
    adhesion: query.has('a') ? Number(query.get('a')) : undefined,
    deformability: query.has('d') ? Number(query.get('d')) : undefined,
    alignment: query.has('l') ? Number(query.get('l')) : undefined,
    persistence: query.has('r') ? Number(query.get('r')) : undefined,
    noise: query.has('z') ? Number(query.get('z')) : undefined,
    speed: query.has('v') ? Number(query.get('v')) : undefined,
    leaderMode: query.has('h') ? query.get('h') === '1' : undefined,
    gapWidth: query.has('g') ? Number(query.get('g')) : undefined,
    seed: query.has('s') ? Number(query.get('s')) : undefined,
    cellCount: query.has('n') ? Number(query.get('n')) : undefined,
    maxTime: query.has('t') ? Number(query.get('t')) : undefined
  };
}

function scenario() {
  return getScenario(state.config.scenarioId);
}

function renderScenarios() {
  const ids = Object.keys(SCENARIOS);
  elements.scenarioGrid.replaceChildren(...ids.map(id => {
    const item = SCENARIOS[id];
    const selected = state.config.scenarioId === id;
    const button = document.createElement('button');
    const title = document.createElement('strong');
    const description = document.createElement('span');
    button.type = 'button';
    button.className = 'scenario-card';
    button.dataset.scenario = id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.title = item.question;
    title.textContent = item.name;
    description.textContent = item.question;
    button.append(title, description);
    button.addEventListener('click', () => selectScenario(id));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
      const nextId = ids[(ids.indexOf(id) + offset + ids.length) % ids.length];
      selectScenario(nextId);
      requestAnimationFrame(() => elements.scenarioGrid.querySelector(`[data-scenario="${nextId}"]`)?.focus());
    });
    return button;
  }));
}

function selectScenario(id) {
  if (!SCENARIOS[id]) return;
  const item = SCENARIOS[id];
  state.config = makeConfig({
    scenarioId: id,
    presetId: item.defaultPresetId,
    seed: state.config.seed,
    gapWidth: item.defaultGapWidth,
    cellCount: item.defaultCellCount,
    maxTime: item.defaultMaxTime
  });
  renderAllControls();
  resetExperiment();
  showToast(`已切换到“${item.name}”场景`);
}

function renderPresets() {
  const ids = Object.keys(PRESETS);
  elements.presetGrid.replaceChildren(...ids.map(id => {
    const preset = PRESETS[id];
    const selected = state.config.presetId === id;
    const button = document.createElement('button');
    const title = document.createElement('strong');
    const subtitle = document.createElement('span');
    button.type = 'button';
    button.className = 'preset-card';
    button.dataset.preset = id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.title = preset.description;
    title.textContent = preset.name;
    subtitle.textContent = preset.subtitle;
    button.append(title, subtitle);
    button.addEventListener('click', () => selectPreset(id));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
      const nextId = ids[(ids.indexOf(id) + offset + ids.length) % ids.length];
      selectPreset(nextId);
      requestAnimationFrame(() => elements.presetGrid.querySelector(`[data-preset="${nextId}"]`)?.focus());
    });
    return button;
  }));
}

function selectPreset(id) {
  if (!PRESETS[id]) return;
  state.config = makeConfig({
    ...state.config,
    ...PRESETS[id],
    scenarioId: state.config.scenarioId,
    presetId: id
  });
  renderAllControls();
  resetExperiment();
  showToast(`已载入“${PRESETS[id].name}”行为人格`);
}

function renderPerturbations() {
  elements.perturbActions.replaceChildren(...scenario().perturbations.map(item => {
    const button = document.createElement('button');
    const symbol = document.createElement('span');
    const label = document.createElement('span');
    button.type = 'button';
    button.dataset.perturb = item.type;
    button.disabled = !state.running || Boolean(state.perturbation);
    symbol.className = 'button-symbol';
    symbol.textContent = item.symbol;
    label.textContent = item.label;
    button.append(symbol, label);
    button.addEventListener('click', () => {
      if (!state.running || state.perturbation) return;
      worker.postMessage({ type: 'perturb', runId: state.runId, perturbation: item.type });
      for (const action of $$('button', elements.perturbActions)) action.disabled = true;
      showToast(`已施加：${item.label}`);
    });
    return button;
  }));
}


function renderComparisonTreatments() {
  const treatments = interventionsForScenario(state.config.scenarioId);
  const previous = elements.comparisonTreatment.value;
  elements.comparisonTreatment.replaceChildren(...treatments.map(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    option.title = item.description;
    return option;
  }));
  if (treatments.some(item => item.id === previous)) elements.comparisonTreatment.value = previous;
}

function renderAllControls() {
  renderScenarios();
  renderPresets();
  renderComparisonTreatments();
  syncControls();
  renderPerturbations();
}

function syncControls() {
  const item = scenario();
  elements.experimentEyebrow.textContent = item.eyebrow;
  elements.experimentTitle.textContent = item.title;
  elements.experimentLede.textContent = item.question;
  elements.recommendationHint.textContent = item.recommendation;
  elements.scenarioBadge.textContent = item.name;
  elements.geometryControlLabel.textContent = item.geometryLabel;
  elements.gapRange.value = String(state.config.gapWidth);
  elements.gapOutput.value = String(Math.round(state.config.gapWidth));
  elements.gapOutput.textContent = `${Math.round(state.config.gapWidth)} px`;
  elements.seedInput.value = String(state.config.seed);
  elements.cellCountInput.value = String(state.config.cellCount);
  elements.durationInput.value = String(state.config.maxTime);
  elements.seedBadge.textContent = `Seed ${state.config.seed}`;
  elements.modelBadge.textContent = `Model ${MODEL_VERSION.match(/\d+\.\d+(?:\.\d+)?/)?.[0] || MODEL_VERSION}`;
  elements.configHash.textContent = state.config.configHash;
  elements.scenarioHash.textContent = state.config.scenarioHash;
  elements.timeMax.textContent = formatTime(state.config.maxTime, false);
  [elements.firstLabel, elements.passLabel, elements.integrityLabel, elements.modeLabel]
    .forEach((label, index) => { label.textContent = item.metricLabels[index]; });
  $$('.segmented').forEach(group => {
    const key = group.dataset.control;
    const buttons = $$('button', group);
    const activeButton = buttons.reduce((closest, button) => {
      if (!closest) return button;
      const currentDistance = Math.abs(Number(button.dataset.value) - state.config[key]);
      const closestDistance = Math.abs(Number(closest.dataset.value) - state.config[key]);
      return currentDistance < closestDistance ? button : closest;
    }, null);
    buttons.forEach(button => {
      const active = button === activeButton;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  });
}

function setMode(mode) {
  if (!['play', 'explore', 'lab'].includes(mode)) return;
  state.mode = mode;
  $$('.mode-tab').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $$('.mode-only').forEach(section => {
    section.hidden = !section.dataset.visibleMode.split(' ').includes(mode);
  });
}

function initWorker() {
  state.runId += 1;
  worker.postMessage({ type: 'init', runId: state.runId, config: state.config });
}

function resetExperiment() {
  worker.postMessage({ type: 'pause', runId: state.runId });
  state.running = false;
  state.started = false;
  state.completed = false;
  state.frames = [];
  state.events = [];
  state.result = null;
  state.perturbation = null;
  state.replay = null;
  state.hoveredCell = -1;
  elements.replayBadge.hidden = true;
  elements.resultCard.hidden = true;
  elements.timeline.replaceChildren(createEmptyState('事件将在实验运行后自动标注。'));
  elements.first.textContent = '—';
  elements.pass.textContent = '0%';
  elements.integrity.textContent = '100%';
  elements.mode.textContent = '观察中';
  renderExplanatoryFactors([]);
  elements.timeNow.textContent = '00:00.0';
  elements.progress.style.width = '0%';
  elements.progress.parentElement.setAttribute('aria-valuenow', '0');
  state.needsRender = true;
  renderPerturbations();
  updateRunButtons();
  initWorker();
}

function createEmptyState(text) {
  const element = document.createElement('p');
  element.className = 'empty-state';
  element.textContent = text;
  return element;
}

function startOrPause() {
  if (state.completed) {
    resetExperiment();
    queueMicrotask(startOrPause);
    return;
  }
  if (state.replay) stopReplay();
  state.started = true;
  state.running = !state.running;
  worker.postMessage({ type: state.running ? 'start' : 'pause', runId: state.runId, speed: Number(elements.speed.value) });
  renderPerturbations();
  updateRunButtons();
}

function updateRunButtons() {
  const label = state.completed ? '重新运行' : state.running ? '暂停实验' : state.started ? '继续实验' : '开始实验';
  $('span', elements.start).textContent = label;
  elements.playPause.textContent = state.running ? 'Ⅱ' : '▶';
  elements.playPause.setAttribute('aria-label', state.running ? '暂停实验' : state.completed ? '重新运行实验' : '开始实验');
  elements.step.disabled = state.running || state.completed;
  elements.statusDot.className = `status-dot ${state.running ? 'is-running' : state.started && !state.completed ? 'is-paused' : ''}`;
  if (!state.started) elements.status.textContent = '已加载推荐实验，等待开始';
  if (!state.running && state.started && !state.completed) elements.status.textContent = '实验已暂停';
}

function stepOnce() {
  if (state.running || state.completed) return;
  state.started = true;
  worker.postMessage({ type: 'step', runId: state.runId });
  updateRunButtons();
}

function updateConfig(key, value) {
  state.config = makeConfig({ ...state.config, [key]: value, presetId: 'custom' });
  renderAllControls();
  resetExperiment();
}

function formatTime(seconds, decimals = true) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(decimals ? 1 : 0).padStart(decimals ? 4 : 2, '0')}`;
}

function primaryEventTime(metrics) {
  const eventType = {
    budding: 'bud',
    'leader-follower': 'leader-pass',
    unjamming: 'unjam'
  }[state.config.scenarioId] || 'first-pass';
  return state.events.find(event => event.type === eventType)?.time ?? metrics.firstPassTime;
}

function updateMetrics(meta) {
  const metrics = meta.metrics;
  const firstTime = primaryEventTime(metrics);
  elements.first.textContent = Number.isFinite(firstTime) ? `${firstTime.toFixed(1)} s` : '—';
  elements.pass.textContent = `${Math.round(metrics.passRate * 100)}%`;
  const thirdMetric = state.config.scenarioId === 'leader-follower'
    ? metrics.leaderFollowerRate
    : metrics.integrity;
  elements.integrity.textContent = `${Math.round(clamp(thirdMetric, 0, 1) * 100)}%`;
  const provisional = meta.time > 3 ? classifyOutcome(metrics, state.config) : null;
  elements.mode.textContent = state.result?.mode.label || provisional?.label.split('｜')[1] || '观察中';
  elements.timeNow.textContent = formatTime(meta.time);
  const progress = clamp(meta.time / state.config.maxTime * 100, 0, 100);
  elements.progress.style.width = `${progress}%`;
  elements.progress.parentElement.setAttribute('aria-valuenow', String(Math.round(progress)));
  elements.observation.textContent = meta.status;
  renderExplanatoryFactors(meta.explanatoryFactors || []);
  elements.status.textContent = meta.status;
  elements.limiting.textContent = limitingFactor(meta);
}


function renderExplanatoryFactors(factors) {
  elements.explanationFactors.replaceChildren(...factors.map(factor => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const meter = document.createElement('i');
    const detail = document.createElement('small');
    label.textContent = factor.label;
    meter.style.setProperty('--factor-score', `${Math.round(clamp(factor.score, 0, 1) * 100)}%`);
    detail.textContent = factor.detail;
    item.append(label, meter, detail);
    return item;
  }));
}

function limitingFactor(meta) {
  const metrics = meta.metrics;
  if (state.config.scenarioId === 'leader-follower') {
    if (metrics.activeLeaders === 0) return 'leader 缺失';
    if (state.config.alignment < 0.45) return '跟随一致度';
    return metrics.branchCount >= 2 ? '分叉竞争' : '出口几何';
  }
  if (state.config.scenarioId === 'unjamming') {
    if (metrics.meanPressure > 1.5) return '局部压力';
    if (state.config.deformability < 0.35) return '细胞柔顺性';
    return '密度—通道耦合';
  }
  if (state.config.scenarioId === 'budding') {
    if (state.config.adhesion > 0.75) return '边缘连接';
    if (metrics.budCount > 0) return '小芽持续性';
    return 'ECM 开口';
  }
  if (state.config.deformability < 0.35) return '细胞柔顺性';
  if (state.config.gapWidth < 34) return '缺口几何';
  if (state.config.adhesion > 0.78 && metrics.passRate < 0.15) return '团块拥堵';
  if (state.config.adhesion < 0.3) return '细胞间连接';
  if (state.config.alignment < 0.3) return '群体引导';
  return '几何—力学平衡';
}

function addEvents(events) {
  if (!events?.length) return;
  if (state.events.length === 0) elements.timeline.replaceChildren();
  for (const item of events) {
    state.events.push(item);
    const button = document.createElement('button');
    const time = document.createElement('time');
    const label = document.createElement('span');
    button.type = 'button';
    button.className = 'timeline-event';
    time.dateTime = `PT${item.time.toFixed(2)}S`;
    time.textContent = formatTime(item.time);
    label.textContent = item.label;
    button.append(time, label);
    button.addEventListener('click', () => replayEvent(item));
    elements.timeline.append(button);
  }
}

function replayEvent(item) {
  if (!state.frames.length) return;
  worker.postMessage({ type: 'pause', runId: state.runId });
  state.running = false;
  updateRunButtons();
  let closest = 0;
  let distance = Infinity;
  state.frames.forEach((frame, index) => {
    const delta = Math.abs(frame.meta.step - item.step);
    if (delta < distance) {
      distance = delta;
      closest = index;
    }
  });
  const start = Math.max(0, closest - 45);
  const end = Math.min(state.frames.length, closest + 46);
  state.replay = { frames: state.frames.slice(start, end), index: 0, last: 0 };
  elements.replayBadge.hidden = false;
  elements.replayBadge.textContent = `关键事件回放：${item.label}`;
  state.needsRender = true;
}

function stopReplay() {
  state.replay = null;
  elements.replayBadge.hidden = true;
  state.needsRender = true;
}

function showResult(result) {
  state.result = result;
  state.completed = true;
  state.running = false;
  elements.resultCard.hidden = false;
  elements.resultMode.textContent = result.mode.label;
  elements.resultExplanation.textContent = result.explanation;
  elements.resultRecommendation.textContent = result.recommendation;
  elements.resultConfidence.textContent = '单次随机种子 · 机制演示';
  elements.resultConfigHash.textContent = result.reproducibility.configHash;
  elements.resultScenarioHash.textContent = result.reproducibility.scenarioHash;
  elements.mode.textContent = result.mode.label.split('｜')[1] || result.mode.label;
  renderPerturbations();
  updateRunButtons();
  showToast('实验完成，结果解释已生成');
}

worker.addEventListener('message', event => {
  const message = event.data;
  if (message.runId !== state.runId) return;
  if (message.type === 'frame') {
    const frame = { data: message.data, ecm: message.ecm, meta: message.meta };
    state.currentFrame = frame;
    state.needsRender = true;
    if (state.started && !state.replay) {
      state.frames.push(frame);
      if (state.frames.length > 3600) state.frames.shift();
    }
    if (message.meta.perturbation) state.perturbation = message.meta.perturbation;
    updateCanvasLabels(message.meta.geometry?.labels);
    updateMetrics(message.meta);
    addEvents(message.events);
    renderPerturbations();
  } else if (message.type === 'result') {
    showResult(message.result);
  }
});

batchWorker.addEventListener('message', event => {
  const message = event.data || {};
  if (message.requestId !== state.batchRequestId) return;
  if (message.type === 'batch-progress') {
    const percent = Math.round((message.fraction || 0) * 100);
    elements.mapProgress.textContent = `正在运行多随机种子模拟：${message.completed}/${message.total} 个格点（${percent}%）`;
  } else if (message.type === 'batch-result') {
    state.batchRunning = false;
    $('#openMap').disabled = false;
    state.lastBatch = message;
    renderMap(message);
  } else if (message.type === 'batch-error') {
    state.batchRunning = false;
    $('#openMap').disabled = false;
    elements.mapProgress.textContent = `批量运行失败：${message.message}`;
  }
});

comparisonWorker.addEventListener('message', event => {
  const message = event.data || {};
  if (message.requestId !== state.comparisonRequestId) return;
  if (message.type === 'comparison-progress') {
    const percent = Math.round((message.fraction || 0) * 100);
    elements.comparisonProgress.textContent = `正在运行配对种子：${message.completed}/${message.total}（${percent}%）`;
  } else if (message.type === 'comparison-result') {
    state.comparisonRunning = false;
    state.lastComparison = message;
    $('#runComparison').disabled = false;
    renderComparisonResult(message);
  } else if (message.type === 'comparison-error') {
    state.comparisonRunning = false;
    $('#runComparison').disabled = false;
    elements.comparisonProgress.textContent = `对照实验失败：${message.message}`;
  }
});

function formatComparisonValue(key, value) {
  if (!Number.isFinite(value)) return '—';
  if (['passRate', 'integrity', 'degradedAreaRate', 'leaderFollowerRate', 'mobilityIndex'].includes(key)) return `${Math.round(value * 100)}%`;
  if (key === 'firstPassTime') return `${value.toFixed(1)} s`;
  return value.toFixed(3);
}

function comparisonMetricLabel(key) {
  return ({
    passRate: '通过率',
    firstPassTime: '观察窗内通过时间',
    integrity: '主体完整度',
    meanNuclearStrain: '平均核应变',
    degradedAreaRate: 'ECM 重塑面积',
    mobilityIndex: '迁移活性',
    leaderFollowerRate: 'Leader 路线一致度',
    tractionAsymmetry: '前后缘牵引不对称'
  })[key] || key;
}

function renderComparisonResult(message) {
  elements.comparisonProgress.textContent = `完成 ${message.seedCount} 组相同随机种子的配对模拟。`;
  const summary = document.createElement('article');
  const title = document.createElement('strong');
  const description = document.createElement('p');
  title.textContent = `${getScenario(message.scenarioId).name} · ${message.treatment.name}`;
  description.textContent = message.treatment.description;
  summary.append(title, description);
  elements.comparisonSummary.replaceChildren(summary);

  const preferred = message.scenarioId === 'leader-follower'
    ? ['leaderFollowerRate', 'passRate', 'firstPassTime', 'tractionAsymmetry']
    : message.scenarioId === 'budding'
      ? ['passRate', 'degradedAreaRate', 'integrity', 'meanNuclearStrain']
      : message.scenarioId === 'unjamming'
        ? ['mobilityIndex', 'passRate', 'meanNuclearStrain', 'degradedAreaRate']
        : ['passRate', 'firstPassTime', 'meanNuclearStrain', 'degradedAreaRate'];
  const keys = preferred.filter(key => message.metrics[key]).slice(0, 4);
  elements.comparisonMetrics.replaceChildren(...keys.map(key => {
    const metric = message.metrics[key];
    const article = document.createElement('article');
    const label = document.createElement('span');
    const values = document.createElement('strong');
    const delta = document.createElement('small');
    label.textContent = comparisonMetricLabel(key);
    values.textContent = `${formatComparisonValue(key, metric.control)} → ${formatComparisonValue(key, metric.treatment)}`;
    const sign = metric.difference > 0 ? '+' : '';
    const censoring = key === 'firstPassTime' && metric.censored
      ? `；未通过：对照 ${metric.censored.control}/${message.seedCount}、处理 ${metric.censored.treatment}/${message.seedCount}（按 ${metric.censored.observationWindow.toFixed(0)} s 观察窗计）`
      : '';
    delta.textContent = `处理−对照 ${sign}${formatComparisonValue(key, metric.difference)}；95% 探索性 t 区间 [${formatComparisonValue(key, metric.interval[0])}, ${formatComparisonValue(key, metric.interval[1])}]${censoring}`;
    article.append(label, values, delta);
    return article;
  }));
}

function requestComparison() {
  const treatmentId = elements.comparisonTreatment.value;
  if (!treatmentId) return;
  elements.comparisonDialog.showModal();
  if (state.comparisonRunning) return;
  state.comparisonRunning = true;
  state.comparisonRequestId += 1;
  $('#runComparison').disabled = true;
  elements.comparisonProgress.textContent = '正在准备五组配对模拟…';
  elements.comparisonSummary.replaceChildren();
  elements.comparisonMetrics.replaceChildren();
  comparisonWorker.postMessage({
    type: 'paired-comparison',
    requestId: state.comparisonRequestId,
    config: state.config,
    treatmentId,
    maxTime: Math.min(24, state.config.maxTime),
    cellCount: Math.min(54, state.config.cellCount)
  });
}

function updateCanvasLabels(labels = {}) {
  elements.canvasLabelLeft.textContent = labels.left || '细胞群';
  elements.canvasLabelObstacle.textContent = labels.obstacle || '组织边界';
  elements.canvasLabelSource.textContent = labels.source || '迁移偏置 →';
}

function draw(timestamp) {
  requestAnimationFrame(draw);
  let frame = state.currentFrame;
  if (state.replay) {
    if (!state.replay.last || timestamp - state.replay.last > 70) {
      state.replay.last = timestamp;
      state.replay.index = (state.replay.index + 1) % state.replay.frames.length;
      state.needsRender = true;
    }
    frame = state.replay.frames[state.replay.index];
  }
  if (!frame || !state.needsRender) return;
  renderFrame(frame, timestamp);
  state.needsRender = false;
}

function axesFromStrain(radius, strain) {
  const safe = clamp(strain, 0, 0.72);
  return {
    major: radius * Math.exp(safe),
    minor: radius * Math.exp(-safe)
  };
}

function traceEllipsePath(context, x, y, angle, major, minor, vertices = 18) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const points = [];
  for (let vertex = 0; vertex < vertices; vertex++) {
    const theta = vertex / vertices * Math.PI * 2;
    const localX = Math.cos(theta) * major;
    const localY = Math.sin(theta) * minor;
    points.push({
      x: x + localX * cosine - localY * sine,
      y: y + localX * sine + localY * cosine
    });
  }
  context.beginPath();
  const last = points.at(-1);
  context.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  context.closePath();
}


function drawECM(snapshot) {
  if (!snapshot?.packed) return;
  const { columns, rows, cellSize, packed } = snapshot;
  ctx.save();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const offset = (row * columns + column) * 4;
      const density = packed[offset] / 255;
      const damage = packed[offset + 1] / 255;
      if (density < 0.055 && damage < 0.03) continue;
      const x = column * cellSize;
      const y = row * cellSize;
      const alpha = clamp(density * 0.23, 0.015, 0.24);
      ctx.fillStyle = `rgba(${Math.round(76 + damage * 40)},${Math.round(111 + damage * 45)},${Math.round(108 + damage * 35)},${alpha})`;
      ctx.fillRect(x, y, cellSize + 0.5, cellSize + 0.5);
      if ((column + row) % 2 === 0 && density > 0.11) {
        const fiberX = packed[offset + 2] / 127.5 - 1;
        const fiberY = packed[offset + 3] / 127.5 - 1;
        const cx = x + cellSize / 2;
        const cy = y + cellSize / 2;
        const length = cellSize * (0.2 + density * 0.22);
        ctx.globalAlpha = clamp(0.04 + density * 0.17, 0.04, 0.22);
        ctx.strokeStyle = damage > 0.28 ? '#7fc2b7' : '#afc2bb';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(cx - fiberX * length, cy - fiberY * length);
        ctx.lineTo(cx + fiberX * length, cy + fiberY * length);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore();
}

function renderFrame(frame, timestamp) {
  const { data, meta } = frame;
  const width = elements.canvas.width;
  const height = elements.canvas.height;
  const geometry = meta.geometry || { obstacles: [], openings: [], targetPoints: [] };
  const stride = meta.stride || 9;
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#071419');
  background.addColorStop(0.55, '#091a20');
  background.addColorStop(1, '#061116');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  drawECM(frame.ecm);
  drawFlowField(geometry, timestamp, width, height);

  for (const opening of geometry.openings || []) {
    ctx.fillStyle = 'rgba(130,215,203,.065)';
    ctx.strokeStyle = 'rgba(130,215,203,.3)';
    ctx.fillRect(opening.x - opening.width / 2, opening.y - opening.height / 2, opening.width, opening.height);
    ctx.strokeRect(opening.x - opening.width / 2, opening.y - opening.height / 2, opening.width, opening.height);
  }

  for (const [obstacleIndex, obstacle] of (geometry.obstacles || []).entries()) {
    const gradient = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x + obstacle.width, obstacle.y + obstacle.height);
    if (obstacle.kind === 'matrix') {
      gradient.addColorStop(0, 'rgba(57,76,78,.78)');
      gradient.addColorStop(1, 'rgba(94,112,112,.46)');
    } else {
      gradient.addColorStop(0, 'rgba(77,100,106,.48)');
      gradient.addColorStop(0.5, 'rgba(139,159,163,.7)');
      gradient.addColorStop(1, 'rgba(65,85,91,.42)');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    ctx.save();
    ctx.globalAlpha = obstacle.kind === 'matrix' ? 0.18 : 0.1;
    ctx.strokeStyle = '#d3e1df';
    ctx.lineWidth = 0.65;
    const spacing = obstacle.kind === 'matrix' ? 16 : 10;
    for (let line = obstacle.y - obstacle.width; line < obstacle.y + obstacle.height + obstacle.width; line += spacing) {
      ctx.beginPath();
      ctx.moveTo(obstacle.x, line + obstacleIndex * 3);
      ctx.lineTo(obstacle.x + obstacle.width, line + obstacle.width * 0.35 + obstacleIndex * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  const cellCount = data.length / stride;
  for (let index = 0; index < cellCount; index++) {
    const offset = index * stride;
    const x = data[offset];
    const y = data[offset + 1];
    const vx = data[offset + 2];
    const vy = data[offset + 3];
    const pressure = data[offset + 4];
    const passed = data[offset + 5] > 0.5;
    const leader = data[offset + 6] > 0.5;
    const strain = data[offset + 7];
    const isolated = data[offset + 8] > 0.5;
    const cohort = stride > 9 ? data[offset + 9] > 0.5 : false;
    const shapeAngle = stride > 11 ? data[offset + 11] : Math.atan2(vy, vx);
    const nucleusStrain = stride > 12 ? data[offset + 12] : strain * 0.45;
    const contactCount = stride > 13 ? data[offset + 13] : 0;
    const stateCode = stride > 14 ? Math.round(data[offset + 14]) : 1;
    const traction = stride > 15 ? data[offset + 15] : 0;
    const ecmDensity = stride > 16 ? data[offset + 16] : 0;
    const ecmDamage = stride > 17 ? data[offset + 17] : 0;
    const leaderInfluence = stride > 18 ? data[offset + 18] : 0;
    const speed = Math.hypot(vx, vy) || 1;
    const cellAxes = axesFromStrain(meta.radius, strain);
    const nucleusAxes = axesFromStrain(meta.nucleusRadius || meta.radius * 0.54, nucleusStrain);

    if (pressure > 0.18) {
      const haloRadius = cellAxes.major + 4 + clamp(pressure * 2.2, 0, 8);
      const halo = ctx.createRadialGradient(x, y, cellAxes.minor * 0.45, x, y, haloRadius);
      halo.addColorStop(0, `rgba(235,176,103,${clamp(pressure * 0.08, 0.03, 0.22)})`);
      halo.addColorStop(1, 'rgba(235,176,103,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, haloRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = leader ? '#f0cf82' : passed ? '#82d7cb' : '#d1a4c8';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - vx / speed * Math.min(15, speed * 0.5), y - vy / speed * Math.min(15, speed * 0.5));
    ctx.stroke();
    ctx.restore();

    const stateFill = stateCode === 4 ? 'rgba(205,119,108,.78)' : stateCode === 0 ? 'rgba(116,128,142,.68)' : null;
    const fill = leader
      ? 'rgba(214,181,111,.78)'
      : stateFill
        ? stateFill
      : cohort
        ? 'rgba(187,128,191,.72)'
        : passed
          ? 'rgba(93,173,164,.72)'
          : 'rgba(169,105,157,.72)';
    const cortical = leader
      ? 'rgba(250,222,154,.9)'
      : stateCode === 4
        ? 'rgba(247,184,163,.82)'
        : stateCode === 3 && leaderInfluence > 0.18
          ? 'rgba(169,216,213,.72)'
      : cohort
        ? 'rgba(229,187,229,.68)'
        : passed
          ? 'rgba(178,231,223,.66)'
          : 'rgba(226,184,215,.62)';

    ctx.fillStyle = fill;
    ctx.strokeStyle = cortical;
    ctx.lineWidth = 1.05 + clamp(contactCount, 0, 6) * 0.05;
    traceEllipsePath(ctx, x, y, shapeAngle, cellAxes.major, cellAxes.minor);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = leader ? 'rgba(91,66,40,.75)' : 'rgba(54,39,61,.72)';
    ctx.strokeStyle = pressure > 0.65 ? 'rgba(245,193,121,.78)' : 'rgba(223,213,224,.35)';
    ctx.lineWidth = pressure > 0.65 ? 1.15 : 0.8;
    traceEllipsePath(ctx, x, y, shapeAngle, nucleusAxes.major, nucleusAxes.minor, 16);
    ctx.fill();
    ctx.stroke();

    if (isolated) {
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(255,219,161,.72)';
      ctx.lineWidth = 1;
      traceEllipsePath(ctx, x, y, shapeAngle, cellAxes.major + 3, cellAxes.minor + 3);
      ctx.stroke();
      ctx.restore();
    }
    if (ecmDensity > 0.15 && ecmDamage > 0.05) {
      ctx.save();
      ctx.globalAlpha = clamp(ecmDamage * 0.55, 0.04, 0.35);
      ctx.strokeStyle = '#8ed3c6';
      ctx.lineWidth = 0.8 + traction * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, cellAxes.major + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (leader) {
      const direction = Math.atan2(vy, vx);
      ctx.save();
      ctx.strokeStyle = 'rgba(248,218,139,.76)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(direction) * cellAxes.major * 0.55, y + Math.sin(direction) * cellAxes.major * 0.55);
      ctx.lineTo(x + Math.cos(direction) * (cellAxes.major + 6), y + Math.sin(direction) * (cellAxes.major + 6));
      ctx.stroke();
      ctx.restore();
    }

    if (index === state.hoveredCell) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      traceEllipsePath(ctx, x, y, shapeAngle, cellAxes.major + 5, cellAxes.minor + 5);
      ctx.stroke();
    }
  }
}

function drawFlowField(geometry, timestamp, width, height) {
  const arrows = geometry.guidanceArrows || [];
  ctx.save();
  ctx.lineWidth = 0.8;
  for (const arrow of arrows) {
    const pulse = 0.82 + Math.sin(timestamp * 0.0015 + arrow.x * 0.018 + arrow.y * 0.011) * 0.12;
    const length = 7 + clamp(arrow.concentration, 0, 1) * 7;
    const endX = arrow.x + arrow.dx * length * pulse;
    const endY = arrow.y + arrow.dy * length * pulse;
    ctx.globalAlpha = 0.035 + clamp(arrow.concentration, 0, 1) * 0.11;
    ctx.strokeStyle = '#87cec5';
    ctx.beginPath();
    ctx.moveTo(arrow.x, arrow.y);
    ctx.lineTo(endX, endY);
    ctx.lineTo(endX - arrow.dx * 3.1 + arrow.dy * 2.1, endY - arrow.dy * 3.1 - arrow.dx * 2.1);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - arrow.dx * 3.1 - arrow.dy * 2.1, endY - arrow.dy * 3.1 + arrow.dx * 2.1);
    ctx.stroke();
  }
  if (!arrows.length) {
    const targets = geometry.targetPoints || [[width - 80, height / 2]];
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#87cec5';
    for (const target of targets) {
      ctx.beginPath();
      ctx.moveTo(width * 0.55, height / 2);
      ctx.lineTo(target[0], target[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function pointerToWorld(event) {
  const rectangle = elements.canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rectangle.left) / rectangle.width * elements.canvas.width,
    y: (event.clientY - rectangle.top) / rectangle.height * elements.canvas.height,
    localX: event.clientX - rectangle.left,
    localY: event.clientY - rectangle.top
  };
}

function updateHover(event) {
  const frame = state.replay ? state.replay.frames[state.replay.index] : state.currentFrame;
  if (!frame) return;
  const point = pointerToWorld(event);
  const stride = frame.meta.stride || 9;
  let closest = -1;
  let bestDistance = 18;
  for (let index = 0; index < frame.data.length / stride; index++) {
    const offset = index * stride;
    const distance = Math.hypot(frame.data[offset] - point.x, frame.data[offset + 1] - point.y);
    if (distance < bestDistance) {
      closest = index;
      bestDistance = distance;
    }
  }
  state.hoveredCell = closest;
  if (closest < 0) {
    elements.hoverTip.hidden = true;
  } else {
    const offset = closest * stride;
    const pressure = frame.data[offset + 4];
    const passed = frame.data[offset + 5] > 0.5;
    const leader = frame.data[offset + 6] > 0.5;
    const strain = frame.data[offset + 7] || 0;
    const isolated = frame.data[offset + 8] > 0.5;
    const nucleusStrain = stride > 12 ? frame.data[offset + 12] : 0;
    const contactCount = stride > 13 ? frame.data[offset + 13] : 0;
    const stateCode = stride > 14 ? Math.round(frame.data[offset + 14]) : 1;
    const ecmDensity = stride > 16 ? frame.data[offset + 16] : 0;
    const ecmDamage = stride > 17 ? frame.data[offset + 17] : 0;
    const leaderInfluence = stride > 18 ? frame.data[offset + 18] : 0;
    const strainDuration = stride > 19 ? frame.data[offset + 19] : 0;
    const stateLabels = ['暂时停滞', '迁移型', 'Leader', 'Follower', '应激型'];
    const aspectRatio = Math.exp(strain * 2);
    elements.hoverTip.textContent = `${leader ? 'Leader 细胞' : isolated ? '相对孤立细胞' : '群体细胞'}；状态：${stateLabels[stateCode] || '迁移型'}；${passed ? '已越过判定边界' : '仍在主体一侧'}；形状长宽比 ${aspectRatio.toFixed(2)}；核应变 ${nucleusStrain.toFixed(2)}（累计 ${strainDuration.toFixed(1)} s）；接触数 ${Math.round(contactCount)}；ECM 密度 ${ecmDensity.toFixed(2)}、损伤 ${ecmDamage.toFixed(2)}；Leader 影响 ${Math.round(leaderInfluence * 100)}%。`;
    elements.hoverTip.style.left = `${clamp(point.localX + 14, 8, elements.canvasWrap.clientWidth - 250)}px`;
    elements.hoverTip.style.top = `${clamp(point.localY + 14, 8, elements.canvasWrap.clientHeight - 80)}px`;
    elements.hoverTip.hidden = false;
  }
  state.needsRender = true;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPayload() {
  return {
    schemaVersion: 4,
    app: { name: 'Invasion Wind Tunnel', version: APP_VERSION, modelVersion: MODEL_VERSION },
    config: state.config,
    result: state.result,
    events: state.events,
    lastBatch: state.lastBatch,
    lastComparison: state.lastComparison,
    savedAt: new Date().toISOString(),
    scientificScope: 'Mechanism exploration and education only; not for clinical prediction.'
  };
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2400);
}

function shareUrl() {
  const query = new URLSearchParams({
    q: state.config.scenarioId,
    p: state.config.presetId,
    a: state.config.adhesion.toFixed(2),
    d: state.config.deformability.toFixed(2),
    l: state.config.alignment.toFixed(2),
    r: state.config.persistence.toFixed(2),
    z: state.config.noise.toFixed(2),
    v: state.config.speed.toFixed(1),
    h: state.config.leaderMode ? '1' : '0',
    g: String(Math.round(state.config.gapWidth)),
    s: String(state.config.seed),
    n: String(state.config.cellCount),
    t: String(state.config.maxTime)
  });
  return `${location.origin}${location.pathname}?${query}`;
}

async function copyText(text, success) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    showToast(success);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    showToast(copied ? success : '浏览器未允许剪贴板访问');
  }
}

function requestMap() {
  elements.mapDialog.showModal();
  if (state.batchRunning) {
    elements.mapProgress.textContent = '批量模拟仍在运行，请保持此窗口打开…';
    return;
  }
  elements.mapProgress.textContent = '正在准备批量模拟…';
  elements.invasionMap.replaceChildren(createEmptyState('地图将在批量模拟完成后显示。'));
  elements.mapLegend.replaceChildren();
  const size = 5;
  const seedCount = 3;
  elements.mapSubtitle.textContent = `${scenario().name}：横轴为细胞连接，纵轴为细胞柔顺性；${size}×${size} 格，每格运行 ${seedCount} 个随机种子。`;
  state.batchRunning = true;
  state.batchRequestId += 1;
  $('#openMap').disabled = true;
  batchWorker.postMessage({
    type: 'batch-scan',
    requestId: state.batchRequestId,
    config: state.config,
    size,
    seedCount,
    maxTime: Math.min(16, state.config.maxTime),
    cellCount: Math.min(44, state.config.cellCount)
  });
}

function renderMap(message) {
  const labels = {};
  const mapScenario = getScenario(message.scenarioId);
  elements.mapSubtitle.textContent = `${mapScenario.name}：横轴为细胞连接，纵轴为细胞柔顺性；${message.size}×${message.size} 格，每格运行 ${message.seedCount} 个随机种子。`;
  for (const point of message.points) labels[point.mode] = phaseLabel(point.mode).split('｜')[1] || point.mode;
  elements.mapLegend.replaceChildren(...Object.entries(labels).map(([id, label]) => {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.dataset.phase = id;
    item.append(swatch, document.createTextNode(label));
    return item;
  }));
  elements.mapProgress.textContent = `完成 ${message.size ** 2 * message.seedCount} 次模拟。格点百分比表示随机种子一致度。`;
  elements.invasionMap.style.gridTemplateColumns = `repeat(${message.size}, 1fr)`;
  elements.invasionMap.replaceChildren(...message.points.slice().sort((a, b) => b.y - a.y || a.x - b.x).map(point => {
    const button = document.createElement('button');
    const label = document.createElement('span');
    const consensus = document.createElement('small');
    const modeText = phaseLabel(point.mode).split('｜')[1] || point.mode;
    button.type = 'button';
    button.className = 'map-cell';
    button.dataset.phase = point.mode;
    button.title = `连接 ${point.adhesion.toFixed(2)} · 柔顺性 ${point.deformability.toFixed(2)} · ${modeText} · 一致度 ${Math.round(point.consensus * 100)}%`;
    label.textContent = modeText;
    consensus.textContent = `${Math.round(point.consensus * 100)}%`;
    button.append(label, consensus);
    button.addEventListener('click', () => {
      state.config = makeConfig({
        ...(message.baseConfig || state.config),
        scenarioId: message.scenarioId,
        adhesion: point.adhesion,
        deformability: point.deformability,
        presetId: 'custom'
      });
      setMode('explore');
      renderAllControls();
      resetExperiment();
      elements.mapDialog.close();
      showToast(`已载入地图格点：${modeText}`);
    });
    return button;
  }));
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

$$('.mode-tab').forEach(button => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const tabs = $$('.mode-tab');
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(tabs.indexOf(button) + offset + tabs.length) % tabs.length];
    setMode(next.dataset.mode);
    next.focus();
  });
});

elements.start.addEventListener('click', startOrPause);
elements.playPause.addEventListener('click', startOrPause);
elements.reset.addEventListener('click', resetExperiment);
elements.step.addEventListener('click', stepOnce);
elements.speed.addEventListener('change', () => worker.postMessage({ type: 'speed', runId: state.runId, speed: Number(elements.speed.value) }));
elements.gapRange.addEventListener('input', () => { elements.gapOutput.textContent = `${elements.gapRange.value} px`; });
elements.gapRange.addEventListener('change', () => updateConfig('gapWidth', Number(elements.gapRange.value)));
elements.seedInput.addEventListener('change', () => updateConfig('seed', Number(elements.seedInput.value)));
elements.cellCountInput.addEventListener('change', () => updateConfig('cellCount', Number(elements.cellCountInput.value)));
elements.durationInput.addEventListener('change', () => updateConfig('maxTime', Number(elements.durationInput.value)));
$$('.segmented').forEach(group => $$('button', group).forEach(button => button.addEventListener('click', () => updateConfig(group.dataset.control, Number(button.dataset.value)))));
elements.canvasWrap.addEventListener('pointermove', updateHover);
elements.canvasWrap.addEventListener('pointerleave', () => {
  state.hoveredCell = -1;
  elements.hoverTip.hidden = true;
  state.needsRender = true;
});

$('#openScience').addEventListener('click', () => elements.scienceDialog.showModal());
$('#openKeyboard').addEventListener('click', () => elements.keyboardDialog.showModal());
$('#openMap').addEventListener('click', requestMap);
$('#runComparison').addEventListener('click', requestComparison);
$('#copyConfig').addEventListener('click', () => copyText(JSON.stringify(state.config, null, 2), '参数 JSON 已复制'));
$('#saveLocal').addEventListener('click', () => {
  try {
    localStorage.setItem('iwt-project-v4', JSON.stringify(exportPayload()));
    showToast('项目已保存到本地浏览器');
  } catch {
    showToast('浏览器未允许本地保存，或存储空间不足');
  }
});
$('#loadLocal').addEventListener('click', () => {
  try {
    const raw = localStorage.getItem('iwt-project-v4') || localStorage.getItem('iwt-project-v3') || localStorage.getItem('iwt-project-v2') || localStorage.getItem('iwt-project-v1');
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved?.config) throw new Error('invalid project');
    state.config = migrateConfig(saved.config);
    renderAllControls();
    resetExperiment();
    showToast(saved.schemaVersion === 4 ? '已载入 v4 项目' : '已迁移并载入旧版项目设置');
  } catch {
    showToast('没有找到可载入的有效项目');
  }
});
$('#shareLink').addEventListener('click', () => copyText(shareUrl(), '分享链接已复制'));
$('#exportJson').addEventListener('click', () => downloadBlob(
  new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' }),
  `invasion-wind-tunnel-v${APP_VERSION}-${Date.now()}.json`
));
$('#exportCsv').addEventListener('click', () => {
  const metrics = state.result?.metrics || state.currentFrame?.meta.metrics || {};
  const rows = [
    ['field', 'value'],
    ['scenario_id', state.config.scenarioId],
    ['preset_id', state.config.presetId],
    ['seed', state.config.seed],
    ['config_hash', state.config.configHash],
    ['scenario_hash', state.config.scenarioHash],
    ...Object.entries(metrics).map(([key, value]) => [key, value]),
    ['mode', state.result?.mode.id ?? 'in-progress']
  ];
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `invasion-metrics-v${APP_VERSION}-${Date.now()}.csv`);
});
$('#exportPng').addEventListener('click', () => elements.canvas.toBlob(blob => {
  if (blob) downloadBlob(blob, `invasion-frame-v${APP_VERSION}-${Date.now()}.png`);
}, 'image/png'));

worker.addEventListener('error', () => {
  state.running = false;
  elements.status.textContent = '模拟线程加载失败，请刷新页面后重试';
  elements.observation.textContent = '浏览器未能启动模拟线程。请确认页面通过 HTTPS 或本地服务器打开。';
  elements.start.disabled = true;
  elements.playPause.disabled = true;
  elements.step.disabled = true;
  showToast('模拟线程启动失败');
});
worker.addEventListener('messageerror', () => showToast('模拟数据传输失败，请重置实验'));

comparisonWorker.addEventListener('error', () => {
  state.comparisonRunning = false;
  $('#runComparison').disabled = false;
  elements.comparisonProgress.textContent = '配对实验线程加载失败，请刷新页面后重试。';
  showToast('配对实验线程启动失败');
});
comparisonWorker.addEventListener('messageerror', () => {
  state.comparisonRunning = false;
  $('#runComparison').disabled = false;
  elements.comparisonProgress.textContent = '配对实验数据传输失败，请重新运行。';
});

batchWorker.addEventListener('error', () => {
  state.batchRunning = false;
  $('#openMap').disabled = false;
  elements.mapProgress.textContent = '批量模拟线程加载失败，请刷新页面后重试。';
  showToast('批量模拟线程启动失败');
});
batchWorker.addEventListener('messageerror', () => {
  state.batchRunning = false;
  $('#openMap').disabled = false;
  elements.mapProgress.textContent = '批量模拟数据传输失败，请重新运行。';
});

function blocksGlobalShortcut(event) {
  if (event.defaultPrevented || event.repeat || document.querySelector('dialog[open]')) return true;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, summary, [contenteditable="true"], [role="button"], [role="radio"], [role="tab"]'));
}

window.addEventListener('keydown', event => {
  if (blocksGlobalShortcut(event)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    startOrPause();
  }
  if (event.key.toLowerCase() === 'r') resetExperiment();
  if (event.key === 'ArrowRight') stepOnce();
  if (event.key === 'Escape' && state.replay) stopReplay();
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.installPrompt = event;
  $('#installApp').hidden = false;
});
$('#installApp').addEventListener('click', async () => {
  if (!state.installPrompt) return;
  await state.installPrompt.prompt();
  state.installPrompt = null;
  $('#installApp').hidden = true;
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker registration failed:', error)));
}

renderAllControls();
setMode('play');
initWorker();
requestAnimationFrame(draw);

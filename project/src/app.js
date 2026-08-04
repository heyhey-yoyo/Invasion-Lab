import {
  APP_VERSION,
  MODEL_VERSION,
  PRESETS,
  SCENARIOS,
  classifyOutcome,
  getScenario,
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
  mapSizeInput: $('#mapSizeInput'),
  mapSeedsInput: $('#mapSeedsInput'),
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
  toast: $('#toast')
};

const ctx = elements.canvas.getContext('2d', { alpha: false });
const worker = new Worker('./simulation/worker.js', { type: 'module' });
const batchWorker = new Worker('./simulation/batch-worker.js', { type: 'module' });

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
  batchRunning: false
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
      worker.postMessage({ type: 'perturb', perturbation: item.type });
      for (const action of $$('button', elements.perturbActions)) action.disabled = true;
      showToast(`已施加：${item.label}`);
    });
    return button;
  }));
}

function renderAllControls() {
  renderScenarios();
  renderPresets();
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
  elements.modelBadge.textContent = `Model ${MODEL_VERSION.replace('iwtx-modular-agent-', '')}`;
  elements.configHash.textContent = state.config.configHash;
  elements.scenarioHash.textContent = state.config.scenarioHash;
  elements.timeMax.textContent = formatTime(state.config.maxTime, false);
  [elements.firstLabel, elements.passLabel, elements.integrityLabel, elements.modeLabel]
    .forEach((label, index) => { label.textContent = item.metricLabels[index]; });
  $$('.segmented').forEach(group => {
    const key = group.dataset.control;
    $$('button', group).forEach(button => {
      const value = Number(button.dataset.value);
      const active = Math.abs(value - state.config[key]) < 0.2;
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
  worker.postMessage({ type: 'init', config: state.config });
}

function resetExperiment() {
  worker.postMessage({ type: 'pause' });
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
  worker.postMessage({ type: state.running ? 'start' : 'pause', speed: Number(elements.speed.value) });
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
  worker.postMessage({ type: 'step' });
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
  elements.status.textContent = meta.status;
  elements.limiting.textContent = limitingFactor(meta);
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
    if (state.config.deformability < 0.35) return '形变能力';
    return '密度—通道耦合';
  }
  if (state.config.scenarioId === 'budding') {
    if (state.config.adhesion > 0.75) return '边缘黏附';
    if (metrics.budCount > 0) return '小芽持续性';
    return 'ECM 开口';
  }
  if (state.config.deformability < 0.35) return '形变能力';
  if (state.config.gapWidth < 34) return '缺口几何';
  if (state.config.adhesion > 0.78 && metrics.passRate < 0.15) return '团块拥堵';
  if (state.config.adhesion < 0.3) return '细胞连接';
  if (state.config.alignment < 0.3) return '方向协同';
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
  worker.postMessage({ type: 'pause' });
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
  if (message.type === 'frame') {
    const frame = { data: message.data, meta: message.meta };
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

  drawFlowField(geometry, timestamp, width, height);

  for (const opening of geometry.openings || []) {
    ctx.fillStyle = 'rgba(130,215,203,.1)';
    ctx.strokeStyle = 'rgba(130,215,203,.42)';
    ctx.fillRect(opening.x - opening.width / 2, opening.y - opening.height / 2, opening.width, opening.height);
    ctx.strokeRect(opening.x - opening.width / 2, opening.y - opening.height / 2, opening.width, opening.height);
  }

  for (const obstacle of geometry.obstacles || []) {
    const gradient = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x + obstacle.width, obstacle.y + obstacle.height);
    if (obstacle.kind === 'matrix') {
      gradient.addColorStop(0, 'rgba(59,79,83,.68)');
      gradient.addColorStop(1, 'rgba(104,122,124,.36)');
    } else {
      gradient.addColorStop(0, 'rgba(89,112,120,.36)');
      gradient.addColorStop(0.5, 'rgba(166,188,192,.68)');
      gradient.addColorStop(1, 'rgba(71,91,99,.32)');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
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
    const stretch = data[offset + 7];
    const isolated = data[offset + 8] > 0.5;
    const cohort = stride > 9 ? data[offset + 9] > 0.5 : false;
    const speed = Math.hypot(vx, vy) || 1;
    const angle = Math.atan2(vy, vx);
    const radiusX = meta.radius * (1 + stretch * 0.6);
    const radiusY = meta.radius * (1 - stretch * 0.28);

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = leader ? '#f2c978' : cohort ? '#d0a5db' : passed ? '#82d7cb' : '#d1a4c8';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - vx / speed * Math.min(18, speed * 0.65), y - vy / speed * Math.min(18, speed * 0.65));
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const fill = ctx.createRadialGradient(-2, -2, 1, 0, 0, radiusX);
    fill.addColorStop(0, leader ? 'rgba(245,217,154,.92)' : cohort ? 'rgba(215,164,220,.82)' : passed ? 'rgba(130,215,203,.82)' : 'rgba(202,145,192,.8)');
    fill.addColorStop(1, leader ? 'rgba(143,112,55,.55)' : cohort ? 'rgba(100,55,108,.48)' : passed ? 'rgba(39,101,99,.5)' : 'rgba(92,45,82,.5)');
    ctx.fillStyle = fill;
    ctx.strokeStyle = pressure > 0.7 ? `rgba(255,205,135,${clamp(0.35 + pressure * 0.12, 0.35, 0.95)})` : 'rgba(225,225,222,.38)';
    ctx.lineWidth = pressure > 0.7 ? 1.8 : 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (isolated) {
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(255,219,161,.72)';
      ctx.stroke();
    }
    if (leader) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(248,218,139,.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, radiusX + 4, radiusY + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (index === state.hoveredCell) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radiusX + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawFlowField(geometry, timestamp, width, height) {
  const targets = geometry.targetPoints || [[width - 80, height / 2]];
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#87cec5';
  ctx.lineWidth = 1;
  for (let y = 35; y < height; y += 42) {
    const target = targets.reduce((best, current) => Math.abs(current[1] - y) < Math.abs(best[1] - y) ? current : best, targets[0]);
    ctx.beginPath();
    for (let x = Math.max(10, geometry.barrierX || 500); x < width; x += 18) {
      const slope = (target[1] - y) / Math.max(1, target[0] - x);
      const wave = Math.sin((x + y + timestamp * 0.018) * 0.018) * 2;
      const pointY = y + slope * (x - (geometry.barrierX || 500)) * 0.18 + wave;
      if (x === Math.max(10, geometry.barrierX || 500)) ctx.moveTo(x, pointY);
      else ctx.lineTo(x, pointY);
    }
    ctx.stroke();
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
    const isolated = frame.data[offset + 8] > 0.5;
    elements.hoverTip.textContent = `${leader ? 'Leader 细胞' : isolated ? '相对孤立细胞' : '群体细胞'}；${passed ? '已到达判定边界外侧' : '仍在主体一侧'}；局部压力 ${pressure.toFixed(2)}。`;
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
    schemaVersion: 2,
    app: { name: 'Invasion Wind Tunnel', version: APP_VERSION, modelVersion: MODEL_VERSION },
    config: state.config,
    result: state.result,
    events: state.events,
    lastBatch: state.lastBatch,
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
  const size = clamp(Number(elements.mapSizeInput.value) || 5, 3, 7);
  const seedCount = clamp(Number(elements.mapSeedsInput.value) || 3, 2, 5);
  elements.mapSubtitle.textContent = `${scenario().name}：横轴为黏附，纵轴为形变；${size}×${size} 格，每格运行 ${seedCount} 个随机种子。`;
  state.batchRunning = true;
  $('#openMap').disabled = true;
  batchWorker.postMessage({
    type: 'batch-scan',
    config: state.config,
    size,
    seedCount,
    maxTime: Math.min(16, state.config.maxTime),
    cellCount: Math.min(44, state.config.cellCount)
  });
}

function renderMap(message) {
  const labels = {};
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
    button.title = `黏附 ${point.adhesion.toFixed(2)} · 形变 ${point.deformability.toFixed(2)} · ${modeText} · 一致度 ${Math.round(point.consensus * 100)}%`;
    label.textContent = modeText;
    consensus.textContent = `${Math.round(point.consensus * 100)}%`;
    button.append(label, consensus);
    button.addEventListener('click', () => {
      state.config = makeConfig({
        ...state.config,
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
elements.speed.addEventListener('change', () => worker.postMessage({ type: 'speed', speed: Number(elements.speed.value) }));
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
$('#copyConfig').addEventListener('click', () => copyText(JSON.stringify(state.config, null, 2), '参数 JSON 已复制'));
$('#saveLocal').addEventListener('click', () => {
  try {
    localStorage.setItem('iwt-project-v2', JSON.stringify(exportPayload()));
    showToast('项目已保存到本地浏览器');
  } catch {
    showToast('浏览器未允许本地保存，或存储空间不足');
  }
});
$('#loadLocal').addEventListener('click', () => {
  try {
    const raw = localStorage.getItem('iwt-project-v2') || localStorage.getItem('iwt-project-v1');
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved?.config) throw new Error('invalid project');
    state.config = migrateConfig(saved.config);
    renderAllControls();
    resetExperiment();
    showToast(saved.schemaVersion === 2 ? '已载入保存的项目' : '已迁移并载入 v1 项目设置');
  } catch {
    showToast('没有找到可载入的有效项目');
  }
});
$('#shareLink').addEventListener('click', () => copyText(shareUrl(), '分享链接已复制'));
$('#exportJson').addEventListener('click', () => downloadBlob(
  new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' }),
  `invasion-wind-tunnel-v2-${Date.now()}.json`
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
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `invasion-metrics-v2-${Date.now()}.csv`);
});
$('#exportPng').addEventListener('click', () => elements.canvas.toBlob(blob => {
  if (blob) downloadBlob(blob, `invasion-frame-v2-${Date.now()}.png`);
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

window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
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

import { makeConfig } from './config.js';
import { connectedComponents } from './core/components.js';
import { RNG } from './core/rng.js';
import { classifyOutcome, explainOutcome, recommendControl } from './outcomes.js';
import { buildGeometry, getScenario } from './scenarios/catalog.js';
import { RESULT_SCHEMA_VERSION } from './versions.js';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const vectorLength = (x, y) => Math.hypot(x, y) || 1;

function normalized(x, y) {
  const magnitude = vectorLength(x, y);
  return [x / magnitude, y / magnitude];
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
}

function circleRectContact(cell, radius, rectangle) {
  const left = rectangle.x;
  const right = rectangle.x + rectangle.width;
  const top = rectangle.y;
  const bottom = rectangle.y + rectangle.height;
  const nearestX = clamp(cell.x, left, right);
  const nearestY = clamp(cell.y, top, bottom);
  let dx = cell.x - nearestX;
  let dy = cell.y - nearestY;
  let distance = Math.hypot(dx, dy);

  if (distance === 0) {
    const distances = [
      { value: Math.abs(cell.x - left), x: -1, y: 0 },
      { value: Math.abs(right - cell.x), x: 1, y: 0 },
      { value: Math.abs(cell.y - top), x: 0, y: -1 },
      { value: Math.abs(bottom - cell.y), x: 0, y: 1 }
    ].sort((a, b) => a.value - b.value);
    dx = distances[0].x;
    dy = distances[0].y;
    distance = 0;
  } else {
    dx /= distance;
    dy /= distance;
  }

  const overlap = radius - distance;
  return overlap > 0 ? { nx: dx, ny: dy, overlap } : null;
}

export class SimulationEngine {
  constructor(inputConfig = {}) {
    this.config = makeConfig(inputConfig);
    this.scenario = getScenario(this.config.scenarioId);
    this.width = 960;
    this.height = 540;
    this.radius = 8.8;
    this.rng = new RNG(this.config.seed);
    this.time = 0;
    this.stepCount = 0;
    this.events = [];
    this.eventFlags = new Set();
    this.perturbation = null;
    this.finished = false;
    this.jammed = false;
    this.unjammed = false;
    this.baselineMobility = null;
    this.runtime = {
      gapWidth: this.config.gapWidth,
      channelRelease: 0,
      adhesionFactor: 1,
      edgeAdhesionFactor: 1,
      deformabilityFactor: 1,
      alignmentFactor: 1,
      edgeMotilityFactor: 1,
      pushFactor: 1,
      effectUntil: 0,
      leaderRoute: 0,
      leaderRemovedAt: null
    };
    this.geometry = buildGeometry(this.scenario, this.config, this.runtime);
    this.cells = this.#createCells();
    this.lastMetrics = this.getMetrics();
  }

  #createCells() {
    const cells = [];
    const count = this.config.cellCount;
    const columns = Math.ceil(Math.sqrt(count * 1.5));
    const densityScale = this.scenario.initialDensity || 1;
    const spacingX = 16.2 / densityScale;
    const spacingY = 14.2 / densityScale;
    const rows = Math.ceil(count / columns);
    const [centerX, centerY] = this.scenario.initialCenter;
    const originX = centerX - (columns * spacingX) / 2;
    const originY = centerY - (rows * spacingY) / 2;
    const leaderIndex = Math.min(count - 1, Math.floor(rows / 2) * columns + columns - 1);

    for (let index = 0; index < count; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const angle = this.rng.next() * TAU;
      const isBuddingEdge = this.scenario.id === 'budding'
        && column >= columns - 2
        && row >= 1
        && row <= Math.min(rows - 2, 4);
      const isLeader = this.scenario.id === 'leader-follower'
        ? index === leaderIndex
        : this.config.leaderMode && index === leaderIndex;
      const branch = isLeader ? this.runtime.leaderRoute : row < rows / 2 ? 0 : 1;

      cells.push({
        id: index,
        x: originX + column * spacingX + (row % 2) * spacingX * 0.5 + this.rng.signed() * 2.1,
        y: originY + row * spacingY + this.rng.signed() * 2.1,
        vx: Math.cos(angle) * 0.5,
        vy: Math.sin(angle) * 0.5,
        dirX: 1,
        dirY: 0,
        pressure: 0,
        passed: false,
        isLeader,
        cohort: isBuddingEdge ? 1 : 0,
        branch,
        motility: 1 + this.rng.signed() * this.config.noise * 1.35,
        lateralBias: this.rng.signed() * this.config.noise * 0.55,
        stretch: 0,
        neighborCount: 0,
        isolated: false
      });
    }
    return cells;
  }

  applyPerturbation(type) {
    if (this.perturbation || this.finished) return false;
    const duration = 9;
    const actions = {
      widen: { label: '扩大缺口', apply: () => { this.runtime.gapWidth = Math.min(140, this.runtime.gapWidth + 22); } },
      loosen: { label: '暂时降低黏附', apply: () => { this.runtime.adhesionFactor = 0.38; this.runtime.effectUntil = this.time + duration; } },
      soften: { label: '提高形变能力', apply: () => { this.runtime.deformabilityFactor = 1.45; this.runtime.effectUntil = this.time + duration; } },
      'open-ecm': { label: '打开 ECM', apply: () => { this.runtime.gapWidth = Math.min(140, this.runtime.gapWidth + 26); } },
      'edge-loosen': { label: '松动边缘', apply: () => { this.runtime.edgeAdhesionFactor = 0.22; this.runtime.effectUntil = this.time + duration; } },
      'boost-edge': { label: '增强边缘运动', apply: () => { this.runtime.edgeMotilityFactor = 1.65; this.runtime.effectUntil = this.time + duration; } },
      'remove-leader': { label: '移除 leader', apply: () => {
        for (const cell of this.cells) cell.isLeader = false;
        this.runtime.leaderRemovedAt = this.time;
        this.#event('leader-lost', 'leader 被移除');
      } },
      'switch-leader': { label: '切换路线', apply: () => {
        this.runtime.leaderRoute = this.runtime.leaderRoute === 0 ? 1 : 0;
        for (const cell of this.cells) if (cell.isLeader) cell.branch = this.runtime.leaderRoute;
      } },
      align: { label: '增强跟随', apply: () => { this.runtime.alignmentFactor = 1.35; this.runtime.effectUntil = this.time + duration; } },
      release: { label: '局部松动', apply: () => { this.runtime.channelRelease = 60; } },
      pulse: { label: '施加推动', apply: () => { this.runtime.pushFactor = 1.55; this.runtime.effectUntil = this.time + 5; } }
    };
    const action = actions[type];
    if (!action) return false;
    action.apply();
    this.geometry = buildGeometry(this.scenario, this.config, this.runtime);
    this.perturbation = { type, label: action.label, time: this.time };
    this.#event('perturbation', action.label);
    return true;
  }

  step(dt = 1 / 30) {
    if (this.finished) return;
    const requestedDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 30;
    dt = Math.min(requestedDt, Math.max(0, this.config.maxTime - this.time));
    if (dt <= 0) {
      this.finished = true;
      this.#event('finished', '实验完成');
      return;
    }

    this.time += dt;
    this.stepCount += 1;
    this.#updateTemporaryEffects();
    this.#maybeReplaceLeader();

    const count = this.cells.length;
    const forceX = new Float32Array(count);
    const forceY = new Float32Array(count);
    const neighborVX = new Float32Array(count);
    const neighborVY = new Float32Array(count);
    const centerX = new Float32Array(count);
    const centerY = new Float32Array(count);
    const neighborCounts = new Uint16Array(count);
    const adhesion = this.config.adhesion * this.runtime.adhesionFactor;
    const deformability = clamp(this.config.deformability * this.runtime.deformabilityFactor, 0.05, 1);
    const alignment = clamp(this.config.alignment * this.runtime.alignmentFactor, 0, 1.2);
    const neighborRadius = 31;
    const minimumDistance = this.radius * 1.72;

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = this.cells[i];
        const b = this.cells[j];
        const deltaX = b.x - a.x;
        const deltaY = b.y - a.y;
        const distance = vectorLength(deltaX, deltaY);
        if (distance >= neighborRadius) continue;

        neighborCounts[i] += 1;
        neighborCounts[j] += 1;
        neighborVX[i] += b.vx;
        neighborVY[i] += b.vy;
        neighborVX[j] += a.vx;
        neighborVY[j] += a.vy;
        centerX[i] += b.x;
        centerY[i] += b.y;
        centerX[j] += a.x;
        centerY[j] += a.y;

        if (distance < minimumDistance) {
          const overlap = minimumDistance - distance;
          const push = overlap * 4.8;
          const nx = deltaX / distance;
          const ny = deltaY / distance;
          forceX[i] -= nx * push;
          forceY[i] -= ny * push;
          forceX[j] += nx * push;
          forceY[j] += ny * push;
          a.pressure += overlap * 0.04;
          b.pressure += overlap * 0.04;
        } else if (distance < 25 && adhesion > 0.05) {
          let groupCoupling = a.cohort === b.cohort ? 1 : 0.28;
          if (this.scenario.id === 'budding' && (a.cohort || b.cohort)) groupCoupling *= this.runtime.edgeAdhesionFactor;
          const pull = adhesion * groupCoupling * (distance - minimumDistance) * 0.22;
          const nx = deltaX / distance;
          const ny = deltaY / distance;
          forceX[i] += nx * pull;
          forceY[i] += ny * pull;
          forceX[j] -= nx * pull;
          forceY[j] -= ny * pull;
        }
      }
    }

    const leaders = this.cells.filter(cell => cell.isLeader);
    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      cell.pressure *= 0.78;
      cell.neighborCount = neighborCounts[index];
      cell.isolated = neighborCounts[index] <= 1;

      const [persistenceX, persistenceY] = normalized(cell.vx, cell.vy);
      const [alignmentX, alignmentY] = neighborCounts[index]
        ? normalized(neighborVX[index] / neighborCounts[index], neighborVY[index] / neighborCounts[index])
        : [persistenceX, persistenceY];
      const [cohesionX, cohesionY] = neighborCounts[index]
        ? normalized(centerX[index] / neighborCounts[index] - cell.x, centerY[index] / neighborCounts[index] - cell.y)
        : [0, 0];
      const [targetX, targetY] = this.#targetFor(cell, leaders);
      const [chemotaxisX, chemotaxisY] = normalized(targetX - cell.x, targetY - cell.y);
      const noiseAngle = this.rng.next() * TAU;

      let desiredX = chemotaxisX * 1.1
        + persistenceX * this.config.persistence * 1.25
        + alignmentX * alignment * 1.15
        + cohesionX * adhesion * 0.72
        + Math.cos(noiseAngle) * this.config.noise;
      let desiredY = chemotaxisY * 1.1
        + persistenceY * this.config.persistence * 1.25
        + alignmentY * alignment * 1.15
        + cohesionY * adhesion * 0.72
        + Math.sin(noiseAngle) * this.config.noise
        + cell.lateralBias;

      if (this.scenario.id === 'budding' && cell.cohort) {
        desiredX += (this.scenario.budBias || 0) * this.runtime.edgeMotilityFactor;
        desiredY -= 0.12;
      }
      if (this.scenario.id === 'unjamming' && cell.x > 430 && cell.x < 780) {
        desiredY += clamp((270 - cell.y) / 90, -0.8, 0.8) * 0.7;
      }

      [desiredX, desiredY] = normalized(desiredX, desiredY);
      const effectiveRadius = this.radius * (1.08 - deformability * 0.42);
      let obstacleContact = false;
      for (const obstacle of this.geometry.obstacles) {
        const contact = circleRectContact(cell, effectiveRadius + 1.5, obstacle);
        if (!contact) continue;
        obstacleContact = true;
        const stiffness = obstacle.kind === 'matrix' ? 8.5 : 11;
        forceX[index] += contact.nx * contact.overlap * stiffness;
        forceY[index] += contact.ny * contact.overlap * stiffness;
        cell.pressure += contact.overlap * (obstacle.kind === 'matrix' ? 0.08 : 0.12);
      }

      if (obstacleContact) {
        cell.stretch = clamp(cell.stretch + 0.05 + deformability * 0.18, 0, 1);
        desiredX *= 0.55 + deformability * 0.52;
      } else {
        cell.stretch *= 0.88;
      }

      const openingMobility = this.#openingMobility(cell, deformability);
      desiredX *= openingMobility;
      if (openingMobility < 0.42) {
        forceX[index] -= (0.42 - openingMobility) * 58;
        cell.pressure += (0.42 - openingMobility) * 0.18;
      }

      const cohortBoost = cell.cohort ? this.runtime.edgeMotilityFactor : 1;
      const leaderBoost = cell.isLeader ? 1.12 : 1;
      const passedBoost = cell.passed ? 1.06 : 1;
      const targetSpeed = this.config.speed
        * cell.motility
        * cohortBoost
        * leaderBoost
        * passedBoost
        * this.runtime.pushFactor;
      forceX[index] += desiredX * targetSpeed * 2.4 - cell.vx * 2.2;
      forceY[index] += desiredY * targetSpeed * 2.4 - cell.vy * 2.2;
    }

    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      cell.vx += forceX[index] * dt;
      cell.vy += forceY[index] * dt;
      const maximumSpeed = this.config.speed * 1.75;
      const speed = vectorLength(cell.vx, cell.vy);
      if (speed > maximumSpeed) {
        cell.vx = cell.vx / speed * maximumSpeed;
        cell.vy = cell.vy / speed * maximumSpeed;
      }
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      this.#resolveObstacles(cell, deformability);
      cell.x = clamp(cell.x, this.radius + 2, this.width - this.radius - 2);
      cell.y = clamp(cell.y, this.radius + 2, this.height - this.radius - 2);
      [cell.dirX, cell.dirY] = normalized(cell.vx, cell.vy);
      if (!cell.passed && cell.x > this.scenario.passX) {
        cell.passed = true;
        if (this.scenario.id === 'leader-follower') cell.branch = cell.y < 270 ? 0 : 1;
      }
    }

    if (this.stepCount % 10 === 0) this.#detectEvents();
    if (this.time >= this.config.maxTime - 1e-9 || (this.lastMetrics.passRate > 0.95 && this.time > 10)) {
      this.finished = true;
      this.#event('finished', '实验完成');
    }
  }

  #targetFor(cell, leaders) {
    if (this.scenario.id === 'leader-follower') {
      if (cell.isLeader) return this.scenario.targetPoints[this.runtime.leaderRoute];
      if (leaders.length) {
        const leader = leaders.reduce((best, current) => {
          const bestDistance = Math.hypot(best.x - cell.x, best.y - cell.y);
          const currentDistance = Math.hypot(current.x - cell.x, current.y - cell.y);
          return currentDistance < bestDistance ? current : best;
        });
        if (Math.hypot(leader.x - cell.x, leader.y - cell.y) < 210) {
          return [leader.x + 55, leader.y + (this.scenario.targetPoints[leader.branch][1] - leader.y) * 0.45];
        }
      }
      const branch = cell.y < 270 ? 0 : 1;
      return this.scenario.targetPoints[branch];
    }
    return this.scenario.targetPoints[0];
  }

  #openingMobility(cell, deformability) {
    if (this.scenario.geometryKind === 'compression-channel') {
      if (cell.x < 450 || cell.x > 780) return 1;
      const channelWidth = this.runtime.gapWidth + this.runtime.channelRelease;
      return clamp(0.04 + deformability * 0.35 + Math.max(0, channelWidth - 70) / 160, 0.08, 1);
    }
    const opening = this.geometry.openings.find(item =>
      Math.abs(cell.x - item.x) < this.radius + 13
      && Math.abs(cell.y - item.y) <= item.height / 2 + this.radius
    );
    if (!opening) return 1;
    const hardWidth = this.radius * 2.4;
    const easyWidth = this.radius * 4.35;
    const geometricEase = clamp((opening.height - hardWidth) / (easyWidth - hardWidth), 0, 1);
    cell.stretch = clamp(cell.stretch + (0.08 + (1 - geometricEase) * 0.2) * deformability, 0, 1);
    return clamp(0.04 + geometricEase * (0.12 + deformability * 0.62) + deformability * 0.22, 0.05, 1.12);
  }

  #resolveObstacles(cell, deformability) {
    const radius = this.radius * (1.02 - deformability * 0.34);
    for (const obstacle of this.geometry.obstacles) {
      const contact = circleRectContact(cell, radius, obstacle);
      if (!contact) continue;
      const correction = contact.overlap + 0.1;
      cell.x += contact.nx * correction;
      cell.y += contact.ny * correction;
      const normalVelocity = cell.vx * contact.nx + cell.vy * contact.ny;
      if (normalVelocity < 0) {
        cell.vx -= normalVelocity * contact.nx * 0.8;
        cell.vy -= normalVelocity * contact.ny * 0.8;
      }
    }
  }

  #updateTemporaryEffects() {
    if (!this.runtime.effectUntil || this.time < this.runtime.effectUntil) return;
    this.runtime.adhesionFactor = 1;
    this.runtime.edgeAdhesionFactor = 1;
    this.runtime.deformabilityFactor = 1;
    this.runtime.alignmentFactor = 1;
    this.runtime.edgeMotilityFactor = 1;
    this.runtime.pushFactor = 1;
    this.runtime.channelRelease = 0;
    this.runtime.effectUntil = 0;
    this.geometry = buildGeometry(this.scenario, this.config, this.runtime);
    this.#event('perturbation-ended', '扰动效应结束');
  }

  #maybeReplaceLeader() {
    if (this.scenario.id !== 'leader-follower' || this.runtime.leaderRemovedAt === null) return;
    if (this.eventFlags.has('leader-replaced') || this.time - this.runtime.leaderRemovedAt < 4) return;
    if (this.config.alignment * this.runtime.alignmentFactor < 0.72) return;
    const candidate = this.cells
      .filter(cell => !cell.passed)
      .sort((a, b) => b.x - a.x)[0];
    if (!candidate) return;
    candidate.isLeader = true;
    candidate.branch = candidate.y < 270 ? 0 : 1;
    this.runtime.leaderRoute = candidate.branch;
    this.#event('leader-replaced', '新的 leader 自发补位');
  }

  #event(type, label) {
    const repeatable = ['perturbation', 'perturbation-ended'];
    const key = repeatable.includes(type) ? `${type}-${this.stepCount}` : type;
    if (this.eventFlags.has(key)) return;
    this.eventFlags.add(key);
    this.events.push({
      id: `${type}-${this.stepCount}`,
      type,
      label,
      time: this.time,
      step: this.stepCount
    });
  }

  #detectEvents() {
    const passedCount = this.cells.filter(cell => cell.passed).length;
    const metrics = this.getMetrics();
    this.lastMetrics = metrics;
    const obstacleContactCount = this.cells.filter(cell => this.geometry.obstacles.some(obstacle => {
      const expanded = {
        x: obstacle.x - 6,
        y: obstacle.y - 6,
        width: obstacle.width + 12,
        height: obstacle.height + 12
      };
      return cell.x >= expanded.x && cell.x <= expanded.x + expanded.width
        && cell.y >= expanded.y && cell.y <= expanded.y + expanded.height;
    })).length;
    const boundaryX = this.geometry.barrierX || this.geometry.openings[0]?.x || 470;
    const approachContactCount = this.cells.filter(cell => this.scenario.id === 'unjamming'
      ? cell.x > 450 && cell.x < 530
      : Math.abs(cell.x - boundaryX) < 30).length;
    const contactCount = Math.max(obstacleContactCount, approachContactCount);

    if (contactCount > 0) this.#event('first-contact', this.scenario.id === 'unjamming' ? '首次进入受压缩通道' : '首次接触组织边界');
    if (passedCount > 0) this.#event('first-pass', this.scenario.id === 'budding' ? '首个细胞越过 ECM 边界' : '首个细胞通过');
    if (passedCount >= this.cells.length / 2) this.#event('half-pass', '50% 细胞到达判定边界');
    if (metrics.fragments >= 2 && metrics.integrity < 0.82) this.#event('fragment', '第一次团块断裂');
    if (metrics.isolatedPassed > 0) this.#event('single-escape', '首个单细胞逃逸');

    if (this.scenario.id === 'budding' && metrics.budCount > 0) this.#event('bud', '首次形成小型细胞芽');
    if (this.scenario.id === 'leader-follower') {
      if (this.cells.some(cell => cell.isLeader && cell.passed)) this.#event('leader-pass', 'leader 首先通过出口');
      if (metrics.branchCount >= 2) this.#event('branch-split', '群体同时占据两个分支');
    }

    if (this.time >= 3 && this.time <= 5 && this.baselineMobility === null) this.baselineMobility = metrics.mobilityIndex;
    const constrainedJam = metrics.meanPressure > 0.3
      && metrics.passRate < 0.12
      && metrics.frontPosition > 465;
    const mechanicalJam = this.scenario.id === 'narrow-gap'
      && this.config.deformability < 0.2
      && this.config.adhesion > 0.8
      && metrics.passRate < 0.35
      && contactCount >= 4;
    const lowFlow = metrics.mobilityIndex < 0.24 && metrics.meanPressure > 0.3;
    if (this.time > 4 && (lowFlow || mechanicalJam || (this.scenario.id === 'unjamming' && constrainedJam)) && metrics.passRate < 0.35) {
      this.jammed = true;
      this.#event('jam', '局部发生拥堵');
    }
    const releaseProgress = this.scenario.id === 'unjamming'
      && this.perturbation?.type === 'release'
      && (metrics.passRate > 0.05 || metrics.frontPosition > 615);
    const spontaneousProgress = this.scenario.id === 'unjamming'
      && this.config.deformability > 0.72
      && metrics.frontPosition > 595;
    if (this.jammed && ((metrics.mobilityGain > 0.32 && metrics.mobilityIndex > 0.38) || releaseProgress || spontaneousProgress)) {
      this.unjammed = true;
      this.#event('unjam', '群体发生解堵');
    }
  }

  getMetrics() {
    const passedCells = this.cells.filter(cell => cell.passed);
    const components = connectedComponents(this.cells, 26);
    const firstPass = this.events.find(event => event.type === 'first-pass');
    const isolatedPassed = passedCells.filter(cell => cell.isolated && cell.x > this.scenario.passX + 20).length;
    const speeds = this.cells.map(cell => Math.hypot(cell.vx, cell.vy));
    const normalizedMobility = mean(speeds) / Math.max(1, this.config.speed);
    const componentSummaries = components.map(component => ({
      size: component.length,
      meanX: mean(component.map(index => this.cells[index].x)),
      meanY: mean(component.map(index => this.cells[index].y)),
      cohortShare: mean(component.map(index => this.cells[index].cohort))
    }));
    const budCount = componentSummaries.slice(1).filter(component => component.size >= 2 && component.size <= 10 && component.meanX > 480).length;
    const occupiedBranches = new Set(passedCells.map(cell => cell.branch));
    const leader = this.cells.find(cell => cell.isLeader);
    const leaderRoute = leader?.branch ?? this.runtime.leaderRoute;
    const sameRoute = passedCells.filter(cell => cell.branch === leaderRoute).length;
    const frontCells = this.cells.slice().sort((a, b) => b.x - a.x).slice(0, Math.max(4, Math.ceil(this.cells.length * 0.2)));
    const baseline = this.baselineMobility ?? normalizedMobility;

    return {
      elapsed: this.time,
      firstPassTime: firstPass?.time ?? null,
      passRate: passedCells.length / this.cells.length,
      integrity: (components[0]?.length || 0) / this.cells.length,
      fragments: components.filter(component => component.length >= 2).length,
      isolatedPassed,
      isolatedRate: passedCells.length ? isolatedPassed / passedCells.length : 0,
      meanPressure: mean(this.cells.map(cell => cell.pressure)),
      meanSpeed: mean(speeds),
      mobilityIndex: normalizedMobility,
      mobilityGain: normalizedMobility - baseline,
      frontRoughness: standardDeviation(frontCells.map(cell => cell.x)) / 40,
      frontPosition: Math.max(...this.cells.map(cell => cell.x)),
      budCount,
      branchCount: occupiedBranches.size,
      leaderFollowerRate: passedCells.length ? sameRoute / passedCells.length : 0,
      activeLeaders: this.cells.filter(cell => cell.isLeader).length,
      jammed: this.jammed,
      unjammed: this.unjammed
    };
  }

  getStatus() {
    const metrics = this.lastMetrics;
    if (this.finished) return '实验完成，正在生成结果解释';
    if (this.scenario.id === 'budding') {
      if (!this.eventFlags.has('first-contact')) return '肿瘤边缘正在向 ECM 开口重新组织';
      if (!this.eventFlags.has('bud')) return '边缘细胞受到牵引，局部连接正在承受拉伸';
      return '小型细胞芽已经形成，正在判断其是否持续脱离';
    }
    if (this.scenario.id === 'leader-follower') {
      if (!this.eventFlags.has('first-contact')) return 'leader 正在接近分叉屏障';
      if (!this.eventFlags.has('leader-pass')) return '群体在分叉前重新对齐方向';
      return metrics.branchCount >= 2 ? '群体正在两个分支间分裂' : 'follower 正沿 leader 选择的通路前进';
    }
    if (this.scenario.id === 'unjamming') {
      if (!this.eventFlags.has('first-contact')) return '高密度团块正在进入受压缩通道';
      if (this.unjammed) return '速度上升且压力重新分配，群体已发生解堵';
      if (this.jammed) return '局部速度下降，细胞在通道内持续积压';
      return '群体正在压缩区内重新排列';
    }
    if (!this.eventFlags.has('first-contact')) return '细胞群正在向组织屏障移动';
    if (!this.eventFlags.has('first-pass')) return '缺口处压力上升，前沿细胞正在尝试形变';
    if (metrics.passRate < 0.5) return '已有细胞通过，后方团块正在重新组织';
    return '超过一半细胞已经穿过组织边界';
  }

  getFrame() {
    const stride = 11;
    const data = new Float32Array(this.cells.length * stride);
    let offset = 0;
    for (const cell of this.cells) {
      data[offset++] = cell.x;
      data[offset++] = cell.y;
      data[offset++] = cell.vx;
      data[offset++] = cell.vy;
      data[offset++] = cell.pressure;
      data[offset++] = cell.passed ? 1 : 0;
      data[offset++] = cell.isLeader ? 1 : 0;
      data[offset++] = cell.stretch;
      data[offset++] = cell.isolated ? 1 : 0;
      data[offset++] = cell.cohort;
      data[offset++] = cell.branch;
    }
    const metrics = this.getMetrics();
    this.lastMetrics = metrics;
    return {
      data,
      meta: {
        time: this.time,
        step: this.stepCount,
        stride,
        width: this.width,
        height: this.height,
        radius: this.radius,
        geometry: this.geometry,
        status: this.getStatus(),
        metrics,
        perturbation: this.perturbation,
        finished: this.finished,
        scenarioId: this.scenario.id
      }
    };
  }

  getResult() {
    const metrics = this.getMetrics();
    const mode = classifyOutcome(metrics, this.config);
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      mode,
      metrics,
      explanation: explainOutcome(mode, metrics, this.config, this.perturbation),
      recommendation: recommendControl(mode, this.config),
      events: this.events,
      config: { ...this.config, gapWidthFinal: this.runtime.gapWidth },
      scenario: {
        id: this.scenario.id,
        version: this.scenario.version,
        name: this.scenario.name
      },
      perturbation: this.perturbation,
      reproducibility: {
        seed: this.config.seed,
        configHash: this.config.configHash,
        scenarioHash: this.config.scenarioHash,
        deterministicWithinModelVersion: true
      },
      scientificScope: 'Qualitative mechanism exploration and education only; not for clinical prediction.',
      generatedAt: new Date().toISOString()
    };
  }
}

import { makeConfig } from './config.js';
import { connectedComponents } from './core/components.js';
import {
  axesFromStrain,
  ellipseSupportRadius,
  rectangleContact,
  shapeIndex,
  shortestAngleDelta
} from './core/deformable-cell.js';
import { ExtracellularMatrixField } from './core/ecm-field.js';
import { GuidanceFieldSet } from './core/guidance-field.js';
import { RNG } from './core/rng.js';
import { buildNeighborPairs } from './core/spatial-hash.js';
import { getIntervention } from './interventions.js';
import { classifyOutcome, explainOutcome, recommendControl } from './outcomes.js';
import { buildGeometry, getScenario } from './scenarios/catalog.js';
import { RESULT_SCHEMA_VERSION } from './versions.js';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const vectorLength = (x, y) => Math.hypot(x, y) || 1;
const lerp = (from, to, amount) => from + (to - from) * amount;

export const CELL_STATES = Object.freeze({
  QUIESCENT: 0,
  MIGRATORY: 1,
  LEADER: 2,
  FOLLOWER: 3,
  STRESSED: 4
});

// Hidden, calibrated model constants. The UI intentionally exposes only broad biological controls.
const MODEL = Object.freeze({
  cellRadius: 8.8,
  nucleusRadiusRatio: 0.54,
  neighborRange: 34,
  adhesionRange: 7.2,
  repulsionStiffness: 6.2,
  adhesionStiffness: 0.18,
  obstacleStiffness: 12.5,
  matrixStiffness: 9.2,
  velocityDamping: 2.3,
  activeForceGain: 2.45,
  shapeRelaxation: 4.2,
  pressureRelaxation: 5.5,
  maximumCellStrain: 0.62,
  maximumNuclearStrain: 0.34,
  guidanceIterations: 180,
  ecmResistanceGain: 22,
  ecmGradientGain: 260,
  leaderEvaluationSteps: 15,
  collectiveSignalPasses: 2,
  ecmContactDensity: 0.075,
  leaderMinimumAge: 3.5,
  leaderRefractoryTime: 3.5
});

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

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(1e-9, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function compressionAxis(stressXX, stressYY, stressXY, fallbackAngle) {
  const trace = stressXX + stressYY;
  if (trace < 1e-7) return { angle: fallbackAngle, anisotropy: 0, magnitude: 0 };
  const angle = 0.5 * Math.atan2(2 * stressXY, stressXX - stressYY);
  const discriminant = Math.sqrt((stressXX - stressYY) ** 2 + 4 * stressXY * stressXY);
  return {
    angle,
    anisotropy: clamp(discriminant / Math.max(trace, 1e-7), 0, 1),
    magnitude: trace
  };
}

function approximateContactLength(radiusA, radiusB, overlap, proximity = 1) {
  const effectiveRadius = 2 * radiusA * radiusB / Math.max(radiusA + radiusB, 1e-6);
  return 2 * Math.sqrt(Math.max(0, effectiveRadius * Math.max(overlap, 0.12) * clamp(proximity, 0, 1)));
}

function symmetricDifferenceRate(previous, next) {
  if (!previous?.size && !next?.size) return 0;
  let changes = 0;
  const union = new Set([...previous || [], ...next || []]);
  for (const item of union) if (previous?.has(item) !== next?.has(item)) changes += 1;
  return changes / Math.max(1, union.size);
}

export class SimulationEngine {
  constructor(inputConfig = {}) {
    this.config = makeConfig(inputConfig);
    this.scenario = getScenario(this.config.scenarioId);
    this.intervention = getIntervention(this.config.interventionId);
    this.width = 960;
    this.height = 540;
    this.radius = MODEL.cellRadius;
    this.nucleusRadius = this.radius * MODEL.nucleusRadiusRatio;
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
    this.leaderHistory = [];
    this.leaderReplacementCount = 0;
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
      leaderRemovedAt: null,
      leaderSuppressionUntil: 0,
      leaderEstablished: false
    };
    this.#rebuildEnvironment();
    this.cells = this.#createCells();
    this.lastMetrics = this.getMetrics();
  }

  #rebuildEnvironment() {
    this.geometry = buildGeometry(this.scenario, this.config, this.runtime);
    this.guidance = new GuidanceFieldSet(this.geometry, { iterations: MODEL.guidanceIterations });
    this.ecm = new ExtracellularMatrixField(this.geometry, this.scenario, this.config, {
      resistanceFactor: this.intervention.matrixResistanceFactor,
      degradationFactor: this.intervention.matrixDegradationFactor
    });
    this.geometry.guidanceArrows = this.guidance.arrows();
    this.geometry.guidanceModel = 'steady-state diffusion field with no-flux hard obstacles';
    this.geometry.ecmModel = 'low-resolution degradable and remodelable ECM field';
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

    for (let index = 0; index < count; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const angle = this.rng.next() * TAU;
      const isBuddingEdge = (this.scenario.id === 'budding' || this.config.presetId === 'budding')
        && column >= columns - 2
        && row >= 1
        && row <= Math.min(rows - 2, 4);
      const branch = row < rows / 2 ? 0 : 1;

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
        isLeader: false,
        cohort: isBuddingEdge ? 1 : 0,
        branch,
        motility: 1 + this.rng.signed() * this.config.noise * 1.35,
        lateralBias: this.rng.signed() * this.config.noise * 0.55,
        shapeStrain: 0.015 + this.rng.next() * 0.012,
        shapeAngle: angle,
        nucleusStrain: 0,
        neighborCount: 0,
        contactCount: 0,
        contactLength: 0,
        isolated: false,
        guidanceLevel: 0,
        ecmDensity: 0,
        ecmDamage: 0,
        traction: 0,
        stateCode: CELL_STATES.MIGRATORY,
        stateAge: 0,
        leaderScore: 0,
        leaderSince: null,
        collectiveSignalX: 1,
        collectiveSignalY: 0,
        collectiveSignalStrength: 0,
        stressExposure: 0,
        highNuclearStrainDuration: 0,
        neighborExchange: 0,
        previousNeighbors: new Set(),
        boundaryContact: false,
        wasLeaderAtPass: false,
        followedLeaderAtPass: null,
        routeCommitment: 0
      });
    }
    return cells;
  }

  applyPerturbation(type) {
    if (this.perturbation || this.finished) return false;
    const duration = 9;
    const actions = {
      widen: { label: '扩大缺口', rebuild: true, apply: () => { this.runtime.gapWidth = Math.min(140, this.runtime.gapWidth + 22); } },
      loosen: { label: '暂时降低连接', apply: () => { this.runtime.adhesionFactor = 0.38; this.runtime.effectUntil = this.time + duration; } },
      soften: { label: '暂时提高柔顺性', apply: () => { this.runtime.deformabilityFactor = 1.35; this.runtime.effectUntil = this.time + duration; } },
      'open-ecm': { label: '打开 ECM', rebuild: true, apply: () => { this.runtime.gapWidth = Math.min(140, this.runtime.gapWidth + 26); } },
      'edge-loosen': { label: '松动边缘连接', apply: () => { this.runtime.edgeAdhesionFactor = 0.22; this.runtime.effectUntil = this.time + duration; } },
      'boost-edge': { label: '增强边缘运动', apply: () => { this.runtime.edgeMotilityFactor = 1.65; this.runtime.effectUntil = this.time + duration; } },
      'remove-leader': { label: '移除 leader', apply: () => {
        for (const cell of this.cells) this.#retireLeader(cell, 'leader 被移除');
        this.runtime.leaderRemovedAt = this.time;
        this.runtime.leaderSuppressionUntil = this.time + MODEL.leaderRefractoryTime;
        this.#event('leader-lost', 'leader 被移除');
      } },
      'switch-leader': { label: '切换路线', apply: () => {
        this.runtime.leaderRoute = this.runtime.leaderRoute === 0 ? 1 : 0;
        for (const cell of this.cells) if (cell.isLeader) cell.branch = this.runtime.leaderRoute;
      } },
      align: { label: '增强集体引导', apply: () => { this.runtime.alignmentFactor = 1.35; this.runtime.effectUntil = this.time + duration; } },
      release: { label: '局部松动', rebuild: true, apply: () => { this.runtime.channelRelease = 60; } },
      pulse: { label: '施加推动', apply: () => { this.runtime.pushFactor = 1.55; this.runtime.effectUntil = this.time + 5; } }
    };
    const action = actions[type];
    if (!action) return false;
    action.apply();
    if (action.rebuild) this.#rebuildEnvironment();
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

    const count = this.cells.length;
    const forceX = new Float64Array(count);
    const forceY = new Float64Array(count);
    const neighborVX = new Float64Array(count);
    const neighborVY = new Float64Array(count);
    const centerX = new Float64Array(count);
    const centerY = new Float64Array(count);
    const neighborCounts = new Uint16Array(count);
    const contactCounts = new Uint16Array(count);
    const pressureLoad = new Float64Array(count);
    const stressXX = new Float64Array(count);
    const stressYY = new Float64Array(count);
    const stressXY = new Float64Array(count);
    const adhesionLoad = new Float64Array(count);
    const contactLengths = new Float64Array(count);
    const neighborLists = Array.from({ length: count }, () => []);

    const adhesion = this.config.adhesion * this.runtime.adhesionFactor;
    const compliance = clamp(this.config.deformability * this.runtime.deformabilityFactor, 0.05, 1);
    const alignment = clamp(this.config.alignment * this.runtime.alignmentFactor, 0, 1.2);
    const pairs = buildNeighborPairs(this.cells, MODEL.neighborRange);

    for (const [i, j] of pairs) {
      const a = this.cells[i];
      const b = this.cells[j];
      const deltaX = b.x - a.x;
      const deltaY = b.y - a.y;
      const distance = vectorLength(deltaX, deltaY);
      const nx = deltaX / distance;
      const ny = deltaY / distance;

      neighborCounts[i] += 1;
      neighborCounts[j] += 1;
      neighborLists[i].push(j);
      neighborLists[j].push(i);
      neighborVX[i] += b.vx;
      neighborVY[i] += b.vy;
      neighborVX[j] += a.vx;
      neighborVY[j] += a.vy;
      centerX[i] += b.x;
      centerY[i] += b.y;
      centerX[j] += a.x;
      centerY[j] += a.y;

      const supportA = ellipseSupportRadius(a, nx, ny, this.radius);
      const supportB = ellipseSupportRadius(b, -nx, -ny, this.radius);
      const contactDistance = supportA + supportB;
      const overlap = contactDistance - distance;
      const edgePair = this.scenario.id === 'budding' && (a.cohort || b.cohort);
      let groupCoupling = a.cohort === b.cohort ? 1 : 0.28;
      if (edgePair) groupCoupling *= this.runtime.edgeAdhesionFactor * (this.config.presetId === 'budding' ? 0.48 : 1);

      if (overlap > 0) {
        const length = approximateContactLength(supportA, supportB, overlap, 1);
        const adhesivePull = adhesion * groupCoupling * MODEL.adhesionStiffness * length;
        const stiffness = MODEL.repulsionStiffness * (1.12 - compliance * 0.24);
        const push = Math.max(0, overlap * stiffness - adhesivePull);
        forceX[i] -= nx * push;
        forceY[i] -= ny * push;
        forceX[j] += nx * push;
        forceY[j] += ny * push;
        const load = overlap * 0.12 + adhesivePull * 0.015;
        pressureLoad[i] += load;
        pressureLoad[j] += load;
        adhesionLoad[i] += adhesivePull;
        adhesionLoad[j] += adhesivePull;
        contactLengths[i] += length;
        contactLengths[j] += length;
        contactCounts[i] += 1;
        contactCounts[j] += 1;
        stressXX[i] += load * nx * nx;
        stressYY[i] += load * ny * ny;
        stressXY[i] += load * nx * ny;
        stressXX[j] += load * nx * nx;
        stressYY[j] += load * ny * ny;
        stressXY[j] += load * nx * ny;
      } else if (distance < contactDistance + MODEL.adhesionRange && adhesion > 0.05) {
        const gap = distance - contactDistance;
        const proximity = 1 - gap / MODEL.adhesionRange;
        const length = approximateContactLength(supportA, supportB, 0.12, proximity);
        const pull = adhesion * groupCoupling * proximity * MODEL.adhesionStiffness * Math.max(2, length);
        forceX[i] += nx * pull;
        forceY[i] += ny * pull;
        forceX[j] -= nx * pull;
        forceY[j] -= ny * pull;
        adhesionLoad[i] += pull;
        adhesionLoad[j] += pull;
      }
    }

    this.#updateCollectiveSignals(neighborLists);
    if (this.stepCount % 10 === 0) this.#updateNeighborExchange(neighborLists);
    const frontX = Math.max(...this.cells.map(cell => cell.x));

    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      cell.neighborCount = neighborCounts[index];
      cell.contactCount = contactCounts[index];
      cell.contactLength = contactLengths[index];
      cell.isolated = neighborCounts[index] <= 1;
      cell.boundaryContact = false;

      const [persistenceX, persistenceY] = normalized(cell.vx, cell.vy);
      const [alignmentX, alignmentY] = neighborCounts[index]
        ? normalized(neighborVX[index] / neighborCounts[index], neighborVY[index] / neighborCounts[index])
        : [persistenceX, persistenceY];
      const [cohesionX, cohesionY] = neighborCounts[index]
        ? normalized(centerX[index] / neighborCounts[index] - cell.x, centerY[index] / neighborCounts[index] - cell.y)
        : [0, 0];
      const [guidanceX, guidanceY, guidanceLevel] = this.#guidanceFor(cell);
      cell.guidanceLevel = guidanceLevel;
      const noiseAngle = this.rng.next() * TAU;

      let desiredX = guidanceX * 1.16
        + persistenceX * this.config.persistence * 1.18
        + alignmentX * alignment * 1.1
        + cohesionX * adhesion * 0.68
        + cell.collectiveSignalX * cell.collectiveSignalStrength * alignment * 0.9
        + Math.cos(noiseAngle) * this.config.noise;
      let desiredY = guidanceY * 1.16
        + persistenceY * this.config.persistence * 1.18
        + alignmentY * alignment * 1.1
        + cohesionY * adhesion * 0.68
        + cell.collectiveSignalY * cell.collectiveSignalStrength * alignment * 0.9
        + Math.sin(noiseAngle) * this.config.noise
        + cell.lateralBias;

      if ((this.scenario.id === 'budding' || this.config.presetId === 'budding') && cell.cohort) {
        desiredX += (this.scenario.budBias || 0.34) * this.runtime.edgeMotilityFactor;
        desiredY += cell.lateralBias >= 0 ? 0.16 : -0.16;
      }
      if (this.scenario.id === 'unjamming' && cell.x > 430 && cell.x < 780) {
        desiredY += clamp((270 - cell.y) / 90, -0.8, 0.8) * 0.7;
      }
      [desiredX, desiredY] = normalized(desiredX, desiredY);

      let obstacleLoad = 0;
      for (const obstacle of this.geometry.obstacles) {
        const contact = rectangleContact(cell, obstacle, this.radius);
        if (!contact) continue;
        const stiffness = obstacle.kind === 'matrix' ? MODEL.matrixStiffness : MODEL.obstacleStiffness;
        forceX[index] += contact.nx * contact.overlap * stiffness;
        forceY[index] += contact.ny * contact.overlap * stiffness;
        const load = contact.overlap * (obstacle.kind === 'matrix' ? 0.14 : 0.18);
        obstacleLoad += load;
        pressureLoad[index] += load;
        contactCounts[index] += 1;
        stressXX[index] += load * contact.nx * contact.nx;
        stressYY[index] += load * contact.ny * contact.ny;
        stressXY[index] += load * contact.nx * contact.ny;
        cell.boundaryContact = true;
      }

      const frontness = smoothstep(frontX - 56, frontX - 4, cell.x);
      const invasiveActivity = clamp(
        0.18
          + compliance * 0.28
          + guidanceLevel * 0.22
          + frontness * 0.2
          + (cell.cohort ? 0.18 : 0)
          + (cell.isLeader ? 0.15 : 0),
        0.05,
        1
      );
      const provisionalTraction = this.config.speed * cell.motility * MODEL.activeForceGain;
      const matrix = this.ecm.interact(cell.x, cell.y, desiredX, desiredY, invasiveActivity, provisionalTraction, dt);
      cell.ecmDensity = matrix.density;
      cell.ecmDamage = matrix.damage;
      if (matrix.density >= MODEL.ecmContactDensity) cell.boundaryContact = true;
      const matrixResistance = matrix.resistance * MODEL.ecmResistanceGain;
      forceX[index] -= desiredX * matrixResistance + matrix.gradientX * MODEL.ecmGradientGain;
      forceY[index] -= desiredY * matrixResistance + matrix.gradientY * MODEL.ecmGradientGain;
      obstacleLoad += matrix.resistance * 0.13;
      pressureLoad[index] += matrix.resistance * 0.09;

      const confinement = this.#confinementMobility(cell, compliance, matrix.resistance);
      if (confinement.mobility < 0.55) {
        forceX[index] -= (0.55 - confinement.mobility) * 52;
        const load = (0.55 - confinement.mobility) * 0.75;
        pressureLoad[index] += load;
        obstacleLoad += load;
      }

      const cohortBoost = cell.cohort ? this.runtime.edgeMotilityFactor : 1;
      const leaderBoost = cell.isLeader ? 1.12 : 1;
      const passedBoost = cell.passed ? 1.06 : 1;
      const targetSpeed = this.config.speed
        * cell.motility
        * cohortBoost
        * leaderBoost
        * passedBoost
        * this.runtime.pushFactor
        * confinement.mobility
        * clamp(1 - matrix.resistance * 0.22, 0.45, 1);
      cell.traction = targetSpeed * MODEL.activeForceGain;
      forceX[index] += desiredX * cell.traction - cell.vx * (MODEL.velocityDamping + matrix.resistance * 1.25);
      forceY[index] += desiredY * cell.traction - cell.vy * (MODEL.velocityDamping + matrix.resistance * 1.25);

      const compression = compressionAxis(stressXX[index], stressYY[index], stressXY[index], Math.atan2(desiredY, desiredX) - Math.PI / 2);
      const polarityAngle = Math.atan2(desiredY, desiredX);
      const compressionLongAxis = compression.angle + Math.PI / 2;
      const stressWeight = smoothstep(0.04, 0.75, compression.magnitude + obstacleLoad);
      const targetAngle = stressWeight > 0.1 ? compressionLongAxis : polarityAngle;
      const polarityStrain = cell.isLeader ? 0.085 : cell.stateCode === CELL_STATES.FOLLOWER ? 0.035 : 0.025;
      const maximumCellStrain = MODEL.maximumCellStrain * (0.42 + compliance * 0.58);
      const targetStrain = clamp(
        polarityStrain + compliance * (compression.magnitude * 0.2 + compression.anisotropy * 0.36 + obstacleLoad * 0.09),
        0,
        maximumCellStrain
      );
      const shapeRate = 1 - Math.exp(-MODEL.shapeRelaxation * dt * (0.75 + compliance * 0.5));
      cell.shapeStrain = lerp(cell.shapeStrain, targetStrain, shapeRate);
      cell.shapeAngle += shortestAngleDelta(cell.shapeAngle, targetAngle) * shapeRate;

      const nuclearCompliance = clamp(compliance * this.intervention.nuclearComplianceFactor, 0.05, 1.35);
      const maximumNuclearStrain = MODEL.maximumNuclearStrain * (0.32 + nuclearCompliance * 0.68);
      const targetNuclearStrain = clamp(cell.shapeStrain * 0.5 + obstacleLoad * nuclearCompliance * 0.055, 0, maximumNuclearStrain);
      const nucleusRate = 1 - Math.exp(-2.25 * dt * Math.min(1.25, nuclearCompliance + 0.25));
      cell.nucleusStrain = lerp(cell.nucleusStrain, targetNuclearStrain, nucleusRate);
      if (cell.nucleusStrain > maximumNuclearStrain * 0.7) cell.highNuclearStrainDuration += dt;
      else cell.highNuclearStrainDuration = Math.max(0, cell.highNuclearStrainDuration - dt * 0.35);

      const pressureRate = 1 - Math.exp(-MODEL.pressureRelaxation * dt);
      cell.pressure = lerp(cell.pressure, pressureLoad[index], pressureRate);
      cell.stressExposure = cell.pressure > 0.42 || cell.highNuclearStrainDuration > 0.8
        ? cell.stressExposure + dt
        : Math.max(0, cell.stressExposure - dt * 0.55);
      cell.leaderScore = clamp(
        frontness * 0.44
          + clamp(adhesionLoad[index] / 2.4, 0, 1) * 0.24
          + guidanceLevel * 0.14
          + clamp(cell.traction / 80, 0, 1) * 0.12
          + cell.collectiveSignalStrength * 0.12
          - clamp(cell.pressure / 1.8, 0, 1) * 0.18,
        0,
        1
      );
    }

    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      cell.vx += forceX[index] * dt;
      cell.vy += forceY[index] * dt;
      const maximumSpeed = this.config.speed * 1.7;
      const speed = vectorLength(cell.vx, cell.vy);
      if (speed > maximumSpeed) {
        cell.vx = cell.vx / speed * maximumSpeed;
        cell.vy = cell.vy / speed * maximumSpeed;
      }
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      this.#resolveObstacles(cell);
      const bounds = axesFromStrain(this.radius, cell.shapeStrain);
      const boundRadius = Math.max(bounds.major, this.radius);
      cell.x = clamp(cell.x, boundRadius + 2, this.width - boundRadius - 2);
      cell.y = clamp(cell.y, boundRadius + 2, this.height - boundRadius - 2);
      [cell.dirX, cell.dirY] = normalized(cell.vx, cell.vy);
      if (!cell.passed && cell.x > this.scenario.passX) {
        cell.passed = true;
        if (this.scenario.id === 'leader-follower') {
          const exitBranch = cell.y < 270 ? 0 : 1;
          cell.wasLeaderAtPass = cell.isLeader;
          const guidedRoute = this.cells.find(item => item.isLeader)?.branch ?? this.runtime.leaderRoute;
          cell.followedLeaderAtPass = cell.isLeader
            ? null
            : Boolean(this.runtime.leaderEstablished && exitBranch === guidedRoute);
          cell.branch = exitBranch;
        }
      }
      this.#updatePhenotypicState(cell, dt);
    }

    this.ecm.relax(dt);
    if (this.stepCount % MODEL.leaderEvaluationSteps === 0) this.#updateLeaders();
    if (this.stepCount % 10 === 0) this.#detectEvents();
    if (this.time >= this.config.maxTime - 1e-9 || (this.lastMetrics.passRate > 0.95 && this.time > 10)) {
      this.finished = true;
      this.#closeLeaderHistory();
      this.#event('finished', '实验完成');
    }
  }

  #guidanceFor(cell) {
    let route = this.scenario.id === 'leader-follower' ? cell.branch : 0;
    if (cell.isLeader) route = this.runtime.leaderRoute;

    const routeSignalStrength = Math.max(cell.collectiveSignalStrength, cell.routeCommitment || 0);
    if (this.scenario.id === 'leader-follower' && !cell.isLeader && routeSignalStrength > 0.04) {
      let bestRoute = route;
      let bestScore = -Infinity;
      for (let candidate = 0; candidate < this.guidance.fields.length; candidate++) {
        const [candidateX, candidateY] = this.guidance.sample(cell.x, cell.y, candidate);
        const score = candidateX * cell.collectiveSignalX + candidateY * cell.collectiveSignalY;
        if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && candidate === route)) {
          bestScore = score;
          bestRoute = candidate;
        }
      }
      route = bestRoute;
      if (cell.collectiveSignalStrength > 0.12) cell.branch = bestRoute;
    }

    let [gx, gy, level] = this.guidance.sample(cell.x, cell.y, route);
    if (!cell.isLeader && routeSignalStrength > 0.04) {
      const coupling = clamp(routeSignalStrength * this.config.alignment, 0, 0.82);
      [gx, gy] = normalized(
        gx * (1 - coupling) + cell.collectiveSignalX * coupling,
        gy * (1 - coupling) + cell.collectiveSignalY * coupling
      );
      level = Math.max(level, coupling);
    }
    return [gx, gy, level];
  }

  #updateCollectiveSignals(neighborLists) {
    const count = this.cells.length;
    let signalX = new Float64Array(count);
    let signalY = new Float64Array(count);
    let strength = new Float64Array(count);

    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      if (cell.isLeader) {
        const [gx, gy] = this.guidance.sample(cell.x, cell.y, cell.branch);
        signalX[index] = gx;
        signalY[index] = gy;
        strength[index] = 1;
      } else {
        signalX[index] = cell.collectiveSignalX;
        signalY[index] = cell.collectiveSignalY;
        strength[index] = cell.collectiveSignalStrength * (this.scenario.id === 'leader-follower' ? 0.997 : 0.58);
      }
    }

    if (this.scenario.id === 'leader-follower') {
      for (let pass = 0; pass < MODEL.collectiveSignalPasses; pass++) {
        const nextX = new Float64Array(count);
        const nextY = new Float64Array(count);
        const nextStrength = new Float64Array(count);
        for (let index = 0; index < count; index++) {
          const cell = this.cells[index];
          if (cell.isLeader) {
            nextX[index] = signalX[index];
            nextY[index] = signalY[index];
            nextStrength[index] = 1;
            continue;
          }

          let sx = signalX[index] * strength[index];
          let sy = signalY[index] * strength[index];
          let weight = strength[index];
          let strongest = strength[index] * 0.997;
          for (const neighbor of neighborLists[index]) {
            const distance = Math.hypot(this.cells[neighbor].x - cell.x, this.cells[neighbor].y - cell.y);
            const proximity = clamp(1 - distance / MODEL.neighborRange, 0, 1);
            const link = 0.62 + proximity * 0.35;
            const transmitted = strength[neighbor] * link * 0.96;
            if (transmitted <= 1e-6) continue;
            sx += signalX[neighbor] * transmitted;
            sy += signalY[neighbor] * transmitted;
            weight += transmitted;
            strongest = Math.max(strongest, transmitted);
          }
          if (weight > 1e-6) {
            [nextX[index], nextY[index]] = normalized(sx, sy);
            nextStrength[index] = clamp(strongest, 0, 0.97);
          }
        }
        signalX = nextX;
        signalY = nextY;
        strength = nextStrength;
      }
    } else {
      for (let pass = 0; pass < 3; pass++) {
        const nextX = new Float64Array(count);
        const nextY = new Float64Array(count);
        const nextStrength = new Float64Array(count);
        for (let index = 0; index < count; index++) {
          const cell = this.cells[index];
          if (cell.isLeader) {
            nextX[index] = signalX[index];
            nextY[index] = signalY[index];
            nextStrength[index] = 1;
            continue;
          }
          let sx = signalX[index] * strength[index] * 1.2;
          let sy = signalY[index] * strength[index] * 1.2;
          let weight = strength[index] * 1.2;
          for (const neighbor of neighborLists[index]) {
            const link = clamp(1 - Math.hypot(this.cells[neighbor].x - cell.x, this.cells[neighbor].y - cell.y) / MODEL.neighborRange, 0.08, 1);
            sx += signalX[neighbor] * strength[neighbor] * link;
            sy += signalY[neighbor] * strength[neighbor] * link;
            weight += strength[neighbor] * link;
          }
          if (weight > 1e-6) {
            [nextX[index], nextY[index]] = normalized(sx, sy);
            nextStrength[index] = clamp(weight / Math.max(2.4, neighborLists[index].length + 0.8) * 0.92, 0, 0.94);
          }
        }
        signalX = nextX;
        signalY = nextY;
        strength = nextStrength;
      }
    }

    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      cell.collectiveSignalX = signalX[index] || cell.dirX;
      cell.collectiveSignalY = signalY[index] || cell.dirY;
      cell.collectiveSignalStrength = strength[index];
      if (this.scenario.id === 'leader-follower') {
        cell.routeCommitment *= 0.999;
        if (strength[index] > 0.12) cell.routeCommitment = Math.max(cell.routeCommitment, strength[index]);
      }
    }
  }

  #updateNeighborExchange(neighborLists) {
    for (let index = 0; index < this.cells.length; index++) {
      const next = new Set(neighborLists[index]);
      this.cells[index].neighborExchange += symmetricDifferenceRate(this.cells[index].previousNeighbors, next);
      this.cells[index].previousNeighbors = next;
    }
  }

  #updatePhenotypicState(cell, dt) {
    let nextState = CELL_STATES.MIGRATORY;
    const speed = Math.hypot(cell.vx, cell.vy);
    if (cell.isLeader) nextState = CELL_STATES.LEADER;
    else if (cell.stressExposure > 1.2) nextState = CELL_STATES.STRESSED;
    else if (cell.collectiveSignalStrength > 0.18 && cell.neighborCount >= 2) nextState = CELL_STATES.FOLLOWER;
    else if (speed < this.config.speed * 0.12 && cell.neighborCount >= 4) nextState = CELL_STATES.QUIESCENT;
    if (nextState !== cell.stateCode) {
      cell.stateCode = nextState;
      cell.stateAge = 0;
    } else {
      cell.stateAge += dt;
    }
  }

  #updateLeaders() {
    const leaderEnabled = (this.config.leaderMode || this.scenario.id === 'leader-follower')
      && !this.intervention.leaderSuppression;
    if (!leaderEnabled) {
      for (const cell of this.cells) this.#retireLeader(cell, null);
      return;
    }

    const active = this.cells.find(cell => cell.isLeader);
    if (active) {
      const leaderAge = this.time - (active.leaderSince ?? this.time);
      const shouldRetire = leaderAge > 8
        && (active.stressExposure > 8 || active.leaderScore < 0.035);
      if (shouldRetire) {
        this.#retireLeader(active, '原 leader 失去前缘优势');
        this.runtime.leaderSuppressionUntil = this.time + 1.2;
        this.#event('leader-turnover', 'Leader 身份发生动态更替');
      }
    }

    if (this.cells.some(cell => cell.isLeader)) return;
    if (this.time < 1.1 || this.time < this.runtime.leaderSuppressionUntil) return;
    const front = Math.max(...this.cells.filter(cell => !cell.passed).map(cell => cell.x), 0);
    const candidate = this.cells
      .filter(cell => !cell.passed && cell.x > front - 58 && cell.stressExposure < 3.6)
      .sort((a, b) => b.leaderScore - a.leaderScore || b.x - a.x || a.id - b.id)[0];
    const replacementThreshold = this.runtime.leaderRemovedAt !== null && this.config.alignment * this.runtime.alignmentFactor >= 0.72 ? 0.16 : null;
    const threshold = replacementThreshold ?? (this.scenario.id === 'leader-follower' ? 0.32 : 0.43);
    if (!candidate || candidate.leaderScore < threshold) return;

    candidate.isLeader = true;
    candidate.leaderSince = this.time;
    candidate.stateCode = CELL_STATES.LEADER;
    candidate.stateAge = 0;
    if (this.scenario.id === 'leader-follower') {
      candidate.branch = this.runtime.leaderRemovedAt === null
        ? (candidate.y + candidate.lateralBias * 80 < 270 ? 0 : 1)
        : candidate.y < 270 ? 0 : 1;
      this.runtime.leaderRoute = candidate.branch;
      this.runtime.leaderEstablished = true;
    }
    const replacement = this.leaderHistory.length > 0 || this.runtime.leaderRemovedAt !== null;
    if (replacement) this.leaderReplacementCount += 1;
    this.#event(replacement ? 'leader-replaced' : 'leader-emerged', replacement ? '新的 Leader 由前缘力学竞争产生' : '前缘细胞形成动态 Leader');
  }

  #retireLeader(cell, reason) {
    if (!cell?.isLeader) return;
    const start = cell.leaderSince ?? this.time;
    this.leaderHistory.push({ cellId: cell.id, start, end: this.time, duration: Math.max(0, this.time - start), reason });
    cell.isLeader = false;
    cell.leaderSince = null;
    if (cell.stateCode === CELL_STATES.LEADER) cell.stateCode = CELL_STATES.MIGRATORY;
  }

  #closeLeaderHistory() {
    for (const cell of this.cells) {
      if (!cell.isLeader) continue;
      const alreadyClosed = this.leaderHistory.some(item => item.cellId === cell.id && item.end === this.time);
      if (!alreadyClosed) this.leaderHistory.push({
        cellId: cell.id,
        start: cell.leaderSince ?? this.time,
        end: this.time,
        duration: Math.max(0, this.time - (cell.leaderSince ?? this.time)),
        reason: 'experiment-finished'
      });
    }
  }

  #confinementMobility(cell, compliance, matrixResistance = 0) {
    let availableWidth = Infinity;
    if (this.scenario.geometryKind === 'compression-channel' && cell.x >= 450 && cell.x <= 780) {
      availableWidth = this.runtime.gapWidth + this.runtime.channelRelease;
    } else {
      const opening = this.geometry.openings.find(item =>
        Math.abs(cell.x - item.x) < this.radius + 16
        && Math.abs(cell.y - item.y) <= item.height / 2 + this.radius * 1.5
      );
      if (opening) availableWidth = opening.height;
    }
    if (!Number.isFinite(availableWidth)) return { mobility: clamp(1 - matrixResistance * 0.08, 0.68, 1), availableWidth };

    const cellMinor = axesFromStrain(this.radius, cell.shapeStrain).minor * 2;
    const nucleusMinor = axesFromStrain(this.nucleusRadius, cell.nucleusStrain).minor * 2;
    const nuclearRelief = clamp(this.intervention.nuclearComplianceFactor, 0.8, 1.5);
    const requiredWidth = Math.max(nucleusMinor * 1.08 / nuclearRelief, cellMinor * 0.73);
    const ratio = availableWidth / Math.max(requiredWidth, 1);
    let mobility = clamp(0.08 + smoothstep(0.72, 1.35, ratio) * 0.92 + compliance * 0.05, 0.08, 1.05);
    const junctionStrength = this.config.adhesion * this.runtime.adhesionFactor;
    const geometricCrowding = clamp(44 / Math.max(availableWidth, 1), 0.35, 1.45);
    const cloggingTendency = junctionStrength * (1 - compliance) * geometricCrowding;
    const cloggingPenalty = smoothstep(0.45, 0.82, cloggingTendency);
    mobility *= 1 - cloggingPenalty * 0.9;
    mobility *= clamp(1 - matrixResistance * 0.11, 0.58, 1);
    return { mobility: clamp(mobility, 0.06, 1.05), availableWidth, requiredWidth, cloggingTendency };
  }

  #resolveObstacles(cell) {
    for (const obstacle of this.geometry.obstacles) {
      const contact = rectangleContact(cell, obstacle, this.radius);
      if (!contact) continue;
      const correction = contact.overlap + 0.08;
      cell.x += contact.nx * correction;
      cell.y += contact.ny * correction;
      const normalVelocity = cell.vx * contact.nx + cell.vy * contact.ny;
      if (normalVelocity < 0) {
        cell.vx -= normalVelocity * contact.nx * 0.82;
        cell.vy -= normalVelocity * contact.ny * 0.82;
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
    this.runtime.effectUntil = 0;
    this.#event('perturbation-ended', '扰动效应结束');
  }

  #event(type, label) {
    const repeatable = ['perturbation', 'perturbation-ended', 'leader-turnover', 'leader-replaced'];
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
    const contactCount = this.cells.filter(cell => cell.boundaryContact).length;

    if (contactCount > 0) this.#event('first-contact', this.scenario.id === 'unjamming' ? '首次进入受压缩通道' : '首次接触组织与 ECM 边界');
    if (passedCount > 0) this.#event('first-pass', this.scenario.id === 'budding' ? '首个细胞越过 ECM 判定边界' : '首个细胞通过');
    if (passedCount >= this.cells.length / 2) this.#event('half-pass', '50% 细胞到达判定边界');
    if (metrics.fragments >= 2 && metrics.integrity < 0.82) this.#event('fragment', '第一次团块断裂');
    if (metrics.isolatedPassed > 0) this.#event('single-escape', '首个单细胞逃逸');
    if (metrics.highNuclearStrainRate > 0.08) this.#event('nuclear-strain', '部分细胞核进入高应变状态');
    if (metrics.degradedAreaRate > 0.02) this.#event('ecm-remodeling', '细胞形成可检测的 ECM 重塑轨迹');

    if (this.scenario.id === 'budding' && metrics.budCount > 0) this.#event('bud', '首次形成 1–4 个细胞的出芽簇');
    if (this.scenario.id === 'leader-follower') {
      if (this.cells.some(cell => cell.isLeader && cell.passed)) this.#event('leader-pass', 'Leader 首先通过出口');
      if (metrics.branchCount >= 2) this.#event('branch-split', '群体同时占据两个分支');
    }

    if (this.time >= 3 && this.time <= 5 && this.baselineMobility === null) this.baselineMobility = metrics.mobilityIndex;
    const constrainedJam = metrics.meanPressure > 0.22
      && metrics.passRate < 0.12
      && metrics.frontPosition > 465;
    const mechanicalJam = this.scenario.id === 'narrow-gap'
      && this.config.deformability < 0.24
      && this.config.adhesion > 0.78
      && metrics.passRate < 0.35
      && contactCount >= 4;
    const lowFlow = metrics.mobilityIndex < 0.24 && metrics.meanPressure > 0.22;
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
    if (this.jammed && ((metrics.mobilityGain > 0.28 && metrics.mobilityIndex > 0.36) || releaseProgress || spontaneousProgress)) {
      this.unjammed = true;
      this.#event('unjam', '群体发生解堵');
    }
  }

  getMetrics() {
    const passedCells = this.cells.filter(cell => cell.passed);
    const components = connectedComponents(this.cells, 20);
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
    const budCount = componentSummaries.slice(1).filter(component => component.size >= 1 && component.size <= 4 && component.meanX > 480).length;
    const occupiedBranches = new Set(passedCells.map(cell => cell.branch));
    const followerPasses = passedCells.filter(cell => !cell.wasLeaderAtPass);
    const followedLeaderPasses = followerPasses.filter(cell => cell.followedLeaderAtPass === true);
    const frontCells = this.cells.slice().sort((a, b) => b.x - a.x).slice(0, Math.max(4, Math.ceil(this.cells.length * 0.2)));
    const rearCells = this.cells.slice().sort((a, b) => a.x - b.x).slice(0, Math.max(4, Math.ceil(this.cells.length * 0.2)));
    const baseline = this.baselineMobility ?? normalizedMobility;
    const shapeIndices = this.cells.map(cell => shapeIndex(this.radius, cell.shapeStrain));
    const highNuclearStrainRate = this.cells.filter(cell => cell.nucleusStrain > MODEL.maximumNuclearStrain * 0.72).length / this.cells.length;
    const ecm = this.ecm.getMetrics();
    const activeLeaderDurations = this.cells.filter(cell => cell.isLeader).map(cell => this.time - (cell.leaderSince ?? this.time));
    const completedLeaderDurations = this.leaderHistory.map(item => item.duration);
    const frontTraction = mean(frontCells.map(cell => cell.traction));
    const rearTraction = mean(rearCells.map(cell => cell.traction));
    const tractionAsymmetry = (frontTraction - rearTraction) / Math.max(1, frontTraction + rearTraction);

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
      leaderFollowerRate: followerPasses.length ? followedLeaderPasses.length / followerPasses.length : 0,
      activeLeaders: this.cells.filter(cell => cell.isLeader).length,
      meanLeaderScore: mean(this.cells.map(cell => cell.leaderScore)),
      meanLeaderLifetime: mean([...completedLeaderDurations, ...activeLeaderDurations]),
      leaderTurnoverRate: this.time > 0 ? this.leaderReplacementCount / this.time : 0,
      tractionAsymmetry,
      meanShapeIndex: mean(shapeIndices),
      shapeIndexSpread: standardDeviation(shapeIndices),
      meanNuclearStrain: mean(this.cells.map(cell => cell.nucleusStrain)),
      meanNuclearStrainDuration: mean(this.cells.map(cell => cell.highNuclearStrainDuration)),
      highNuclearStrainRate,
      meanContactNumber: mean(this.cells.map(cell => cell.contactCount)),
      meanContactLength: mean(this.cells.map(cell => cell.contactLength)),
      neighborExchangeRate: this.time > 0 ? mean(this.cells.map(cell => cell.neighborExchange)) / Math.max(1, this.time / (10 / 30)) : 0,
      stressedRate: this.cells.filter(cell => cell.stateCode === CELL_STATES.STRESSED).length / this.cells.length,
      followerRate: this.cells.filter(cell => cell.stateCode === CELL_STATES.FOLLOWER).length / this.cells.length,
      meanECMDensity: ecm.meanDensity,
      meanECMDamage: ecm.meanDamage,
      degradedAreaRate: ecm.degradedAreaRate,
      maximumECMStrain: ecm.maximumStrain,
      areaConservationError: 0,
      jammed: this.jammed,
      unjammed: this.unjammed
    };
  }

  getExplanatoryFactors(metrics = this.lastMetrics) {
    const factors = [
      {
        id: 'nuclear-bottleneck',
        label: '细胞核限制',
        score: clamp(metrics.highNuclearStrainRate * 1.5 + metrics.meanNuclearStrainDuration / 8, 0, 1),
        detail: `高核应变细胞约 ${Math.round(metrics.highNuclearStrainRate * 100)}%`
      },
      {
        id: 'ecm-resistance',
        label: 'ECM 阻力',
        score: clamp(metrics.meanECMDensity * (1 - metrics.meanECMDamage * 0.55), 0, 1),
        detail: `已重塑区域约 ${Math.round(metrics.degradedAreaRate * 100)}%`
      },
      {
        id: 'cohesion-load',
        label: '连接与接触负荷',
        score: clamp(metrics.meanPressure / 1.2 + this.config.adhesion * 0.25, 0, 1),
        detail: `平均接触数 ${metrics.meanContactNumber.toFixed(1)}`
      },
      {
        id: 'collective-organization',
        label: '群体机械组织',
        score: clamp(metrics.followerRate * 0.55 + Math.max(0, metrics.tractionAsymmetry) * 0.8 + metrics.activeLeaders * 0.2, 0, 1),
        detail: `Follower 状态约 ${Math.round(metrics.followerRate * 100)}%`
      }
    ];
    return factors.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  getStatus() {
    const metrics = this.lastMetrics;
    if (this.finished) return '实验完成，正在生成结果解释';
    if (metrics.highNuclearStrainRate > 0.12) return '狭窄区域内细胞核应变升高，迁移速度受到限制';
    if (metrics.stressedRate > 0.2) return '持续接触负荷使部分细胞进入应激状态';
    if (this.scenario.id === 'budding') {
      if (!this.eventFlags.has('first-contact')) return '肿瘤边缘正在沿引导场接近可降解 ECM';
      if (!this.eventFlags.has('ecm-remodeling')) return '边缘细胞在 ECM 中积累牵引并尝试形成通路';
      if (!this.eventFlags.has('bud')) return 'ECM 已出现局部重塑，边缘连接正在承受拉伸';
      return '1–4 个细胞的小型出芽簇已经形成，正在判断其是否持续脱离';
    }
    if (this.scenario.id === 'leader-follower') {
      if (metrics.activeLeaders === 0) return '前缘细胞正在竞争 Leader 身份，群体尚未形成稳定牵引不对称';
      if (!this.eventFlags.has('leader-pass')) return '动态 Leader 正通过接触链向后方传播方向信息';
      return metrics.branchCount >= 2 ? '群体正在两个分支间分裂' : 'Follower 正沿接触链传播的方向信号前进';
    }
    if (this.scenario.id === 'unjamming') {
      if (!this.eventFlags.has('first-contact')) return '高密度团块正在进入受压缩通道';
      if (this.unjammed) return '邻居交换率与速度上升，群体已发生解堵';
      if (this.jammed) return '局部速度下降，细胞形状与接触网络处于拥堵状态';
      return '细胞正在通过面积守恒形变、核形变和邻居交换重新排列';
    }
    if (!this.eventFlags.has('first-contact')) return '细胞群正在沿扩散型引导场向组织屏障移动';
    if (!this.eventFlags.has('first-pass')) return '缺口处接触应力和 ECM 阻力升高，细胞与细胞核正在差异形变';
    if (metrics.passRate < 0.5) return '已有细胞通过，后方团块正在重组接触网络与 ECM 通路';
    return '超过一半细胞已经穿过组织边界';
  }

  getFrame() {
    const stride = 20;
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
      data[offset++] = cell.shapeStrain;
      data[offset++] = cell.isolated ? 1 : 0;
      data[offset++] = cell.cohort;
      data[offset++] = cell.branch;
      data[offset++] = cell.shapeAngle;
      data[offset++] = cell.nucleusStrain;
      data[offset++] = cell.contactCount;
      data[offset++] = cell.stateCode;
      data[offset++] = cell.traction / 100;
      data[offset++] = cell.ecmDensity;
      data[offset++] = cell.ecmDamage;
      data[offset++] = cell.collectiveSignalStrength;
      data[offset++] = cell.highNuclearStrainDuration;
    }
    const metrics = this.getMetrics();
    this.lastMetrics = metrics;
    const ecm = this.ecm.snapshot();
    return {
      data,
      ecm,
      meta: {
        time: this.time,
        step: this.stepCount,
        stride,
        width: this.width,
        height: this.height,
        radius: this.radius,
        nucleusRadius: this.nucleusRadius,
        geometry: this.geometry,
        status: this.getStatus(),
        explanatoryFactors: this.getExplanatoryFactors(metrics),
        metrics,
        perturbation: this.perturbation,
        finished: this.finished,
        scenarioId: this.scenario.id,
        interventionId: this.intervention.id,
        modelKind: 'multiscale-deformable-cell-nucleus-ecm'
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
      explanatoryFactors: this.getExplanatoryFactors(metrics),
      events: this.events,
      config: { ...this.config, gapWidthFinal: this.runtime.gapWidth },
      scenario: {
        id: this.scenario.id,
        version: this.scenario.version,
        name: this.scenario.name
      },
      intervention: {
        id: this.intervention.id,
        name: this.intervention.name
      },
      model: {
        kind: 'multiscale-deformable-cell-nucleus-ecm',
        areaConservingBoundary: true,
        explicitNucleus: true,
        dynamicPhenotypicStates: true,
        dynamicLeaderSelection: true,
        contactLengthAdhesionApproximation: true,
        ecmField: 'low-resolution degradable and remodelable field',
        guidanceField: 'steady-state diffusion field with no-flux hard obstacles',
        hiddenCalibratedConstants: true
      },
      leaderHistory: this.leaderHistory,
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

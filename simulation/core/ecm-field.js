const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

function insideOpening(x, y, opening, margin = 0) {
  return Math.abs(x - opening.x) <= opening.width / 2 + margin
    && Math.abs(y - opening.y) <= opening.height / 2 + margin;
}

export class ExtracellularMatrixField {
  constructor(geometry, scenario, config, options = {}) {
    this.width = geometry.width;
    this.height = geometry.height;
    this.cellSize = options.cellSize || 20;
    this.columns = Math.ceil(this.width / this.cellSize);
    this.rows = Math.ceil(this.height / this.cellSize);
    const length = this.columns * this.rows;
    this.density = new Float32Array(length);
    this.initialDensity = new Float32Array(length);
    this.damage = new Float32Array(length);
    this.strain = new Float32Array(length);
    this.fiberX = new Float32Array(length);
    this.fiberY = new Float32Array(length);
    this.activeMask = new Uint8Array(length);
    this.scenarioId = scenario.id;
    this.resistanceFactor = options.resistanceFactor || 1;
    this.degradationFactor = options.degradationFactor ?? 1;
    this.#initialize(geometry, scenario, config);
  }

  #index(column, row) {
    return row * this.columns + column;
  }

  #initialize(geometry, scenario, config) {
    const openings = geometry.openings || [];
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = this.#index(column, row);
        const x = (column + 0.5) * this.cellSize;
        const y = (row + 0.5) * this.cellSize;
        let density = 0.035;
        let active = false;

        if (scenario.id === 'budding') {
          if (x >= 500 && x <= 840) {
            const inOpening = openings.some(opening => insideOpening(x, y, opening, 24));
            const edgeDistance = Math.abs(y - (openings[0]?.y || 250));
            density = inOpening ? 0.2 + clamp(edgeDistance / 180, 0, 0.22) : 0.78;
            active = true;
          }
        } else if (scenario.id === 'unjamming') {
          if (x >= 455 && x <= 790) {
            const opening = openings[0];
            const inChannel = opening && Math.abs(y - opening.y) <= opening.height / 2;
            density = inChannel ? 0.12 : 0.9;
            active = true;
          }
        } else {
          const bandX = geometry.barrierX || 548;
          if (Math.abs(x - bandX) < 44) {
            const inOpening = openings.some(opening => insideOpening(x, y, opening, 10));
            density = inOpening ? 0.08 : 0.62;
            active = true;
          }
          if (x > bandX + 35) density = Math.max(density, 0.07);
        }

        const seededTexture = ((column * 73856093) ^ (row * 19349663) ^ config.seed) >>> 0;
        const texture = ((seededTexture % 997) / 996 - 0.5) * 0.08;
        density = clamp(density + (active ? texture : texture * 0.15), 0, 1);
        this.density[index] = density;
        this.initialDensity[index] = density;
        this.activeMask[index] = active ? 1 : 0;
        const angle = ((seededTexture % 360) / 360) * Math.PI;
        this.fiberX[index] = Math.cos(angle);
        this.fiberY[index] = Math.sin(angle);
      }
    }
  }

  #sampleArray(array, x, y) {
    const gx = clamp(x / this.cellSize - 0.5, 0, this.columns - 1);
    const gy = clamp(y / this.cellSize - 0.5, 0, this.rows - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(this.columns - 1, x0 + 1);
    const y1 = Math.min(this.rows - 1, y0 + 1);
    const tx = gx - x0;
    const ty = gy - y0;
    const a = array[this.#index(x0, y0)] * (1 - tx) + array[this.#index(x1, y0)] * tx;
    const b = array[this.#index(x0, y1)] * (1 - tx) + array[this.#index(x1, y1)] * tx;
    return a * (1 - ty) + b * ty;
  }

  sample(x, y) {
    let fiberX = this.#sampleArray(this.fiberX, x, y);
    let fiberY = this.#sampleArray(this.fiberY, x, y);
    const magnitude = Math.hypot(fiberX, fiberY) || 1;
    fiberX /= magnitude;
    fiberY /= magnitude;
    return {
      density: this.#sampleArray(this.density, x, y),
      damage: this.#sampleArray(this.damage, x, y),
      strain: this.#sampleArray(this.strain, x, y),
      fiberX,
      fiberY
    };
  }

  gradient(x, y) {
    const h = this.cellSize * 0.8;
    const gx = this.#sampleArray(this.density, x + h, y) - this.#sampleArray(this.density, x - h, y);
    const gy = this.#sampleArray(this.density, x, y + h) - this.#sampleArray(this.density, x, y - h);
    return [gx / (2 * h), gy / (2 * h)];
  }

  interact(x, y, dirX, dirY, activity, traction, dt) {
    const frontX = x + dirX * 10;
    const frontY = y + dirY * 10;
    const sample = this.sample(frontX, frontY);
    const [gradientX, gradientY] = this.gradient(frontX, frontY);
    const alignment = Math.abs(dirX * sample.fiberX + dirY * sample.fiberY);
    const resistance = sample.density
      * this.resistanceFactor
      * (1.08 - alignment * 0.28)
      * (0.72 + sample.strain * 0.35);

    if (sample.density > 0.08 && activity > 0.02) {
      const centerColumn = Math.floor(frontX / this.cellSize);
      const centerRow = Math.floor(frontY / this.cellSize);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const column = centerColumn + dx;
          const row = centerRow + dy;
          if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) continue;
          const index = this.#index(column, row);
          if (!this.activeMask[index] && this.initialDensity[index] < 0.1) continue;
          const weight = dx === 0 && dy === 0 ? 1 : dx === 0 || dy === 0 ? 0.58 : 0.34;
          const degradation = dt * this.degradationFactor * activity * (0.014 + traction * 0.00008) * weight;
          this.damage[index] = clamp(this.damage[index] + degradation, 0, 1);
          const floor = this.scenarioId === 'budding' ? 0.045 : 0.065;
          this.density[index] = Math.max(floor, this.initialDensity[index] * (1 - this.damage[index] * 0.82));
          const remodeling = clamp(dt * activity * 0.22 * weight, 0, 0.16);
          this.fiberX[index] = lerp(this.fiberX[index], dirX, remodeling);
          this.fiberY[index] = lerp(this.fiberY[index], dirY, remodeling);
          const fiberMagnitude = Math.hypot(this.fiberX[index], this.fiberY[index]) || 1;
          this.fiberX[index] /= fiberMagnitude;
          this.fiberY[index] /= fiberMagnitude;
          this.strain[index] = clamp(this.strain[index] + dt * traction * 0.00038 * weight, 0, 1);
        }
      }
    }

    return { ...sample, resistance, gradientX, gradientY };
  }

  relax(dt) {
    const strainDecay = Math.exp(-dt * 0.32);
    for (let index = 0; index < this.strain.length; index++) this.strain[index] *= strainDecay;
  }

  getMetrics() {
    let activeCount = 0;
    let densitySum = 0;
    let degradedCount = 0;
    let damageSum = 0;
    let maximumStrain = 0;
    for (let index = 0; index < this.density.length; index++) {
      if (!this.activeMask[index]) continue;
      activeCount += 1;
      densitySum += this.density[index];
      damageSum += this.damage[index];
      if (this.damage[index] >= 0.25) degradedCount += 1;
      maximumStrain = Math.max(maximumStrain, this.strain[index]);
    }
    return {
      meanDensity: activeCount ? densitySum / activeCount : 0,
      meanDamage: activeCount ? damageSum / activeCount : 0,
      degradedAreaRate: activeCount ? degradedCount / activeCount : 0,
      maximumStrain
    };
  }

  snapshot() {
    const packed = new Uint8Array(this.density.length * 4);
    for (let index = 0; index < this.density.length; index++) {
      const offset = index * 4;
      packed[offset] = Math.round(clamp(this.density[index], 0, 1) * 255);
      packed[offset + 1] = Math.round(clamp(this.damage[index], 0, 1) * 255);
      packed[offset + 2] = Math.round(clamp((this.fiberX[index] + 1) * 0.5, 0, 1) * 255);
      packed[offset + 3] = Math.round(clamp((this.fiberY[index] + 1) * 0.5, 0, 1) * 255);
    }
    return {
      columns: this.columns,
      rows: this.rows,
      cellSize: this.cellSize,
      packed
    };
  }
}

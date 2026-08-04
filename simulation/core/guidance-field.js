const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function pointInsideRectangle(x, y, rectangle) {
  return x >= rectangle.x
    && x <= rectangle.x + rectangle.width
    && y >= rectangle.y
    && y <= rectangle.y + rectangle.height;
}

class ScalarGuidanceField {
  constructor(geometry, target, options = {}) {
    this.width = geometry.width;
    this.height = geometry.height;
    this.cellSize = options.cellSize || 16;
    this.columns = Math.ceil(this.width / this.cellSize);
    this.rows = Math.ceil(this.height / this.cellSize);
    this.target = target;
    this.blocked = new Uint8Array(this.columns * this.rows);
    this.values = new Float64Array(this.columns * this.rows);
    this.sources = new Uint8Array(this.columns * this.rows);
    this.#initialize(geometry);
    this.#relax(options.iterations || 180);
  }

  #index(column, row) {
    return row * this.columns + column;
  }

  #initialize(geometry) {
    const [targetX, targetY] = this.target;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = this.#index(column, row);
        const x = (column + 0.5) * this.cellSize;
        const y = (row + 0.5) * this.cellSize;
        const blocked = (geometry.guidanceObstacles || geometry.obstacles).some(obstacle => pointInsideRectangle(x, y, obstacle));
        this.blocked[index] = blocked ? 1 : 0;
        const distanceToTarget = Math.hypot(x - targetX, y - targetY);
        const isSource = !blocked && (distanceToTarget < this.cellSize * 2.1 || x > this.width - this.cellSize * 2);
        this.sources[index] = isSource ? 1 : 0;
        this.values[index] = isSource ? 1 : clamp(x / this.width * 0.55, 0, 0.55);
      }
    }
  }

  #neighborValue(values, column, row, fallback) {
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return fallback;
    const index = this.#index(column, row);
    if (this.blocked[index]) return fallback;
    return values[index];
  }

  #relax(iterations) {
    let current = this.values;
    let next = new Float64Array(current.length);
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let row = 0; row < this.rows; row++) {
        for (let column = 0; column < this.columns; column++) {
          const index = this.#index(column, row);
          if (this.blocked[index]) {
            next[index] = 0;
            continue;
          }
          if (this.sources[index]) {
            next[index] = 1;
            continue;
          }
          const value = current[index];
          const left = this.#neighborValue(current, column - 1, row, value);
          const right = this.#neighborValue(current, column + 1, row, value);
          const up = this.#neighborValue(current, column, row - 1, value);
          const down = this.#neighborValue(current, column, row + 1, value);
          const boundarySink = column === 0 ? 0 : value;
          next[index] = clamp((left + right + up + down + boundarySink * 0.12) / 4.12 * 0.9985, 0, 1);
        }
      }
      [current, next] = [next, current];
    }
    this.values = current;
  }

  #valueAtGrid(column, row) {
    column = clamp(column, 0, this.columns - 1);
    row = clamp(row, 0, this.rows - 1);
    const index = this.#index(column, row);
    return this.blocked[index] ? 0 : this.values[index];
  }

  sampleValue(x, y) {
    const gx = clamp(x / this.cellSize - 0.5, 0, this.columns - 1);
    const gy = clamp(y / this.cellSize - 0.5, 0, this.rows - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(this.columns - 1, x0 + 1);
    const y1 = Math.min(this.rows - 1, y0 + 1);
    const tx = gx - x0;
    const ty = gy - y0;
    const a = this.#valueAtGrid(x0, y0) * (1 - tx) + this.#valueAtGrid(x1, y0) * tx;
    const b = this.#valueAtGrid(x0, y1) * (1 - tx) + this.#valueAtGrid(x1, y1) * tx;
    return a * (1 - ty) + b * ty;
  }

  sampleGradient(x, y) {
    const h = this.cellSize * 0.8;
    let gx = this.sampleValue(x + h, y) - this.sampleValue(x - h, y);
    let gy = this.sampleValue(x, y + h) - this.sampleValue(x, y - h);
    const magnitude = Math.hypot(gx, gy);
    if (magnitude < 1e-6) {
      gx = this.target[0] - x;
      gy = this.target[1] - y;
    }
    const length = Math.hypot(gx, gy) || 1;
    return [gx / length, gy / length, this.sampleValue(x, y)];
  }
}

export class GuidanceFieldSet {
  constructor(geometry, options = {}) {
    this.geometry = geometry;
    this.fields = geometry.targetPoints.map(target => new ScalarGuidanceField(geometry, target, options));
  }

  sample(x, y, route = 0) {
    const index = clamp(Math.round(route), 0, this.fields.length - 1);
    return this.fields[index]?.sampleGradient(x, y) || [1, 0, 0];
  }

  arrows(options = {}) {
    const spacingX = options.spacingX || 72;
    const spacingY = options.spacingY || 64;
    const arrows = [];
    for (let y = spacingY * 0.65; y < this.geometry.height; y += spacingY) {
      for (let x = spacingX * 0.65; x < this.geometry.width; x += spacingX) {
        if ((this.geometry.guidanceObstacles || this.geometry.obstacles).some(obstacle => pointInsideRectangle(x, y, obstacle))) continue;
        const route = this.fields.length > 1 && y > this.geometry.height / 2 ? 1 : 0;
        const [dx, dy, concentration] = this.sample(x, y, route);
        arrows.push({ x, y, dx, dy, concentration });
      }
    }
    return arrows;
  }
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function axesFromStrain(radius, strain) {
  const safe = clamp(strain, 0, 0.72);
  return {
    major: radius * Math.exp(safe),
    minor: radius * Math.exp(-safe)
  };
}

export function ellipseSupportRadius(cell, nx, ny, radius) {
  const { major, minor } = axesFromStrain(radius, cell.shapeStrain || 0);
  const cosine = Math.cos(cell.shapeAngle || 0);
  const sine = Math.sin(cell.shapeAngle || 0);
  const localX = nx * cosine + ny * sine;
  const localY = -nx * sine + ny * cosine;
  const denominator = Math.sqrt((localX * localX) / (major * major) + (localY * localY) / (minor * minor));
  return denominator > 1e-9 ? 1 / denominator : Math.max(major, minor);
}

export function ellipsePerimeter(radius, strain) {
  const { major, minor } = axesFromStrain(radius, strain);
  const h = ((major - minor) ** 2) / ((major + minor) ** 2);
  return Math.PI * (major + minor) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

export function shapeIndex(radius, strain) {
  const area = Math.PI * radius * radius;
  return ellipsePerimeter(radius, strain) / Math.sqrt(area);
}

export function shortestAngleDelta(from, to) {
  let delta = (to - from) % Math.PI;
  if (delta > Math.PI / 2) delta -= Math.PI;
  if (delta < -Math.PI / 2) delta += Math.PI;
  return delta;
}

export function rectangleContact(cell, rectangle, radius) {
  const left = rectangle.x;
  const right = rectangle.x + rectangle.width;
  const top = rectangle.y;
  const bottom = rectangle.y + rectangle.height;
  const inside = cell.x >= left && cell.x <= right && cell.y >= top && cell.y <= bottom;

  if (inside) {
    const choices = [
      { distance: cell.x - left, nx: -1, ny: 0 },
      { distance: right - cell.x, nx: 1, ny: 0 },
      { distance: cell.y - top, nx: 0, ny: -1 },
      { distance: bottom - cell.y, nx: 0, ny: 1 }
    ].sort((a, b) => a.distance - b.distance);
    const nearest = choices[0];
    const support = ellipseSupportRadius(cell, nearest.nx, nearest.ny, radius);
    return { nx: nearest.nx, ny: nearest.ny, overlap: support + nearest.distance };
  }

  const nearestX = clamp(cell.x, left, right);
  const nearestY = clamp(cell.y, top, bottom);
  const dx = cell.x - nearestX;
  const dy = cell.y - nearestY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return null;
  const nx = dx / distance;
  const ny = dy / distance;
  const support = ellipseSupportRadius(cell, nx, ny, radius);
  const overlap = support - distance;
  return overlap > 0 ? { nx, ny, overlap } : null;
}

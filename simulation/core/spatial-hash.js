export function buildNeighborPairs(cells, range) {
  const cellSize = Math.max(1, range);
  const buckets = new Map();
  const coordinates = new Array(cells.length);

  for (let index = 0; index < cells.length; index++) {
    const column = Math.floor(cells[index].x / cellSize);
    const row = Math.floor(cells[index].y / cellSize);
    coordinates[index] = [column, row];
    const key = `${column},${row}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  }

  const pairs = [];
  for (let index = 0; index < cells.length; index++) {
    const [column, row] = coordinates[index];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = buckets.get(`${column + dx},${row + dy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other <= index) continue;
          const deltaX = cells[other].x - cells[index].x;
          const deltaY = cells[other].y - cells[index].y;
          if (deltaX * deltaX + deltaY * deltaY < range * range) pairs.push([index, other]);
        }
      }
    }
  }
  return pairs;
}

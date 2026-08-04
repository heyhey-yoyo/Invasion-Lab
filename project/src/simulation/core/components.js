export function connectedComponents(cells, threshold = 26) {
  const n = cells.length;
  const seen = new Uint8Array(n);
  const components = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const members = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const index = stack.pop();
      members.push(index);
      const a = cells[index];
      for (let j = 0; j < n; j++) {
        if (seen[j]) continue;
        const b = cells[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < threshold) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    components.push(members);
  }
  components.sort((a, b) => b.length - a.length);
  return components;
}

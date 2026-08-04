const UINT32_RANGE = 4294967296;

export class RNG {
  constructor(seed) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / UINT32_RANGE;
  }

  signed() {
    return this.next() * 2 - 1;
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length) % items.length];
  }
}

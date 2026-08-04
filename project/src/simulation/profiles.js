export const LEVELS = Object.freeze({
  low: 0.2,
  medium: 0.55,
  high: 0.88
});

export const PRESETS = Object.freeze({
  jam: Object.freeze({
    id: 'jam',
    name: '紧密拥堵者',
    subtitle: '高黏附、低形变、强协同',
    description: '细胞保持紧密连接，容易在受限几何前积累压力。',
    adhesion: 0.94,
    deformability: 0.08,
    alignment: 0.82,
    persistence: 0.68,
    noise: 0.05,
    speed: 20,
    leaderMode: false
  }),
  collective: Object.freeze({
    id: 'collective',
    name: '协同推进者',
    subtitle: '紧密协同、柔性变形',
    description: '前沿细胞变形后推进，后方细胞保持连接并持续跟随。',
    adhesion: 0.78,
    deformability: 0.82,
    alignment: 0.86,
    persistence: 0.8,
    noise: 0.06,
    speed: 25,
    leaderMode: true
  }),
  budding: Object.freeze({
    id: 'budding',
    name: '边缘出芽者',
    subtitle: '中等黏附、局部脱离',
    description: '主体仍保持连接，但边缘小簇更容易形成并脱离。',
    adhesion: 0.46,
    deformability: 0.72,
    alignment: 0.48,
    persistence: 0.78,
    noise: 0.18,
    speed: 25,
    leaderMode: true
  }),
  escape: Object.freeze({
    id: 'escape',
    name: '随机探索者',
    subtitle: '低黏附、高形变、低协同',
    description: '细胞更容易离开主体，以分散方式寻找可通过路径。',
    adhesion: 0.18,
    deformability: 0.92,
    alignment: 0.22,
    persistence: 0.84,
    noise: 0.2,
    speed: 28,
    leaderMode: false
  })
});

export const LEGACY_PRESET_ALIASES = Object.freeze({
  cohesive: 'jam',
  flexible: 'collective',
  follower: 'collective',
  explorer: 'escape'
});

const freeze = value => Object.freeze(value);

export const SCENARIOS = freeze({
  'narrow-gap': freeze({
    id: 'narrow-gap',
    version: '4.0.1',
    name: '狭窄缺口',
    eyebrow: 'Narrow-gap transit',
    title: '细胞会堵住，还是穿过去？',
    question: '几何约束、抱团和形变怎样共同决定穿越方式？',
    description: '一个癌细胞团块面对单一组织屏障和中央缺口。',
    defaultPresetId: 'collective',
    defaultGapWidth: 39,
    defaultCellCount: 68,
    defaultMaxTime: 42,
    initialCenter: [330, 270],
    initialDensity: 1,
    passX: 570,
    targetPoints: [[840, 270]],
    geometryKind: 'single-barrier',
    metricLabels: ['首次通过时间', '通过率', '团块完整度', '侵袭模式'],
    geometryLabel: '缺口宽度',
    recommendation: '推荐：比较“协同推进者”和“紧密拥堵者”。',
    perturbations: freeze([
      freeze({ type: 'widen', label: '扩大缺口', symbol: '↔' }),
      freeze({ type: 'loosen', label: '降低黏附', symbol: '◌' }),
      freeze({ type: 'soften', label: '提高形变', symbol: '≈' })
    ])
  }),
  budding: freeze({
    id: 'budding',
    version: '4.0.1',
    name: '肿瘤出芽',
    eyebrow: 'Tumor budding',
    title: '什么时候会从主体边缘长出小芽？',
    question: '局部黏附下降与边缘运动偏置何时足以产生小型脱离细胞簇？',
    description: '肿瘤团块贴近带局部开口的 ECM 边界，边缘细胞具有轻微异质性。',
    defaultPresetId: 'budding',
    defaultGapWidth: 50,
    defaultCellCount: 72,
    defaultMaxTime: 48,
    initialCenter: [390, 270],
    initialDensity: 1.05,
    passX: 630,
    targetPoints: [[850, 230]],
    geometryKind: 'soft-boundary',
    budBias: 0.42,
    metricLabels: ['首次脱离时间', '边界外比例', '主体完整度', '形态模式'],
    geometryLabel: 'ECM 开口',
    recommendation: '推荐：比较“边缘出芽者”和“协同推进者”。',
    perturbations: freeze([
      freeze({ type: 'open-ecm', label: '打开 ECM', symbol: '◇' }),
      freeze({ type: 'edge-loosen', label: '松动边缘', symbol: '◌' }),
      freeze({ type: 'boost-edge', label: '增强边缘运动', symbol: '↗' })
    ])
  }),
  'leader-follower': freeze({
    id: 'leader-follower',
    version: '4.0.1',
    name: 'Leader–Follower',
    eyebrow: 'Leader–follower branching',
    title: '一个领头细胞能带群体走对分叉吗？',
    question: '领头细胞、邻居对齐和分叉几何如何决定群体保持、分裂或停滞？',
    description: '群体面对上下两个出口，leader 会选择其中一条路线并影响 follower。',
    defaultPresetId: 'collective',
    defaultGapWidth: 34,
    defaultCellCount: 70,
    defaultMaxTime: 50,
    initialCenter: [330, 270],
    initialDensity: 1,
    passX: 590,
    targetPoints: [[845, 185], [845, 355]],
    geometryKind: 'branching-barrier',
    metricLabels: ['首次跟随通过', '群体通过率', '跟随一致度', '组织模式'],
    geometryLabel: '分叉出口',
    recommendation: '推荐：运行一次后移除 leader，观察群体能否补位。',
    perturbations: freeze([
      freeze({ type: 'remove-leader', label: '移除 leader', symbol: '×' }),
      freeze({ type: 'switch-leader', label: '切换路线', symbol: '⇅' }),
      freeze({ type: 'align', label: '增强跟随', symbol: '≋' })
    ])
  }),
  unjamming: freeze({
    id: 'unjamming',
    version: '4.0.1',
    name: '拥堵与解堵',
    eyebrow: 'Jamming–unjamming',
    title: '高密度群体何时会突然流动？',
    question: '密度、形变、黏附和局部松动如何触发从固体般拥堵到流体般运动的转换？',
    description: '高密度团块进入受压缩通道，重点观察速度与压力是否发生突变。',
    defaultPresetId: 'jam',
    defaultGapWidth: 82,
    defaultCellCount: 92,
    defaultMaxTime: 46,
    initialCenter: [315, 270],
    initialDensity: 1.18,
    passX: 690,
    targetPoints: [[880, 270]],
    geometryKind: 'compression-channel',
    metricLabels: ['首次解堵时间', '前沿到达率', '流动完整度', '物态模式'],
    geometryLabel: '通道宽度',
    recommendation: '推荐：先运行拥堵基线，再使用“局部松动”作为单次扰动。',
    perturbations: freeze([
      freeze({ type: 'release', label: '局部松动', symbol: '◌' }),
      freeze({ type: 'soften', label: '提高形变', symbol: '≈' }),
      freeze({ type: 'pulse', label: '施加推动', symbol: '→' })
    ])
  })
});

export const DEFAULT_SCENARIO_ID = 'narrow-gap';

export function getScenario(id) {
  return SCENARIOS[id] || SCENARIOS[DEFAULT_SCENARIO_ID];
}

export function buildGeometry(scenario, config, runtime = {}) {
  const width = 960;
  const height = 540;
  const gapWidth = runtime.gapWidth ?? config.gapWidth;
  const barrierX = scenario.id === 'budding' ? 602 : scenario.id === 'leader-follower' ? 560 : 548;
  const obstacles = [];
  const guidanceObstacles = [];
  const openings = [];

  if (scenario.geometryKind === 'single-barrier' || scenario.geometryKind === 'soft-boundary') {
    const gapY = scenario.id === 'budding' ? 250 : 270;
    const half = gapWidth / 2;
    const segments = [
      { x: barrierX - 7, y: 0, width: 14, height: gapY - half, kind: 'wall' },
      { x: barrierX - 7, y: gapY + half, width: 14, height: height - gapY - half, kind: 'wall' }
    ];
    guidanceObstacles.push(...segments);
    if (scenario.geometryKind !== 'soft-boundary') obstacles.push(...segments);
    openings.push({ x: barrierX, y: gapY, width: 26, height: gapWidth });
  } else if (scenario.geometryKind === 'branching-barrier') {
    const gapA = 188;
    const gapB = 352;
    const half = gapWidth / 2;
    const segments = [
      [0, gapA - half],
      [gapA + half, gapB - half],
      [gapB + half, height]
    ];
    for (const [start, end] of segments) {
      if (end > start) {
        const segment = { x: barrierX - 7, y: start, width: 14, height: end - start, kind: 'wall' };
        obstacles.push(segment);
        guidanceObstacles.push(segment);
      }
    }
    openings.push({ x: barrierX, y: gapA, width: 26, height: gapWidth });
    openings.push({ x: barrierX, y: gapB, width: 26, height: gapWidth });
  } else if (scenario.geometryKind === 'compression-channel') {
    const channelWidth = gapWidth + (runtime.channelRelease ?? 0);
    const top = 270 - channelWidth / 2;
    const bottom = 270 + channelWidth / 2;
    const upper = { x: 470, y: 0, width: 290, height: Math.max(0, top), kind: 'matrix' };
    const lower = { x: 470, y: bottom, width: 290, height: Math.max(0, height - bottom), kind: 'matrix' };
    obstacles.push(upper, lower);
    guidanceObstacles.push(upper, lower);
    openings.push({ x: 615, y: 270, width: 290, height: channelWidth });
  }

  return {
    kind: scenario.geometryKind,
    width,
    height,
    barrierX,
    obstacles,
    guidanceObstacles: guidanceObstacles.length ? guidanceObstacles : obstacles,
    openings,
    targetPoints: scenario.targetPoints,
    labels: {
      left: scenario.id === 'budding' ? '肿瘤主体' : '细胞群',
      obstacle: scenario.id === 'unjamming' ? '受压缩通道' : scenario.id === 'leader-follower' ? '分叉屏障' : '组织边界',
      source: '扩散型引导场 →'
    }
  };
}

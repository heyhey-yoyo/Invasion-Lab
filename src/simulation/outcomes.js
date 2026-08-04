const MODES = Object.freeze({
  jammed: { id: 'jammed', label: 'Jammed｜拥堵' },
  unjamming: { id: 'unjamming', label: 'Unjamming｜解堵' },
  'collective-advance': { id: 'collective-advance', label: 'Collective Advance｜集体推进' },
  'tumor-budding': { id: 'tumor-budding', label: 'Tumor Budding｜肿瘤出芽' },
  'single-cell-escape': { id: 'single-cell-escape', label: 'Single-cell Escape｜单细胞逃逸' },
  fingering: { id: 'fingering', label: 'Fingering｜指状侵袭' },
  'stable-cluster': { id: 'stable-cluster', label: 'Stable Cluster｜稳定团块' },
  'leader-guided': { id: 'leader-guided', label: 'Leader-guided｜领头引导' },
  'split-migration': { id: 'split-migration', label: 'Split Migration｜分叉迁移' },
  'leader-failure': { id: 'leader-failure', label: 'Leader Failure｜引导失效' },
  'collective-flow': { id: 'collective-flow', label: 'Collective Flow｜集体流动' }
});

const mode = id => MODES[id] || MODES.fingering;

export function classifyOutcome(metrics, config) {
  const passRate = metrics.passRate ?? 0;
  const integrity = metrics.integrity ?? 1;
  const isolatedRate = metrics.isolatedRate ?? 0;
  const fragments = metrics.fragments ?? 1;

  if (config.scenarioId === 'budding') {
    if (isolatedRate > 0.34 && passRate > 0.12) return mode('single-cell-escape');
    if ((metrics.budCount ?? 0) > 0 || (fragments >= 2 && integrity < 0.84)) return mode('tumor-budding');
    if (passRate > 0.3) return mode('fingering');
    return mode('stable-cluster');
  }

  if (config.scenarioId === 'leader-follower') {
    if (metrics.jammed && passRate < 0.18) return mode('leader-failure');
    if ((metrics.branchCount ?? 0) >= 2 && passRate > 0.2) return mode('split-migration');
    if (passRate >= 0.3 && (metrics.leaderFollowerRate ?? 0) >= 0.48) return mode('leader-guided');
    if (passRate >= 0.32 && integrity >= 0.6) return mode('collective-advance');
    return mode('leader-failure');
  }

  if (config.scenarioId === 'unjamming') {
    if (metrics.unjammed || (metrics.mobilityGain ?? 0) > 0.35) return mode('unjamming');
    if ((metrics.passRate ?? 0) < 0.12 || (metrics.mobilityIndex ?? 0) < 0.24 || metrics.jammed) return mode('jammed');
    return mode('collective-flow');
  }

  if (passRate < 0.12 || (metrics.jammed && passRate < 0.25)) return mode('jammed');
  if (isolatedRate > 0.26 || (config.adhesion < 0.3 && passRate > 0.2)) return mode('single-cell-escape');
  if ((fragments >= 2 && config.adhesion < 0.7) || (integrity < 0.68 && config.adhesion < 0.68)) return mode('tumor-budding');
  if (passRate >= 0.35 && integrity >= 0.64) return mode('collective-advance');
  return mode('fingering');
}

export function explainOutcome(modeValue, metrics, config, perturbation) {
  const pct = Math.round((metrics.passRate || 0) * 100);
  const first = Number.isFinite(metrics.firstPassTime) ? `${metrics.firstPassTime.toFixed(1)} 秒` : '实验结束前';
  const perturb = perturbation ? `运行中施加的“${perturbation.label}”改变了局部条件。` : '本次没有施加额外扰动。';
  const common = {
    jammed: `这次实验形成明显拥堵。群体在受限区域积累压力，只有 ${pct}% 的细胞到达判定边界。`,
    unjamming: `这次实验出现解堵。群体运动能力相对早期基线明显上升，并形成持续流动；到达率为 ${pct}%。`,
    'collective-advance': `这次实验形成集体推进。细胞在约 ${first} 首次通过，并在维持主体连接的同时继续前进；最终通过率为 ${pct}%。`,
    'tumor-budding': `这次实验出现肿瘤出芽。主体仍然存在，但边缘形成了可独立运动的小型细胞簇；边界外比例为 ${pct}%。`,
    'single-cell-escape': `这次实验出现单细胞逃逸。较低黏附与较高形变使细胞更容易脱离主体；边界外比例为 ${pct}%。`,
    fingering: `这次实验形成指状侵袭。前沿被拉长，但尚未稳定转变为完整集体推进或大量单细胞逃逸。`,
    'stable-cluster': `这次实验保持稳定团块。边缘发生了形变，但没有形成满足判定条件的持续出芽。`,
    'leader-guided': `这次实验形成 leader 引导迁移。多数通过细胞选择了与 leader 一致的分支，跟随一致度为 ${Math.round((metrics.leaderFollowerRate || 0) * 100)}%。`,
    'split-migration': `这次实验出现分叉迁移。群体同时占据两个出口，说明多个方向线索超过了单一 leader 的组织能力。`,
    'leader-failure': `这次实验中 leader 引导未能形成稳定通路。群体在分叉前停滞或失去一致方向。`,
    'collective-flow': `这次实验保持集体流动，但没有出现足够明显的速度跃迁，因此未判定为解堵相变。`
  }[modeValue.id];
  return `${common} ${perturb}`;
}

export function recommendControl(modeValue, config) {
  const byMode = {
    jammed: '推荐对照：保持细胞行为不变，只放宽几何约束或提高形变能力。',
    unjamming: '推荐对照：使用同一随机种子撤销扰动，确认速度跃迁来自局部松动而非随机波动。',
    'collective-advance': '推荐对照：降低黏附，观察连续推进是否转变为出芽或分散逃逸。',
    'tumor-budding': '推荐对照：提高邻居对齐，观察小型细胞芽是否重新并入主体。',
    'single-cell-escape': '推荐对照：提高细胞黏附，观察分散逃逸是否转变为集体迁移。',
    fingering: '推荐对照：分别提高形变与开口宽度，比较哪个因素更能促成完整通过。',
    'stable-cluster': '推荐对照：只松动边缘黏附，观察主体边界是否开始形成小型细胞簇。',
    'leader-guided': '推荐对照：移除 leader，并保持其他参数与随机种子不变。',
    'split-migration': '推荐对照：提高 follower 对齐，观察群体是否重新选择单一分支。',
    'leader-failure': '推荐对照：增强跟随或扩大出口，区分组织失败与几何失败。',
    'collective-flow': '推荐对照：提高密度或降低形变，观察系统是否重新进入拥堵。'
  };
  return byMode[modeValue.id] || `推荐对照：固定场景 ${config.scenarioId} 与随机种子，只改变一个参数。`;
}

export function phaseLabel(id) {
  return mode(id).label;
}

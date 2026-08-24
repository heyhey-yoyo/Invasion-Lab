export const INTERVENTIONS = Object.freeze({
  control: Object.freeze({
    id: 'control',
    name: '未处理对照',
    description: '使用场景与细胞预设的校准基线。',
    matrixResistanceFactor: 1,
    matrixDegradationFactor: 1,
    nuclearComplianceFactor: 1,
    leaderSuppression: false
  }),
  'stiff-matrix': Object.freeze({
    id: 'stiff-matrix',
    name: '提高环境阻力',
    description: '提高 ECM 阻力并降低局部重塑效率。',
    matrixResistanceFactor: 1.48,
    matrixDegradationFactor: 0.78,
    nuclearComplianceFactor: 1,
    leaderSuppression: false
  }),
  'degradation-block': Object.freeze({
    id: 'degradation-block',
    name: '抑制基质降解',
    description: '保留细胞运动和力学，但显著抑制局部 ECM 降解。',
    matrixResistanceFactor: 1.08,
    matrixDegradationFactor: 0.08,
    nuclearComplianceFactor: 1,
    leaderSuppression: false
  }),
  'soft-nucleus': Object.freeze({
    id: 'soft-nucleus',
    name: '提高核柔顺性',
    description: '降低细胞核造成的狭窄通行限制，不直接改变细胞连接。',
    matrixResistanceFactor: 1,
    matrixDegradationFactor: 1,
    nuclearComplianceFactor: 1.34,
    leaderSuppression: false
  }),
  'leader-suppression': Object.freeze({
    id: 'leader-suppression',
    name: '抑制 Leader 形成',
    description: '阻止稳定 Leader 身份形成，用于比较群体机械组织的贡献。',
    matrixResistanceFactor: 1,
    matrixDegradationFactor: 1,
    nuclearComplianceFactor: 1,
    leaderSuppression: true
  })
});

export const SCENARIO_INTERVENTIONS = Object.freeze({
  'narrow-gap': Object.freeze(['stiff-matrix', 'soft-nucleus']),
  budding: Object.freeze(['degradation-block', 'stiff-matrix', 'soft-nucleus']),
  'leader-follower': Object.freeze(['leader-suppression', 'stiff-matrix']),
  unjamming: Object.freeze(['stiff-matrix', 'soft-nucleus'])
});

export function getIntervention(id) {
  return INTERVENTIONS[id] || INTERVENTIONS.control;
}

export function interventionsForScenario(scenarioId) {
  return (SCENARIO_INTERVENTIONS[scenarioId] || SCENARIO_INTERVENTIONS['narrow-gap'])
    .map(id => INTERVENTIONS[id]);
}

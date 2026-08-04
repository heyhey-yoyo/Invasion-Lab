# v4.0 架构说明

## 目标

v4 保持纯静态、零运行时依赖、固定种子确定性和少参数 UI，同时将环境从静态障碍升级为可交互 ECM，并加入动态 Leader 与可复现的单因素对照。

## 模块边界

- `simulation/engine.js`：位置、速度、形状、细胞核、接触网络、状态和 Leader 更新。
- `simulation/core/ecm-field.js`：低分辨率 ECM 密度、损伤、应变、纤维方向和双向作用。
- `simulation/core/spatial-hash.js`：确定性空间哈希，降低全量邻居搜索成本。
- `simulation/interventions.js`：离散处理定义，不暴露底层常数。
- `simulation/comparison.js`：相同随机种子下的对照/处理配对模拟与探索性汇总。
- `simulation/comparison-worker.js`：独立运行配对实验，避免阻塞 UI。
- `simulation/core/deformable-cell.js`：面积守恒椭圆、支撑半径、周长和障碍接触。
- `simulation/core/guidance-field.js`：稳态扩散型标量场及梯度采样。
- `simulation/scenarios/catalog.js`：场景初态、几何、目标、扰动和指标语义。
- `simulation/worker-runtime.js`：固定步长、播放速度和最终结果 exactly-once。
- `app.js`：UI、机制/显微视图、ECM/细胞渲染、回放、导出、批量地图与对照实验。

## 帧格式

v4 stride 为 20：

```text
0 x                         10 branch
1 y                         11 shapeAngle
2 vx                        12 nucleusStrain
3 vy                        13 contactCount
4 contactStressProxy        14 stateCode
5 passed                    15 normalizedTraction
6 isLeader                  16 localECMDensity
7 shapeStrain               17 localECMDamage
8 isolated                  18 collectiveSignalStrength
9 cohort                    19 highNuclearStrainDuration
```

每帧还包含 `ecm`：`columns`、`rows`、`cellSize` 和四通道 `Uint8Array packed`（密度、损伤、纤维 x、纤维 y）。

## 数据流

1. UI 通过 `makeConfig()` 生成版本化配置；
2. 实时 Worker 构建场景、引导场和 ECM；
3. 固定 `1/30` 模拟秒更新细胞与低频 ECM；
4. Worker 传输细胞 Float32 帧和压缩 ECM Uint8 帧；
5. UI 从同一模型状态绘制边界、细胞核、应力、状态和 ECM；
6. Lab 对照由独立 comparison Worker 用配对种子顺序运行，避免与实时 Worker 共享状态。

## 性能策略

- 空间哈希生成确定性候选邻居对；
- 每个细胞只保存低维形状张量，而非整张相场；
- ECM 使用 20 px 网格并以 TypedArray 存储；
- ECM 松弛和快照与细胞积分分离；
- Worker 限制每 tick 最大步数；
- 对照实验固定 3–7 个种子，默认 5 个；
- 批量模式降低细胞数和最大时间。

任何帧字段、schema 或随机调用顺序变更都必须升级版本并补充确定性测试。

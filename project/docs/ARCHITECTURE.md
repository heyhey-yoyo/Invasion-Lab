# v2.0 架构说明

## 目标

v2 的架构目标不是“支持任意生物模型”，而是让四个明确场景共享可测试、可替换的核心边界：

1. 配置与版本；
2. 场景定义；
3. 方向—力学引擎；
4. 事件与指标；
5. 结果分类与解释；
6. Worker 调度；
7. 批量运行；
8. UI、回放与导出。

## 数据流

```text
UI selection
  → makeConfig()
  → Simulation Worker init
  → SimulationEngine
  → scenario geometry + direction/force update
  → frame + events + metrics
  → UI rendering / replay
  → scenario-aware outcome
  → JSON / CSV / local project

Lab batch request
  → dedicated Batch Worker
  → runBatchScan()
  → point-level progress + multi-seed consensus map
```

## 边界职责

### `scenarios/catalog.js`

定义场景名称、问题、默认值、初始中心、几何类型、迁移目标、扰动按钮和指标文案。它不实现积分器，也不直接操作 DOM。

### `config.js`

负责输入清洗、范围限制、v1 迁移、版本字段、配置哈希与场景哈希。所有入口都必须经过 `makeConfig()`。

### `engine.js`

唯一的位置和速度更新引擎。场景通过几何和少量规则参数影响引擎；方向层不会绕过力学层直接修改位置。

### `outcomes.js`

结果分类是场景感知的。同一组通用指标在不同场景下可以映射为不同的教学模式，例如 `leader-guided` 或 `unjamming`。

### `batch.js` 与 `batch-worker.js`

对每个参数格点运行多个真实模拟，而不是调用静态启发式着色。批量运行降低细胞数与时长，返回主导模式、一致度和均值指标。独立 Batch Worker 与实时 Simulation Worker 隔离，避免参数扫描阻塞实验时间推进，并在每个格点结束后发送进度。

### `worker-runtime.js`

使用固定 `1/30` 模拟秒时间步和真实经过时间累积。限制单次 tick 最大步数，避免浏览器恢复前台时出现巨量追帧。

## 可替换性

未来接入 Artistoo 时，推荐保留以下接口：

- `SimulationEngine(config)`；
- `step(dt)`；
- `applyPerturbation(type)`；
- `getFrame()`；
- `getResult()`。

UI、Worker、批量地图、迁移和导出可继续复用。Artistoo 适配层必须明确说明与当前软粒子模型在形态、黏附和连通性定义上的差异。

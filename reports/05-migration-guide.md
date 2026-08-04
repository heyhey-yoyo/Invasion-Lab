# v1.1.0 → v2.0.0 迁移说明

## 自动兼容

- 原 URL 参数 `p/a/d/l/r/z/v/h/g/s/n/t` 继续支持；
- 新增 `q` 表示场景 ID；
- 缺少 `q` 时默认使用 `narrow-gap`；
- v1 本地项目键 `iwt-project-v1` 可被 v2 读取并迁移；
- 原四个 preset ID 保留。

## 数据格式变化

### 配置

新增：

- `schemaVersion`；
- `scenarioId`；
- `scenarioVersion`；
- `scenarioCatalogVersion`；
- `configHash`；
- `scenarioHash`。

### 模拟帧

- v1 stride：9；
- v2 stride：11；
- 新增 cohort 和 branch 字段；
- 几何从固定 `barrierX/gapY/gapWidth` 升级为 `meta.geometry`。

解析方必须读取 `meta.stride`，不得假设固定长度。

### 结果 JSON

结果 schema 升级为 2，新增：

- `scenario`；
- `reproducibility`；
- `scientificScope`；
- 更多场景指标。

## 行为变化

- 侵袭地图从启发式着色改为真实多随机种子模拟；
- 分类规则按场景变化；
- v2 中 preset 表示“行为人格”，场景几何由 `scenarioId` 单独决定；
- 拥堵与解堵场景的“局部松动”是持续性几何改变，用于观察相变。

## 回滚

v2 不覆盖 v1 的源码包或本地存储键。需要回滚时部署 v1.1.0 静态包即可；v2 保存的 schema 2 项目不会被 v1 自动读取。

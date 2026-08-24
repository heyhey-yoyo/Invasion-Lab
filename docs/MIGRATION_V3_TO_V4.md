# v3.0.0 → v4.0.0 迁移说明

## 保存配置

- v4 本地保存键为 `iwt-project-v4`；
- 载入时依次尝试 v4、v3、v2、v1；
- 旧配置默认迁移为 `interventionId: "control"`；
- 迁移后重新生成配置和场景哈希。

## 格式变化

- 配置 schema：3 → 4；
- 结果 schema：3 → 4；
- frame stride：14 → 20；
- 新增独立 ECM 快照；
- 新增处理组、动态细胞状态、Leader 历史和 ECM 指标；
- 场景目录版本升级到 `2026.08-v4`。

## 帧字段

原 0–13 字段保持顺序；新增：

```text
14 stateCode
15 normalizedTraction
16 localECMDensity
17 localECMDamage
18 collectiveSignalStrength
19 highNuclearStrainDuration
```

解析器应使用 `meta.stride`，并在存在时读取 `frame.ecm`。

## 兼容性

v4 可读取 v3 配置，但 v3 不识别 v4 的处理组、ECM 帧或 schema 4 结果。回滚时部署独立 v3 包，不要用 v3 覆盖 v4 保存数据。

# Invasion Wind Tunnel（肿瘤侵袭风洞） — 项目说明（供 AI 编程代理阅读）

本文件为在本仓库工作的 AI 编码代理提供指引。修改代码前请先阅读本文件。

## 项目概览

**Invasion Wind Tunnel** 是一个可部署的纯前端多场景实验室，用于肿瘤细胞群体侵袭的定性机制实验。v4.0 在面积守恒可变形细胞与显式细胞核基础上，加入可降解/可重塑 ECM、动态 Leader 竞争、接触网络方向传播和配对随机种子对照。

- 零运行时依赖，可静态部署（Cloudflare Pages / Netlify / Vercel）。
- Node.js >= 20（`.node-version` 锁定 22.16.0），全部使用 ESM 模块。

### 科学边界（不可违反）

- 本项目是**机制探索、教学与定性假设比较工具**，不可用于临床预测、患者分层或治疗决策。任何输出、指标或文案都不得暗示临床用途。
- 模型是二维主动可变形细胞近似，**不是完整 Cellular Potts、相场、顶点、有限元或三维模型**。Artistoo 仅作为设计参考，未嵌入其运行时代码；若未来引入第三方实现，必须单独记录差异、版本与许可证。
- 用户主界面只保留少量有明确生物学意义的宏观控制。膜张力、核刚度、阻尼、扩散率等校准常数不得无理由暴露为普通参数。

## 仓库结构

- 仓库根目录即项目根目录，**也是站点根目录**（`index.html`、`app.js`、`simulation/`、`presets/`、`_headers` 等直接在根目录，可零构建发布）。`scripts/`、`tests/`、`docs/` 不参与部署。
- `simulation/core/deformable-cell.js`：面积守恒形状张量、椭圆支撑半径、周长/形状指数与障碍接触。
- `simulation/core/guidance-field.js`：低分辨率稳态扩散型引导场与局部梯度采样。
- `simulation/core/ecm-field.js`：ECM 密度、损伤、应变与纤维方向。
- `simulation/core/spatial-hash.js`：确定性邻居候选搜索。
- `simulation/interventions.js` / `comparison.js`：离散处理与配对随机种子对照。
- `docs/`：架构、模型、场景、验证、部署、迁移与科学范围文档。

## 架构边界

- `simulation/scenarios/catalog.js`：只定义场景名称、默认值、初始几何、扰动与指标文案。不包含积分器，不碰 DOM。
- `simulation/config.js`：所有输入必须经过 `makeConfig()`（消毒、钳制、旧版迁移、版本字段、配置/场景哈希）。
- `simulation/engine.js`：唯一的状态积分引擎。方向层只产生驱动力，绝不直接改写位置。
- `simulation/model.js`：模块门面（聚合重导出 + `heuristicPhase` 启发式预测），状态更新仍以 `engine.js` 为准，改动时保持门面语义。
- `simulation/outcomes.js`：场景感知的结果分类；同一通用指标可按场景映射到不同教学模式。
- `simulation/batch.js` / `batch-worker.js`：专用批量 Worker 运行真实多随机种子模拟。
- `simulation/comparison.js` / `comparison-worker.js`：独立配对对照 Worker。
- `simulation/worker-runtime.js`：固定 `1/30` 模拟秒时间步；限制每 tick 步数，避免追帧风暴。
- `app.js`：UI、回放、导出、形态/细胞核渲染与批量地图交互。
- `service-worker.js`：PWA 离线缓存。

## 版本与可复现性（改动时保持同步）

- `simulation/versions.js`：`APP_VERSION`、`MODEL_VERSION`、`CONFIG_SCHEMA_VERSION`、`RESULT_SCHEMA_VERSION`、`SCENARIO_CATALOG_VERSION`。
- 帧数据 stride（当前 20）与结果 JSON `schemaVersion`（当前 4）是破坏性格式变更：必须升级版本，并记录到对应迁移文档与 `README.md`。
- 每条结果必须记录：应用/模型/场景/schema 版本、随机种子、配置哈希、场景哈希、事件时间线与科学边界声明。
- 随机性必须保持确定：种子钳制在 `1..2^32-1`；相同模型版本 + 配置 + 种子产生完全相同的帧与事件。不要引入全局非确定性来源。
- 面积守恒误差、细胞核应变、形状指数、接触数、ECM 重塑和 Leader 更替属于 v4 科学回归指标，修改力学时必须检查。

## 标准命令（改动后必须验证）

```bash
npm ci
npm run validate     # 静态结构、资源、语法、离线清单
npm run scan         # 敏感文件与凭据模式检查
npm test             # 33 项自动化测试
npm run build        # 构建到 dist/
npm run smoke        # 本地 HTTP 冒烟（10 条路由）
npm run check        # 以上全部
```

- 新增场景、实验预设、配置字段、Worker 行为或导出格式时，**必须**在 `tests/` 中补充覆盖确定性与边界情况的对应测试。
- `npm run check` 全绿之前不得宣称完成。

## 场景与实验预设

- 场景（`scenarios/catalog.js`）：`narrow-gap`、`budding`、`leader-follower`、`unjamming`；每个场景有版本、默认值、扰动集与指标文案。
- 实验预设（`profiles.js`）：`jam`、`collective`、`budding`、`escape`；可跨场景组合；保留 `LEGACY_PRESET_ALIASES` 用于旧版迁移。
- 面向普通用户的核心控制只包括：细胞连接强度、细胞柔顺性、群体引导；场景可额外提供一个关键几何参数。
- 新场景必须定义几何、目标、扰动、指标、结果规则与测试——不要重复整个模拟器。

## 部署约定

- Cloudflare Pages（零配置）：Framework preset 选 None，Build command 留空，Build output directory 留空，根目录即站点根目录。仓库根目录已是完整站点，无需构建步骤。
- 安全响应头来自根目录 `_headers`；`npm run build` 可生成 `dist/` 快照供需要构建输出目录的平台使用；`netlify.toml` 与 `vercel.json` 供对应平台使用。
- 不要添加长期 Cache Rules：HTML、Service Worker 与 manifest 已设置 `no-cache`；其余资源使用平台默认值与 ETag。

## 工作约定

- 做小而增量的修改；保持模块边界；避免无必要的大规模重构。
- 编辑前先读相关模块及其测试；沿用现有风格（ESM、`node:` 导入、`Object.freeze` 常量）。
- 在 Windows 上遇到编码问题，优先用 Python 或 Node 脚本处理文件操作；不要建议修改用户系统配置。
- 文档与交付物以中文为主；代码标识符保持英文。
- 每次改动应通过 `npm run check`，提交信息注明版本/格式影响。

---

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（包括未来的你自己）都必须遵守：**
>
> - 修改模型、场景或配置字段时，必须保持固定种子确定性并补充对应测试
> - 变更帧 stride 或结果 schema 时，必须同步升级 `versions.js` 并更新迁移文档
> - 不得把大量底层力学常数暴露到默认 UI
> - `npm run check` 全绿之前不得宣称完成

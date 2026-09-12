# Invasion Wind Tunnel（肿瘤侵袭风洞） — 项目说明（供 AI 编程代理阅读）

本文件为在本仓库工作的 AI 编码代理提供指引。修改代码前请先阅读本文件。

## 项目概览

**Invasion Wind Tunnel** 是一个可部署的纯前端多场景实验室，用于肿瘤细胞群体侵袭的定性机制实验。当前版本在面积守恒可变形细胞与显式细胞核基础上，加入可降解/可重塑 ECM、动态 Leader 竞争、接触网络方向传播和配对随机种子对照。

- 零运行时依赖，可静态部署（Cloudflare Pages / Netlify / Vercel）
- Node.js >= 20（`.node-version` 锁定 22.16.0），全部使用 ESM 模块

### 科学边界（不可违反）

- 本项目是**机制探索、教学与定性假设比较工具**，不可用于临床预测、患者分层或治疗决策。任何输出、指标或文案都不得暗示临床用途
- 模型是二维主动可变形细胞近似，**不是完整 Cellular Potts、相场、顶点、有限元或三维模型**。Artistoo 仅作为设计参考，未嵌入其运行时代码；若未来引入第三方实现，必须单独记录差异、版本与许可证
- 用户主界面只保留少量有明确生物学意义的宏观控制。膜张力、核刚度、阻尼、扩散率等校准常数不得无理由暴露为普通参数

## 技术栈与运行架构

仓库根目录即项目根目录，**也是站点根目录**（`index.html`、`app.js`、`simulation/`、`presets/`、`_headers` 等直接在根目录，可零构建发布）。`scripts/`、`tests/`、`docs/` 不参与部署。

### 架构边界

- `simulation/scenarios/catalog.js`：只定义场景名称、默认值、初始几何、扰动与指标文案。不包含积分器，不碰 DOM
- `simulation/config.js`：所有输入必须经过 `makeConfig()`（消毒、钳制、旧版迁移、版本字段、配置/场景哈希）
- `simulation/engine.js`：唯一的状态积分引擎。方向层只产生驱动力，绝不直接改写位置
- `simulation/model.js`：模块门面（聚合重导出 + `heuristicPhase` 启发式预测），状态更新仍以 `engine.js` 为准
- `simulation/outcomes.js`：场景感知的结果分类
- `simulation/batch.js` / `batch-worker.js`：专用批量 Worker 运行真实多随机种子模拟
- `simulation/comparison.js` / `comparison-worker.js`：独立配对对照 Worker
- `simulation/worker-runtime.js`：固定 `1/30` 模拟秒时间步；限制每 tick 步数，避免追帧风暴
- `app.js`：UI、回放、导出、形态/细胞核渲染与批量地图交互
- `service-worker.js`：PWA 离线缓存

## 项目结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面入口 |
| `app.js` | UI、回放、导出、形态/细胞核渲染与批量地图交互 |
| `styles.css` | 全部样式 |
| `service-worker.js` | PWA 离线缓存 |
| `manifest.webmanifest` / `404.html` / `robots.txt` | PWA 清单、自定义 404、抓取规则 |
| `_headers` | Cloudflare Pages 安全响应头 |
| `simulation/engine.js` | 多尺度细胞—细胞核—ECM 积分器（唯一状态积分引擎） |
| `simulation/config.js` | 配置入口 `makeConfig()`（消毒、钳制、旧版迁移、版本字段、配置/场景哈希） |
| `simulation/model.js` | 模块门面（聚合重导出 + `heuristicPhase` 启发式预测） |
| `simulation/outcomes.js` | 场景感知的结果分类 |
| `simulation/interventions.js` | 少量离散实验处理 |
| `simulation/profiles.js` | 实验预设（jam / collective / budding / escape）与旧版别名迁移 |
| `simulation/versions.js` | 版本常量（APP / MODEL / CONFIG_SCHEMA / RESULT_SCHEMA / SCENARIO_CATALOG） |
| `simulation/comparison.js` / `simulation/comparison-worker.js` | 配对随机种子单因素对照（独立 Worker） |
| `simulation/batch.js` / `simulation/batch-worker.js` | 多随机种子参数扫描（专用批量 Worker） |
| `simulation/worker.js` | 实时模拟 Worker 入口（驱动 `worker-runtime.js`） |
| `simulation/worker-runtime.js` | 固定时间步实时 Worker |
| `simulation/core/deformable-cell.js` | 面积守恒边界与形状相关接触 |
| `simulation/core/ecm-field.js` | ECM 密度、损伤、应变与纤维场 |
| `simulation/core/spatial-hash.js` | 确定性空间哈希邻居搜索 |
| `simulation/core/guidance-field.js` | 绕障碍稳态扩散型引导场 |
| `simulation/core/components.js` | 细胞群落连通分量等组件工具 |
| `simulation/core/hash.js` | `stableStringify` 与 FNV-1a 32 位稳定哈希 |
| `simulation/core/rng.js` | 确定性随机数发生器（mulberry32 风格） |
| `simulation/scenarios/catalog.js` | 场景几何、初态、扰动与语义 |
| `presets/` | 4 个内置实验预设（jam / collective / budding / escape，JSON） |
| `scripts/` | 构建、静态校验、凭据扫描、本地服务与 HTTP 冒烟脚本（`*.mjs`） |
| `tests/` | 33 项自动化测试（5 个 `*.test.mjs`） |
| `docs/` | 迁移与参考文献等 12 篇文档 |
| `assets/` | 图标（`icon.svg`、`icon-192.png`、`icon-512.png`）与 `project-mark.svg` |
| `netlify.toml` / `vercel.json` | 对应平台部署配置 |
| `release-manifest.json` | 发布清单 |
| `package.json` / `package-lock.json` | npm 脚本与锁定依赖（无运行时依赖） |
| `.node-version` | Node 版本锁定（22.16.0） |
| `THIRD_PARTY_NOTICES.md` / `LICENSE` | 第三方声明与 MIT 许可证 |
| `.gitignore` | Git 忽略规则（含 `dist/` 构建产物） |

## 运行与构建

```bash
npm ci
npm run validate     # 静态结构、资源、语法、离线清单
npm run scan         # 敏感文件与凭据模式检查
npm test             # 33 项自动化测试
npm run build        # 构建到 dist/
npm run smoke        # 本地 HTTP 冒烟（10 条路由）
npm run check        # 以上全部
```

## 测试

新增场景、实验预设、配置字段、Worker 行为或导出格式时，**必须**在 `tests/` 中补充覆盖确定性与边界情况的对应测试。`npm run check` 全绿之前不得宣称完成。

发布检查：

```bash
npm run check
```

## 代码组织与风格约定

### 版本与可复现性（改动时保持同步）

- **对外版本号以 GitHub Release 为准**；页面不显示版本号
- `simulation/versions.js`：`APP_VERSION`、`MODEL_VERSION`、`CONFIG_SCHEMA_VERSION`、`RESULT_SCHEMA_VERSION`、`SCENARIO_CATALOG_VERSION`。`APP_VERSION` 与应用发布版本保持一致；`MODEL_VERSION` 按科学模型行为独立演进；schema/场景版本为内部格式版本，独立演进
- 帧数据 stride（当前 20）与结果 JSON `schemaVersion`（当前 4）是破坏性格式变更：必须升级版本，并记录到对应迁移文档与 `README.md`
- 每条结果必须记录：应用/模型/场景/schema 版本、随机种子、配置哈希、场景哈希、事件时间线与科学边界声明
- 随机性必须保持确定：种子钳制在 `1..2^32-1`；相同模型版本 + 配置 + 种子产生完全相同的帧与事件。不要引入全局非确定性来源
- 面积守恒误差、细胞核应变、形状指数、接触数、ECM 重塑和 Leader 更替属于 v4 科学回归指标，修改力学时必须检查

### 场景与实验预设

- 场景（`scenarios/catalog.js`）：`narrow-gap`、`budding`、`leader-follower`、`unjamming`；每个场景有版本、默认值、扰动集与指标文案
- 实验预设（`profiles.js`）：`jam`、`collective`、`budding`、`escape`；可跨场景组合；保留 `LEGACY_PRESET_ALIASES` 用于旧版迁移
- 面向普通用户的核心控制只包括：细胞连接强度、细胞柔顺性、群体引导；场景可额外提供一个关键几何参数
- 新场景必须定义几何、目标、扰动、指标、结果规则与测试——不要重复整个模拟器

### 工作约定

- 做小而增量的修改；保持模块边界；避免无必要的大规模重构
- 编辑前先读相关模块及其测试；沿用现有风格（ESM、`node:` 导入、`Object.freeze` 常量）
- 在 Windows 上遇到编码问题，优先用 Python 或 Node 脚本处理文件操作；不要建议修改用户系统配置
- 文档与交付物以中文为主；代码标识符保持英文
- 每次改动应通过 `npm run check`，提交信息注明版本/格式影响

### 品牌与排版

本项目为普通项目类。页眉桌面 72px、手机（≤640px）64px；方章 48×48px / 40×40px，标题衬线 18px/400/1.3、手机 16px，副标题无衬线 12px/400/1.4；标志与标题间距 12px，标题与副标题间距 2px。

页眉背景和底部分隔线横跨页面可用宽度，内容区最大宽度 1280px（含两侧各 16px 内边距），整体居中；品牌和标题靠左，操作区靠右，窄屏换行后仍保持该对齐。品牌页眉在文档顶部正常排布，随页面滚走，不固定或吸顶；表格内部表头、侧边工具和手机底部导航可按功能保留。

正文采用统一系统无衬线字体，默认 16px / 1.6；标题采用 Georgia、Times New Roman、Songti SC、STSong 衬线族。数字与代码可使用 SFMono-Regular、Consolas、Liberation Mono、Microsoft YaHei 等宽族。按钮和输入通常 15px，辅助文字 12–14px，密集科学数据允许有理由的局部调整。页面底色 #f3eee5、正文 #24221f、赤陶强调 #a94f31，柔和底色上的强调文字 #823a25；科学分类色、热图、作品主题与状态色保留必要区分度。

主样式保留一个顶层 `:root`，条件规则和深色画布局部令牌独立维护，避免叠加重复主题或末尾覆盖层。修改视觉后核对实际渲染字体、字号、间距、对比度和操作可达性；至少检查 1440、820、390px，涉及断点时补查两侧宽度，涉及画布或存储时补查交互。构建、单测、本地浏览器和线上部署分别记录；发布后禁用缓存/硬刷新，并核对实际资源版本。

页眉外层保持 width:100%、max-width:none，水平内边距为 max(16px,calc((100% - 1280px)/2 + 16px))；按包含块宽度计算，避免 100vw 将滚动条计入而产生溢出。手机以 16px 留白，保持标题及操作可达。

### 交互与数据约束

模型保持 960×540 逻辑空间，缓冲按实际矩形与 min(DPR,2) 缩放，指针使用一致映射。桌面模式与说明按钮共同靠右；手机模式导航保留在底部，页眉不设置会改变 fixed 包含块的 backdrop-filter 或 transform。样式 URL、离线清单与缓存名同步，资源校验按 URL 路径解析。

### 界面维护约定

工作台使用 `ydchen-portfolio` 的米白 / 赤陶色视觉系统；视觉修改不得改变模拟模型、控制含义、结果 schema、固定种子确定性或科学边界。视觉验收以正文 16px、操作与比较标签不小于 12px 为基线；主按钮需满足浅色背景对比度，并在 1440px 桌面与 390px 手机视口检查整体横向溢出。

## 部署

- Cloudflare Pages（零配置）：Framework preset 选 None，Build command 留空，Build output directory 留空，根目录即站点根目录。仓库根目录已是完整站点，无需构建步骤
- 安全响应头来自根目录 `_headers`；`npm run build` 可生成 `dist/` 快照供需要构建输出目录的平台使用；`netlify.toml` 与 `vercel.json` 供对应平台使用
- 不要添加长期 Cache Rules：HTML、Service Worker 与 manifest 已设置 `no-cache`；其余资源使用平台默认值与 ETag

## 安全与数据注意事项

- 所有模拟与计算仅在浏览器本地运行，不发起网络请求、不上传数据；项目数据只保存在浏览器 `localStorage`（保存键 `iwt-project-v4`，含 v1–v3 项目自动迁移）。
- 安全响应头来自根目录 `_headers`（CSP 等）；`npm run scan` 做敏感文件与凭据模式检查，提交前必须通过。

## 标志维护约定

项目标志采用统一的深灰方章、米白线条与赤陶色识别点，页面标志与 favicon 共用同一 `assets/project-mark.svg`。后续替换必须保持原标志容器宽高，不得借机改变页眉、网格或页面布局。

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（包括未来的你自己）都必须遵守：**
>
> - 修改模型、场景或配置字段时，必须保持固定种子确定性并补充对应测试
> - 变更帧 stride 或结果 schema 时，必须同步升级 `versions.js` 并更新迁移文档
> - 不得把大量底层力学常数暴露到默认 UI
> - `npm run check` 全绿之前不得宣称完成

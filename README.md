# Invasion Wind Tunnel 2｜肿瘤侵袭风洞

纯前端、可静态部署的二维癌细胞群体侵袭机制实验室。v2.0 将 v1.1 的单一狭窄缺口演示升级为模块化多场景系统，同时保持 Play 模式的低门槛体验。

> 科学边界：本项目用于机制探索、教学和定性假设比较，不用于临床预测、患者分层或治疗决策。

## v2.0 主要能力

- 四个场景：狭窄缺口、肿瘤出芽、Leader–Follower、拥堵与解堵；
- 四种行为人格，可跨场景组合；
- 场景专属几何、扰动、事件、指标语义和结果分类；
- Web Worker 固定时间步模拟；
- 固定随机种子、配置哈希、场景哈希和模型版本记录；
- 独立 Batch Worker 运行多随机种子侵袭地图，显示逐格进度、主导模式与一致度；
- 关键事件时间线与前后回放；
- JSON、CSV、PNG、URL 分享和本地项目保存；
- v1 项目设置自动迁移；
- PWA 离线缓存；
- 零运行时依赖，可部署到 Cloudflare Pages、GitHub Pages、Netlify、Vercel 或任意静态服务器。

## 快速开始

要求 Node.js 20 或更高版本。

```bash
npm ci
npm run check
npm run dev
```

打开 `http://localhost:4173`。

常用命令：

```bash
npm run validate       # 静态结构、资源、语法与离线资产检查
npm run scan           # 敏感文件、凭据模式与异常大文件检查
npm test               # 全部自动化测试
npm run test:scenarios # 场景与结果回归测试
npm run test:batch     # 多随机种子批量地图测试
npm run build          # 构建到 dist/
npm run preview        # 预览已构建的 dist/
```

## 部署

构建命令：

```text
npm run build
```

发布目录：

```text
dist
```

项目不需要环境变量、后端、数据库或自定义服务器响应头。Cloudflare Pages 会读取构建产物中的 `_headers`；其他平台的安全响应头位于 `netlify.toml` 和 `vercel.json`。

### Cloudflare Pages（零配置）

仓库根目录即项目根目录，连接 Git 仓库后按以下方式设置即可：

- Framework preset：None
- Build command：`npm run build`
- Build output directory：`dist`

无需设置 Root directory（默认即为仓库根）。交付归档与审查材料位于 `delivery/`，不参与构建。Node.js 版本读取 `.node-version`。

## 项目结构

```text
Invasion-Lab/
├── package.json                   # 项目与脚本（根目录即项目根）
├── .node-version                  # Node 版本（22.16.0）
├── src/                           # 源码（见下方架构）
├── public/                        # 静态资源与 _headers / 404
├── presets/                       # 场景预置 JSON
├── scripts/                       # 构建、校验、扫描、smoke 脚本
├── tests/                         # 22 个自动化测试（node --test）
├── docs/                          # 架构、模型、场景、部署等文档
├── .github/                       # CI 与 GitHub Pages 工作流
├── delivery/                      # 交付归档（不参与构建）
│   ├── baseline/  release/  reports/  diffs/
│   └── checksums.txt              # 交付文件 SHA-256
└── AGENTS.md                      # 通用 AI 代理指南（见下）
```

## 架构

```text
src/
├── app.js                         # UI、回放、导出与批量地图交互
├── simulation/
│   ├── versions.js                # 应用、模型与数据格式版本
│   ├── profiles.js                # 行为人格
│   ├── config.js                  # 校验、迁移与哈希
│   ├── outcomes.js                # 场景感知的结果分类和解释
│   ├── engine.js                  # 通用软粒子方向—力学引擎
│   ├── batch.js                   # 多随机种子参数扫描
│   ├── batch-worker.js            # 独立批量运行线程与进度
│   ├── worker-runtime.js          # 固定时间步运行时
│   ├── worker.js                  # Worker 入口
│   ├── core/                      # RNG、哈希、连通分量
│   └── scenarios/catalog.js       # 场景定义与几何构建
└── service-worker.js              # PWA 离线缓存
```

场景层只定义“初始条件、几何、目标、扰动和语义”，不会直接复制整套模拟器。详见：

- `docs/ARCHITECTURE.md`
- `docs/MODEL.md`
- `docs/SCENARIOS.md`
- `docs/MIGRATION_V1_TO_V2.md`
- `docs/VALIDATION.md`
- `docs/DEPLOYMENT.md`
- `docs/REFERENCES.md`

## AI 开发 Agent

仓库根目录提供通用 `AGENTS.md`，供 CodeBuddy、Claude Code、Cursor 等 AI 编码代理自动读取。它封装了本项目的架构边界、版本与可复现性约束、标准验证命令（`npm run check`）和部署约定，适合在新增场景、修改引擎、更新测试与交付物时使用。

## 可复现性

每份结果包含：

- 应用版本；
- 模型版本；
- 场景版本；
- 配置 schema 版本；
- 随机种子；
- 配置哈希；
- 场景哈希；
- 扰动；
- 事件时间线；
- 模型科学边界声明。

相同模型版本、配置和随机种子会产生相同模拟帧与事件。不同浏览器的浮点实现通常一致，但本项目不将跨任意未来运行时的逐位一致性作为科学承诺。

## v1 兼容性

v1 的 URL 参数名称继续受支持；缺少场景字段时默认迁移到 `narrow-gap`。本地保存会优先读取 `iwt-project-v2`，找不到时尝试迁移 `iwt-project-v1`。

v2 的帧数据 stride 从 9 增加到 11，结果 JSON schema 从 1 升级到 2。第三方解析程序应根据 `schemaVersion` 和 `meta.stride` 读取，而不是假设固定数组长度。

## 许可证

项目代码使用 MIT License。当前版本没有第三方运行时依赖；后续若接入 Artistoo，必须单独审查其许可证、引用要求与模型差异。

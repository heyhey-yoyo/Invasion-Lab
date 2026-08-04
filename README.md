# Invasion Wind Tunnel 4｜肿瘤侵袭风洞

纯前端、可静态部署的二维癌细胞群体侵袭机制实验室。v4 在 v3 的面积守恒可变形细胞和显式细胞核基础上，加入**可降解/可重塑 ECM、动态 Leader 竞争、接触网络方向传播、细胞状态转换和配对随机种子对照实验**。

> 科学边界：本项目用于机制探索、教学和定性假设比较，不用于临床预测、患者分层或治疗决策。

## v4.0.1 审查维护版

本维护版不增加可调参数或运行时依赖，修正了首次边界接触事件、Leader 路线传播、Worker 旧任务串扰、键盘快捷键冲突、分段按钮状态、配对实验统计标注和 Service Worker 更新时序，并增加对应回归测试。配置与结果 schema 仍为 4。

## v4 主要升级

- 低分辨率 ECM 场保存局部密度、损伤、应变和纤维方向；
- 细胞牵引可重排纤维，并以有限速率降解局部 ECM；
- ECM 密度和纤维方向反向影响迁移阻力与路径；
- Leader 不再主要由预设身份指定，而由前缘位置、牵引不对称、接触负荷和方向线索动态竞争产生；
- Leader 可退出并由新的前缘细胞补位；Follower 通过接触网络传播的方向信号组织迁移；
- 新增迁移、Follower、Leader、应激和暂时静止五类自动细胞状态；
- 黏附强度结合近似接触长度，不再只依赖中心距离；
- Lab 模式提供固定种子配对的单因素对照，自动汇总组间差、探索性区间和结局分布；
- 新增 ECM 重塑率、Leader 寿命与更替、牵引不对称、邻居交换、核高应变持续时间等指标；
- UI 仍只暴露 3 个生物学倾向与 1 个场景几何参数，没有新增连续滑块。

## 用户可调参数

Explore 模式只提供：

1. **细胞连接强度**；
2. **细胞柔顺性**；
3. **群体引导**；
4. **当前场景的关键几何尺寸**。

底层 ECM 阻力、降解率、核尺寸、接触刚度、膜松弛、阻尼和扩散网格均使用校准预设。Lab 模式中的处理组也采用离散单因素选项，例如“提高环境阻力”“抑制基质降解”“抑制 Leader 形成”，而不是增加底层参数面板。

## 快速开始

要求 Node.js 20 或更高版本。

```bash
npm ci
npm run check
npm run dev
```

打开 `http://localhost:4173`。

## 零后端部署

仓库根目录就是完整站点，可直接发布到 Cloudflare Pages 或任意静态服务器。`npm run build` 会生成 `dist/` 静态快照。

- Framework preset：None
- 环境变量：无
- 后端、数据库、Functions：无

## 模型结构

```text
simulation/
├── engine.js                       # 多尺度细胞—细胞核—ECM 积分器
├── interventions.js                # 少量离散实验处理
├── comparison.js                   # 配对随机种子单因素对照
├── comparison-worker.js            # 对照实验 Worker
├── core/deformable-cell.js         # 面积守恒边界与形状相关接触
├── core/ecm-field.js               # ECM 密度、损伤、应变与纤维场
├── core/spatial-hash.js            # 确定性空间哈希邻居搜索
├── core/guidance-field.js          # 绕障碍稳态扩散型引导场
├── scenarios/catalog.js            # 场景几何、初态、扰动与语义
├── worker-runtime.js               # 固定时间步实时 Worker
└── batch.js / batch-worker.js      # 多随机种子参数扫描
```

## 可复现性与数据格式

v4 破坏性格式变化：

- 配置 schema：4；
- 结果 schema：4；
- frame stride：20；
- frame 另带压缩 ECM 快照；
- 本地保存键：`iwt-project-v4`，仍可迁移 v3/v2/v1 项目；
- 配置哈希包含处理组 `interventionId`。

第三方解析器必须读取 `schemaVersion` 和 `meta.stride`，不要假设固定数组长度。

## 文档

- `docs/MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/SCENARIOS.md`
- `docs/VALIDATION.md`
- `docs/SCIENTIFIC_SCOPE.md`
- `docs/REFERENCES.md`
- `docs/MIGRATION_V3_TO_V4.md`
- `docs/DEPLOYMENT.md`
- `docs/UX_PRINCIPLES.md`

## 许可证与参考实现

项目代码使用 MIT License，运行时为零第三方依赖。v4 参考了 Cellular Potts、可变形粒子、集体迁移、动态 Leader 和可降解 ECM 文献的机制设计，但没有嵌入 Artistoo 或其他模拟框架源码。详见 `THIRD_PARTY_NOTICES.md` 与 `docs/REFERENCES.md`。

## 数据与隐私

- 所有模拟与计算结果仅在浏览器本地运行，不会上传至任何服务器；
- 项目数据只保存在浏览器 `localStorage`（保存键 `iwt-project-v4`），可随时清除；
- 运行时不发起任何网络请求，无远程依赖。

---

> AI 编程代理请阅读 [AGENTS.md](./AGENTS.md) 了解代码架构、测试策略与开发约定。

---

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（Claude Code、Cursor、Copilot 等）都必须同步更新本文件与 AGENTS.md。**
>
> - 新增功能 → 在 README 的"v4 主要升级"或相应章节中添加用户可理解的说明
> - 新增/删除文件 → 更新本文和 AGENTS.md 中的文件清单与模型结构图
> - 修改架构 → 更新 AGENTS.md 的架构边界说明
> - 变更帧 stride 或结果 schema → 同步升级 `simulation/versions.js` 并更新迁移文档
> - 部署方式变更 → 同步更新本文部署章节
> - 保持 **README 面向人类用户**，**AGENTS.md 面向 AI 代理**，两份文件不可互相替代

# v2.0 部署说明

验证日期：2026-08-04

## 通用静态部署

```bash
npm ci
npm run check
```

- 构建命令：`npm run build`
- 发布目录：`dist`
- 环境变量：无
- 后端、数据库、Functions：无

部署后至少检查：主页、`app.js`、两个 Worker、manifest、Service Worker、四个场景、一次扰动、结果导出和 `404.html`。

## Cloudflare Pages

项目设置：

- Framework preset：None
- Build command：`npm run build`
- Build output directory：`dist`
- Root directory：仓库根目录
- Node.js：读取 `.node-version`

`public/_headers` 会复制到 `dist/_headers`。Cloudflare Pages 会解析部署资产目录中的 `_headers` 并将规则应用到静态响应。顶层 `404.html` 用于真正的 Not Found 页面；本项目使用查询参数而不是客户端深路由，因此不依赖 Pages 的 SPA 全路径回退。

不建议额外设置全站长期 Cache Rule：当前文件名未做内容哈希，HTML、Service Worker 与 manifest 已显式 `no-cache`，其余静态资源使用平台默认缓存和 ETag。

## GitHub Pages

仓库 Settings → Pages → Source 选择 **GitHub Actions**。`.github/workflows/deploy-pages.yml` 会：

1. 以锁文件安装；
2. 执行全部检查；
3. 上传 `dist` Pages artifact；
4. 使用独立 deploy job 发布。

工作流只授予所需权限：构建阶段 `contents: read`，部署阶段增加 `pages: write` 与 `id-token: write`。所有 Action 均固定到完整 commit SHA。

## Netlify / Vercel

仓库已包含 `netlify.toml` 与 `vercel.json`。两者都使用 `npm run build` 和 `dist`，并复制与 Cloudflare 对应的安全响应头。

## 直接上传静态包

解压 `delivery/release/invasion-wind-tunnel-v2.0.0-static.zip`，将压缩包根目录全部文件上传到静态站点根目录。不要只上传 `index.html`，否则 Worker、场景模块、图标和离线缓存会缺失。

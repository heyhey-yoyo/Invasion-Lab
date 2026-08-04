# v2.0 部署说明

验证日期：2026-08-04

## 通用静态部署

```bash
npm ci
npm run check
```

- 站点文件位于仓库根目录，可零构建直接发布
- 环境变量：无
- 后端、数据库、Functions：无

部署后至少检查：主页、`app.js`、两个 Worker、manifest、Service Worker、四个场景、一次扰动、结果导出和 `404.html`。

## Cloudflare Pages

仓库根目录即站点根目录，连接 Git 仓库后无需任何构建配置：

- Framework preset：None
- Build command：留空（无构建）
- Build output directory：留空（默认即根目录）
- Root directory：仓库根目录（默认）

根目录 `_headers` 会被 Cloudflare Pages 解析并应用到静态响应。顶层 `404.html` 用于真正的 Not Found 页面；本项目使用查询参数而不是客户端深路由，因此不依赖 Pages 的 SPA 全路径回退。

不建议额外设置全站长期 Cache Rule：当前文件名未做内容哈希，HTML、Service Worker 与 manifest 已显式 `no-cache`，其余静态资源使用平台默认缓存和 ETag。

## GitHub Pages

仓库未包含 GitHub Actions 自动发布工作流。如需使用 GitHub Pages，请在本地执行 `npm run build` 后，将 `dist/` 内容通过 Pages 手动上传，或自行添加部署 workflow（构建命令 `npm run build`，发布目录 `dist`）。

## Netlify / Vercel

仓库已包含 `netlify.toml` 与 `vercel.json`。两者都使用 `npm run build` 和 `dist`，并复制与 Cloudflare 对应的安全响应头。

## 直接上传静态包

本地执行 `npm run build` 后，将 `dist/` 目录下全部文件上传到静态站点根目录。不要只上传 `index.html`，否则 Worker、场景模块、图标和离线缓存会缺失。

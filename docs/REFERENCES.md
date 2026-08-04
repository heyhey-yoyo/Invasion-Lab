# 工程参考资料

访问日期：2026-08-04

1. Cloudflare Pages — Headers  
   https://developers.cloudflare.com/pages/configuration/headers/  
   用途：确认 `_headers` 应位于静态资产目录或最终输出目录，并用于安全响应头。

2. Cloudflare Pages — Serving Pages  
   https://developers.cloudflare.com/pages/configuration/serving-pages/  
   用途：确认顶层 `404.html` 行为、SPA 回退差异和默认缓存建议。

3. Cloudflare Pages — Limits  
   https://developers.cloudflare.com/pages/platform/limits/  
   用途：复核免费版构建、文件数量、单文件大小与 `_headers` 限制。本项目构建产物远低于这些限制。

4. GitHub Docs — Secure use reference  
   https://docs.github.com/en/actions/reference/security/secure-use  
   用途：最小化 `GITHUB_TOKEN` 权限，并将第三方 Action 固定到完整 commit SHA。

5. GitHub Docs — Using custom workflows with GitHub Pages  
   https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages  
   用途：确认 Pages artifact、部署权限、`needs` 和 `github-pages` environment 要求。

6. Web Workers API — MDN  
   https://developer.mozilla.org/docs/Web/API/Web_Workers_API  
   用途：实时模拟和批量扫描使用独立 Worker，避免主线程运行数值循环。

7. Web App Manifests — MDN  
   https://developer.mozilla.org/docs/Web/Manifest  
   用途：PWA manifest 字段与安装元数据。

科学机制与模型边界见 `MODEL.md`、`SCIENTIFIC_SCOPE.md` 和原始产品企划。当前实现不是 Artistoo CPM 的替代实现，也不做临床预测。

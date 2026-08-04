# v2.0 回滚说明

## 最直接的回滚

1. 停止发布 v2.0 静态包。
2. 解压交付物中的 `invasion-wind-tunnel-v1.1.0-static.zip`。
3. 将其根目录全部文件重新部署到原静态站点。
4. 清除或等待 Service Worker 更新；必要时在浏览器开发者工具中注销旧 Service Worker 并刷新。

v2 使用 `iwt-project-v2`，v1 使用 `iwt-project-v1`，因此部署回滚不会删除 v1 本地项目。v1 不会读取 v2 schema 2 项目。

## GitHub 回滚

若 v2 已提交：

```bash
git revert <v2-commit-or-merge-commit>
git push origin main
```

或者将 v1.1.0 源码重新提交到回滚分支，经 Pull Request 合并。不要强推覆盖公开历史。

## Cloudflare Pages 回滚

在 Cloudflare Pages 项目的 Deployments 中选择 v2 之前的成功部署并执行 rollback。若通过 Git 集成，随后也应回退仓库代码，避免下一次推送再次发布 v2。

## 基线验证

v1.1.0 源码压缩包 SHA-256：

```text
6c9b8ce58685e599425729b943e0cc6942e745687d7e7a5b4ee84f0e2f601b31
```

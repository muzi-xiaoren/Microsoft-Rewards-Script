# Fork 更新方式

本 fork 的默认分支是 `V4-china`，上游为 `chiihero/Microsoft-Rewards-Script`。

`Monthly upstream code and releases` 工作流每月 1 日北京时间 08:17 执行，也支持在 GitHub Actions 中手动运行。GitHub 定时执行可能延迟。

工作流合并上游 `V4-china`，保留 fork 的提交及 `.github/workflows/` 配置，避免带回自动镜像发布。其他文件出现冲突时停止自动同步，在运行摘要中提供上游比较链接供手动处理。不需要扩大 Actions 的 PR 权限。

合并成功后，工作流补齐上游公开 Release 的说明和附件。新增标签指向同步后的 fork 分支代码；已有标签及 Release 不覆盖。每个新增 Release 注明上游来源；需要对应版本的原始上游源码时，应使用该来源链接。上游附件原样复制，可能使用上游版本代码。

同步不构建或发布 Docker 镜像，也不自动更新本机容器。需要应用代码更新时，在本机执行：

```powershell
git pull --ff-only origin V4-china
docker compose up -d --build
```

API 和推送令牌放在本地 `.env`，不要提交。当天完成标志保存于 `sessions/run-completion/`，重建容器后仍保留；第二天自动失效。标志只表示任务正常结束，不保证积分配额全部获得。

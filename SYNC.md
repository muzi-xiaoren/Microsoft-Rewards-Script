# Fork 更新方式

本 fork 的默认分支是 `V4-china`，上游为 `chiihero/Microsoft-Rewards-Script`。

`Monthly upstream code and releases` 工作流每月 1 日北京时间 08:17 执行，也支持在 GitHub Actions 中手动运行。GitHub 定时执行可能延迟。

工作流合并上游 `V4-china`，保留 fork 的提交及 `.github/workflows/` 配置，避免带回自动镜像发布。其他文件出现冲突时停止自动同步，在运行摘要中提供上游比较链接供手动处理。不需要扩大 Actions 的 PR 权限。

合并成功后，工作流编译本 fork 的代码并发布 ZIP，不再复制上游附件。标签格式为 `v版本号-fork.提交哈希`，避免与上游历史标签混淆；代码提交没有变化且附件已存在时跳过重复发版。Release 中保留上游发版链接与说明。

ZIP 包含对应提交的源码、编译后的 `dist` 和 `RELEASE-INFO.json`，不包含凭据、会话或 `node_modules`。GitHub 自动提供的源码 ZIP / tar.gz 也对应本 fork 标签。使用编译包时需要 Node.js 24+，执行 `npm ci --omit=dev --ignore-scripts` 安装运行依赖、`npm run install:browser` 安装浏览器，并准备自己的配置和账户环境变量。旧的同步 Release 保留作历史记录，应使用带 `fork` 标签的新版本。

同步不构建或发布 Docker 镜像，也不自动更新本机容器。需要应用代码更新时，在本机执行：

```powershell
git pull --ff-only origin V4-china
docker compose up -d --build
```

Windows 使用 Docker Desktop 手动代理时，BuildKit 的认证请求还需要客户端代理环境变量。可使用下面的脚本读取本机 Docker Desktop 代理，只对本次构建生效：

```powershell
.\scripts\docker\build.ps1 -Update
```

脚本拉取最新基础镜像并构建，成功后更新容器；构建失败时不更新正在运行的容器。Docker Desktop 镜像下载代理与容器运行流量分开配置，运行容器无需走透明代理。

API 和推送令牌放在本地 `.env`，不要提交。当天完成标志保存于 `sessions/run-completion/`，重建容器后仍保留；第二天自动失效。标志只表示任务正常结束，不保证积分配额全部获得。

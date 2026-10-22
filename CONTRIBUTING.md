# 开发与反馈

运行环境和构建方法见 README。所有生成文件都放入项目的 `dist` 或 `.local`。

请优先保持当前范围：单向解释、完整有效历史的临时分支、请求缓存计数、悬浮窗显示和正常退出后的清理。修改后运行 `npm test`，确认没有把解释写回主聊天。

单元和流程测试使用虚构的聊天标识与模拟后台，不使用开发者的聊天或凭据。测试产物在 `.local`，完成后清理各次测试目录。

真实模型验证应使用独立的 `CODEX_HOME` 和数据目录，明确区分真实回复触发与人工回放 Stop 事件。不要把它安装到正在日常使用的 Codex 存储目录来验证。

提交源码前检查 `.gitignore`。私人程序路径、配置、聊天、令牌及安装回执不能加入 Git。

## 发布新版本

主分支的 `.agents/plugins/marketplace.json` 指向 `plugin/`，这是用户自动更新的来源。`plugin/` 包含构建好的运行文件；只在版本通过测试后提交它。Release 附件用于首次安装和旧版用户迁移，单独上传附件不会更新已安装用户。

1. 更新 package.json、package-lock.json、.codex-plugin/plugin.json、src/server.mjs 和 src/backend.mjs 中的版本号。
2. 运行 `npm run build`，生成运行文件和 `plugin/`；运行 `npm test`。
3. 安装流程有改动时，运行 `node test/installation.mjs "完整的 codex.exe 路径"`。测试需要将 beta.2 插件包事先解压到 `.local/releases/codex-reply-explainer-0.5.0-beta.2-plugin-windows-x64`，以验证旧版迁移。它在 `.local` 内创建独立的 Git 来源、Codex 存储和虚构回复，不连接真实模型。
4. 更新中英文 README、CHANGELOG 和功能验证说明，运行 `npm run package`。
5. 检查并提交源码、文档、`.agents/plugins/marketplace.json` 和生成的 `plugin/`。不要提交 `.local`。
6. 准备面向用户的发布说明文件，运行 `npm run publish -- .local/release-notes.md`。此命令核对版本和安装包，推送 main，再创建 GitHub Release 并上传两个 ZIP 和校验文件。

发布命令需要 Git 和已登录的 GitHub CLI。主分支一旦推送，已启用自动更新的用户就能在后续 Codex 后台启动时获取它。发布失败时先查看 GitHub 当前状态，避免重复创建同名 Release。

## Publishing releases

The main-branch marketplace points to the built `plugin/` directory. Commit those files only after testing the version. Run the build and tests, update both READMEs and the changelog, package the release, and commit the source and generated marketplace. Then run `npm run publish -- .local/release-notes.md`. The command verifies package versions and runtime files, pushes main, and creates a matching GitHub Release with ZIP assets and checksums. Uploading Release assets alone does not update installed users.

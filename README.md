# Codex Reply Explainer · Codex 回复解释

[English](README.en.md) | 简体中文

在独立小窗中，用容易理解的话解释 Codex 刚才的回复。**通过 Codex 官方临时分支（fork）机制继承对话上下文，尽量复用输入缓存，解释不写回主聊天。**

测试版 **0.5.0-beta.2**，支持 Windows x64 上的本地 Codex / 本地 ChatGPT Work 聊天。普通 Chat、Work Cloud 和远程主机聊天暂不支持。此项目由社区开发，与 OpenAI 无隶属关系。

## 界面预览

基于真实完整窗口截图编辑，聊天名称、项目名称和头像缩写已替换。正文来自虚构案例的一次实际生成：原回复 708 字，对应解释 168 字。主聊天显示长回复的后半段，小窗显示完整解释，两者均位于窗口上方。

![真实窗口截图编辑：原回复后半段与完整解释并排显示](assets/screenshots/real-app-side-by-side.png)

![真实窗口截图编辑：解释小窗叠放显示](assets/screenshots/real-app-floating-overlay.png)

点击图片查看原图，也可以查看[完整示例回复和解释](assets/screenshots/example-content.json)。图片经过内容替换和图像编辑。

## 它怎样工作

- 选择一段聊天，读取截至最新完整回复的本地记录。
- 从这些记录创建临时分支，沿用原模型和思考强度，尽量复用输入缓存。压缩过的聊天沿用压缩后仍有效的上下文。
- 插件会自动启动并复用解释后台，无需额外设置。同一聊天后续回复结束后自动更新解释。
- 解释只显示在小窗，不写回主聊天。切换或关闭时清除旧解释；生成结束清理上下文和登录信息的临时副本，关闭小窗后删除解释后台目录。
- 支持 Markdown 和常见数学公式。
- **记住上次关闭时的窗口大小和屏幕位置，下次打开自动恢复。**

## 与官方自动填充共同使用的临时分支机制

fork 就是从已有对话创建一个独立分支，带着对话上下文生成新内容。Codex 官方自动填充也采用临时分支生成建议。本插件通过官方 `thread/fork` 接口和 `ephemeral: true` 创建解释分支；临时分支只在内存中运行，不加入长期保存的聊天列表。接口说明见[官方 App Server 文档](https://learn.chatgpt.com/docs/app-server)。

解释分支继承截至最新完整回复的有效上下文，因此能结合之前的问题、限制，以及用户在对话中表达的关注点和偏好来解释。对已经压缩的历史，沿用压缩后仍有效的内容。原模型和思考强度也会沿用。

两者创建分支的位置有所区别：核对过的官方自动填充从桌面端已加载的聊天状态创建预测分支；本插件在独立后台中，从已保存的本地记录创建临时分支。后台的启动、复用和关闭均由插件自动处理，主聊天继续独立运行。具体调用见 [src/backend.mjs](src/backend.mjs)。

## 缓存命中实测

保留已有上下文和模型配置，可以让服务端复用已处理的相同输入。**0.5.0-beta.2 在新回复结束后的自动解释实测，输入缓存命中率为 93.5%。** 下表同时保留前一版本的两次测量。

| 请求 | 全部输入 token | 命中缓存的输入 token | 缓存命中率 |
|---|---:|---:|---:|
| beta.1 第一次解释 | 159,146 | 148,992 | 93.6% |
| beta.1 第二次解释 | 187,980 | 178,048 | 94.7% |
| beta.2 新回复自动解释 | 156,592 | 146,432 | 93.5% |

token 是模型计算文本用量的单位。命中率按服务器返回的**本次命中缓存的输入 token ÷ 本次全部输入 token**计算。上述解释均沿用主聊天的 `gpt-6.1-sol` 模型和 high 思考强度。

这些数字来自本地样本。实际命中率随输入内容、模型和缓存保留情况变化；每次解释仍需要生成新的内容，并计入账号或服务的用量。详细计数和测试条件见 [VALIDATION.md](VALIDATION.md)，缓存机制见[官方说明](https://developers.openai.com/api/docs/guides/prompt-caching)。

## 生成速度实测

2026-10-18，使用 0.5.0-beta.1 解释同一聊天的两条完整回复，并与这两条回复对应的官方自动填充结果记录对照：

| 对应回复 | 官方自动填充 | 本插件生成完整解释 |
|---|---:|---:|
| 回复 A：首次解释 | 14.8 秒 | 26.5 秒 |
| 回复 B：后续解释，后台自动复用 | 18.5 秒 | 18.2 秒 |

官方用时从主回复结束计至预测结果写入日志；插件用时从提交解释请求计至完整结果更新，后台的首次启动在提交前已完成。两边请求发生于不同时间，均未测量屏幕实际刷新时刻。官方生成下一条输入建议，插件在这两次测试中分别生成 132、144 字的解释，文字返回后逐步显示。详细计时见 [VALIDATION.md](VALIDATION.md)。

2026-10-22，包含本次修复的版本在一条新回复结束后约 1.1 秒自动开始解释，从主回复结束到完整解释数据更新共 24.4 秒，缓存命中 93.5%。这次没有匹配的官方自动填充计时，以上表作为历史对照。

**插件已自动管理后台的启动、复用和关闭，无需额外开启或配置。** 实际耗时随上下文长度、沿用的模型与思考强度、服务端响应和网络情况变化。

## 安装条件

1. Windows 10/11 x64，已安装 Codex 桌面端并登录。
2. Node.js **22.13 或更新版本**，`node.exe` 能从终端找到。
3. Codex 的 `codex.exe` 能从终端找到；找不到时用安装参数指定其完整路径。使用支持 `plugin marketplace`、`thread/fork` 和 Stop hooks 的版本。
4. 已有微软 WebView2 Runtime。安装包包含 WebView2 SDK 所需组件，不包含浏览器运行环境。

## 安装：交给你自己的 Codex

**首次安装可以直接使用最新版，无需先安装旧版。** 前往 [Releases](https://github.com/Jupiterofyear/codex-reply-explainer/releases)，下载最新测试版的 Windows x64 插件 ZIP；安装请选文件名以 `-plugin-windows-x64.zip` 结尾的包。已有用户请按下方“更新已有安装”操作。

在能访问本机文件的本地 Codex 聊天中，发送本项目页面链接，并附上这段话：

> 请帮我安装这个项目的 Codex Reply Explainer（Codex 回复解释）插件。先阅读 README、PRIVACY.md 和 install.ps1，检查 Windows、Node.js、Codex 和 WebView2 是否满足要求。从 Releases 下载最新的 Windows x64 插件 ZIP，解压到我选择的长期保留目录，按 README 运行安装脚本。保留已有 Codex 设置，检查并带我信任回复结束后自动运行的 Stop 脚本。安装完成后核对插件登记、打开入口和自动解释；需要我操作的步骤请具体说明。不要修改桌面端源码。

Codex 可以检查环境、定位程序、执行安装和排查问题。安装会登记一个本地插件，并在 Codex 存储目录保存运行副本；解压文件和解释数据的保存位置由你选择。自动运行脚本需要先检查并信任，桌面端重新打开后加载插件。

### 自己执行安装

也可以按下面的步骤操作：

1. 将 `codex-reply-explainer-0.5.0-beta.2-plugin-windows-x64.zip` 解压到你准备长期保留的文件夹。路径可以包含空格。
2. 在该文件夹打开 PowerShell，执行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
   ```

   指定解释数据目录，例如：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DataDirectory "D:\ReplyExplainerData"
   ```

   若 Codex 不在 PATH，用 `-CodexPath` 指定其 exe 完整路径。Node.js 必须已加入 PATH，以便回复结束后的通知脚本启动。`-CodexHome` 可指定独立的 Codex 存储目录；它必须与要解释的本地聊天属于同一个存储目录。

3. 脚本通过 Codex 官方 `plugin marketplace add` / `plugin add` 安装到 `reply-explainer-preview` 来源，不修改桌面端源码。它不会自动信任运行脚本。
4. 在使用相同 Codex 存储目录的 CLI 中输入 `/hooks`，检查并信任此插件的 **Stop** 通知脚本。每次脚本定义改变后需要重新检查。随后在方便时重新打开 Codex 桌面端。

默认会写入的地方：

| 位置 | 用途 |
|---|---|
| 当前解压文件夹的 `.local/install-source` | 当前电脑专用的安装来源，包含解析后的程序路径 |
| 当前解压文件夹的 `.local/data` | 默认解释数据和窗口位置；可用参数更改 |
| Codex 存储目录的配置和插件缓存 | 官方登记信息、启用状态、插件安装副本；默认位于用户的 `.codex` |

安装脚本只更改所选的 Codex 存储目录。安装期间不会启动或关闭正在运行的桌面端。

## 打开和使用

1. 打开要解释的本地聊天，点击**聊天区域右上角的“＋” → “更多工具” → “Codex 回复解释”**，打开插件的悬浮窗。
2. 小窗会选中这段聊天，生成最近一条完整回复的解释。首次从这个菜单打开后，无需再点“解释当前聊天”。附带打开的内部面板可以关闭，保留悬浮小窗即可。如果保留内部面板，之后可点击其中的“打开悬浮窗”直接重开。
3. 保持小窗打开，同一聊天后续完整回复会自动更新解释。
4. **切换聊天后，在小窗顶部点一次“解释当前聊天”**，选中你当前正在看的本地聊天，无需重新打开菜单。这个按钮临时使用“复制应用内链接”快捷键，然后恢复剪贴板。使用按钮时只保留一个 Codex 主窗口。
5. 可以拖动窗口、调整宽高。**关闭时保存大小和屏幕位置，下次打开自动恢复**；关闭小窗同时停止解释后台。后台意外退出时会保留已生成文字并显示错误；点击“解释当前聊天”可重新启动后台并生成解释。

另一个打开方式：安装完成后，双击解压目录的 `open.cmd`，再点小窗顶部的“解释当前聊天”。它会使用安装时选择的数据目录、Codex 存储目录和程序路径。

如果没有自动更新，先检查 Stop 脚本是否已信任、小窗是否打开、绑定的是否为同一聊天。普通 Chat 不提供此版本需要的本地记录；它不会被转换成新的主聊天。

## 更新与卸载

### 更新已有安装

**已安装本项目公开测试版的用户可以直接安装最新版，无需先卸载。** 已验证从 beta.1 更新到 beta.2，包括解压到不同文件夹的情况。项目需要手动更新，不会在后台下载新版本。

可以把项目链接和下面这段话发给自己的 Codex：

> 请帮我将已安装的 Codex Reply Explainer 更新到最新测试版。先阅读新版 README 和 install.ps1，从旧解压目录的 .local/installation.json 确认原来的 Codex 存储目录和解释数据目录。关闭解释小窗，将最新版 Windows x64 插件 ZIP 解压到长期保留的新目录，用原来的 CodexHome 和 DataDirectory 运行新版安装脚本，并确认当前 codex.exe 的位置。保留原来的窗口大小和位置。检查 Stop 脚本是否需要重新信任，指导我重启 Codex，确认插件版本、打开小窗以及新回复后的自动解释正常。不要修改桌面端源码。

自己更新时：

1. 关闭解释小窗，下载并解压最新版 Windows x64 插件 ZIP。
2. 查看旧解压目录的 `.local/installation.json`，其中 `codexHome` 和 `dataDirectory` 是原来使用的目录。
3. 在新版文件夹运行 `install.ps1`，用 `-CodexHome` 和 `-DataDirectory` 指定上一步的原目录；若找不到 Codex，补上当前的 `-CodexPath`。脚本会更新此插件的登记和运行副本。
4. 在相同 Codex 存储目录的 CLI 中检查 `/hooks`；如果 Stop 脚本定义变了，重新检查并信任。重启 Codex 桌面端，然后打开解释小窗。
5. 确认窗口大小和位置恢复，并在所选聊天下一次回复结束后确认解释自动更新。

**换到新文件夹时，必须显式指定原来的 `-DataDirectory` 才能沿用窗口设置。** 不指定时会使用新文件夹下的 `.local/data`。如果原数据就在旧解压目录内，更新后仍需保留该目录。

### 卸载

卸载：

```powershell
codex plugin remove reply-explainer@reply-explainer-preview
codex plugin marketplace remove reply-explainer-preview
```

随后可删除解压目录和自己指定的解释数据目录；保留它们不影响卸载。自定义 `CODEX_HOME` 的安装应在相同环境中卸载。

## 从源码构建

在项目目录运行：

```powershell
npm ci --cache .local/npm-cache
npm run build
npm test
npm run package
```

构建需要 Windows x64 的 .NET Framework C# 编译器。WebView2 SDK 的必要文件和许可证位于 `vendor/webview2`。构建只写入项目内的 `dist`、`.local`，安装包输出到 `.local/releases`。

## 当前限制

此版本依赖本地记录格式、数据库结构和 Codex 的分支接口，桌面端更新后可能需要适配。它保留已有有效历史，但独立解释后台不等于桌面端原后台的全部运行状态；缓存是否命中以服务器返回的计数为准。

含有生命周期 hooks 的插件目前不符合官方公开插件目录要求。本测试版通过源码和手动安装包分发。参阅[官方插件文档](https://developers.openai.com/plugins/build/plugins)和[通知脚本文档](https://learn.chatgpt.com/docs/hooks)。

## 隐私与许可证

数据处理详见 [PRIVACY.md](PRIVACY.md)。项目代码采用 [MIT](LICENSE)，第三方组件保留各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及安装包 `dist/licenses`。

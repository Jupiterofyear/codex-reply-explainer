# Codex Reply Explainer · Codex 回复解释

English | [简体中文](README.md)

Explain Codex's latest reply in plain language in a separate floating window. **Uses Codex's official temporary fork mechanism to inherit conversation context and reuse cached input where possible. Explanations are kept out of the main chat.**

Beta **0.5.0-beta.2** supports local Codex and local ChatGPT Work chats on Windows x64. Ordinary Chat, Work Cloud, and chats running on remote hosts are currently unsupported. This is a community project, unaffiliated with OpenAI.

## Interface preview

Edited from a real full-window screenshot, with chat names, project names, and avatar initials replaced. The text comes from an actual generation for a fictional scenario: a 708-character original reply and its 168-character explanation. The main chat shows the latter part of the long reply, while the floating window shows the complete explanation. Both appear near the top.

![Edited real-window screenshot showing the latter part of a reply beside its complete explanation](assets/screenshots/real-app-side-by-side.png)

![Edited real-window screenshot with the floating explanation window overlapping the app](assets/screenshots/real-app-floating-overlay.png)

Click the image to view the full-size version, or read the [complete example reply and explanation](assets/screenshots/example-content.json). The screenshot has undergone content replacement and image editing.

## How it works

- Select a chat. The plugin reads its locally saved history through the latest completed reply.
- It creates a temporary fork from that history, keeping the original model and reasoning effort and reusing cached input where possible. If the conversation has been compacted, it inherits the context that remains after compaction.
- The plugin automatically starts and reuses its explanation backend. Later completed replies in the selected chat automatically update the explanation.
- Explanations appear only in the floating window. Switching chats or closing the window clears the previous explanation. Temporary copies of context and authentication data are removed after generation; closing the window removes the explanation backend's directory.
- Supports Markdown and common mathematical notation.
- **Remembers the window size and screen position when closed, and restores them the next time it opens.**

## Temporary forks, also used by official composer predictions

A fork is an independent branch of an existing conversation that carries its context into a new generation. Codex's official composer predictions also use temporary forks to generate suggestions. This plugin calls the official `thread/fork` interface with `ephemeral: true`. The temporary fork runs in memory and is not added to the list of permanently saved chats. See the [official App Server documentation](https://learn.chatgpt.com/docs/app-server).

The explanation fork inherits the effective context through the latest completed reply. It can therefore explain that reply using earlier questions, constraints, interests, and preferences expressed in the conversation. For compacted history, it uses the content that remains effective after compaction. The original model and reasoning effort are preserved.

The forks are created from different sources: the official composer prediction implementation we inspected forks the chat state already loaded by the desktop app. This plugin creates a temporary fork from saved local records in its own backend. The plugin automatically manages backend startup, reuse, and shutdown while the main chat continues independently. The calls are in [src/backend.mjs](src/backend.mjs).

## Measured input cache reuse

Preserving existing context and model settings lets the server reuse matching input it has already processed. **An automatic explanation immediately after a new reply using 0.5.0-beta.2 returned a 93.5% input cache hit rate.** Earlier measurements are retained below for comparison.

| Request | Total input tokens | Cached input tokens | Cache hit rate |
|---|---:|---:|---:|
| beta.1 first explanation | 159,146 | 148,992 | 93.6% |
| beta.1 second explanation | 187,980 | 178,048 | 94.7% |
| beta.2 automatic explanation after a new reply | 156,592 | 146,432 | 93.5% |

A token is a unit used to measure model input and output. The hit rate is calculated as **cached input tokens for this request / total input tokens for this request**, using the server's returned counts. These requests inherited the main chat's `gpt-6.1-sol` model and high reasoning effort.

These are local measurements. Actual cache reuse varies with the input, model, and cache retention. Each explanation still generates new content and counts toward the usage of your account or service. See [VALIDATION.md](VALIDATION.md) for counts and test conditions, and the [official prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) for the caching mechanism.

## Measured speed

On October 18, 2026, version 0.5.0-beta.1 explained two completed replies from the same chat. Its timings were compared with the official composer prediction result logs for those same replies:

| Source reply | Official composer prediction | Complete explanation from this plugin |
|---|---:|---:|
| Reply A: first explanation | 14.8 s | 26.5 s |
| Reply B: subsequent explanation, backend reused automatically | 18.5 s | 18.2 s |

Official timings run from completion of the main reply to the prediction result being logged. Plugin timings run from submitting the explanation request to the complete result being updated; initial backend startup had already finished before submission. The requests occurred at different times, and neither measurement tracked when pixels appeared on screen. The official feature generates a suggested next message; the plugin generated explanations of 132 and 144 characters in these tests, displaying text progressively as it arrived. See [VALIDATION.md](VALIDATION.md) for detailed timings.

On October 22, 2026, the version containing these fixes automatically started an explanation about 1.1 seconds after a new reply finished. The complete result was updated 24.4 seconds after the main reply, with a 93.5% cache hit rate. No matching official prediction timing was available for this measurement; the table above remains a historical comparison.

**Backend startup, reuse, and shutdown are already handled automatically. No separate switch or configuration is needed.** Actual times vary with context length, the inherited model and reasoning effort, server response, and network conditions.

## Requirements

1. Windows 10/11 x64, with the Codex desktop app installed and signed in.
2. Node.js **22.13 or later**, with `node.exe` available on `PATH`.
3. Codex's `codex.exe` available on `PATH`, or its full path supplied to the installer. Use a version supporting `plugin marketplace`, `thread/fork`, and Stop hooks.
4. Microsoft WebView2 Runtime already installed. The package includes the required WebView2 SDK components, but not the browser runtime.

## Install with help from your own Codex

**New users can install the latest release directly; no older version is required.** Open [Releases](https://github.com/Jupiterofyear/codex-reply-explainer/releases) and download the latest beta asset ending in `-plugin-windows-x64.zip`. Existing users should follow “Update an existing installation” below.

Open a local Codex chat that can access files on your computer. Send it this project's page URL together with the following request:

> Please install this project's Codex Reply Explainer (Codex 回复解释) plugin for me. First read the README, PRIVACY.md, and install.ps1, and check the Windows, Node.js, Codex, and WebView2 requirements. Download the latest Windows x64 plugin ZIP from Releases, extract it to a permanent folder I choose, and run the installer as described in the README. Preserve my existing Codex settings. Inspect the Stop script that runs after replies and guide me through trusting it. After installation, verify plugin registration, the opening menu, and automatic explanations. Give me specific instructions for any steps I need to perform. Do not modify the desktop app's source code.

Codex can check the environment, locate programs, run the installer, and troubleshoot problems. Installation registers a local plugin and saves a runtime copy in your Codex storage directory. You choose where to keep the extracted files and explanation data. Review and trust the automatic script, then reopen the desktop app to load the plugin.

### Install it yourself

You can also follow these steps:

1. Extract `codex-reply-explainer-0.5.0-beta.2-plugin-windows-x64.zip` to a folder you intend to keep. Paths containing spaces are supported.
2. Open PowerShell in that folder and run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
   ```

   To choose an explanation data directory, for example:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DataDirectory "D:\ReplyExplainerData"
   ```

   If Codex is not on `PATH`, supply the full executable path with `-CodexPath`. Node.js must be on `PATH` so the script triggered after replies can start. `-CodexHome` selects a separate Codex storage directory; it must be the directory containing the local chats you want to explain.

3. The script installs through Codex's official `plugin marketplace add` / `plugin add` commands, using the `reply-explainer-preview` source. It does not modify the desktop app's source or automatically trust scripts.
4. In the Codex CLI using the same storage directory, enter `/hooks`, inspect this plugin's **Stop** script, and trust it. Review it again whenever its definition changes. Then reopen the Codex desktop app when convenient.

Default write locations:

| Location | Purpose |
|---|---|
| `.local/install-source` inside the extracted folder | Installation source for this computer, including resolved program paths |
| `.local/data` inside the extracted folder | Default explanation data and window geometry; can be changed with an installer option |
| Configuration and plugin cache in the Codex storage directory | Official registration, enabled state, and installed plugin copy; defaults to the user's `.codex` directory |

The installer changes only the selected Codex storage directory. It does not start or close the running desktop app during installation.

## Open and use

The plugin's interface currently uses Chinese labels. Their English meanings are included below.

1. Open the local chat you want to explain. In the **top-right corner of the chat area, select “+” → “更多工具” (More tools) → “Codex 回复解释” (Codex Reply Explainer)** to open the floating window.
2. The window selects that chat and generates an explanation of its latest completed reply. Opening it from this menu selects the chat directly. You can close the accompanying internal panel and keep the floating window open. If you retain the panel, its “打开悬浮窗” (Open floating window) button reopens the window directly.
3. Keep the window open. Later completed replies in the same chat update its explanation automatically.
4. **After switching chats, click “解释当前聊天” (Explain current chat) once at the top of the floating window.** This selects the chat you are currently viewing without reopening the menu. The button temporarily uses the “copy in-app link” shortcut and then restores the clipboard. Keep only one Codex main window open when using this button.
5. Move and resize the window as needed. **Closing it saves its size and screen position for the next launch**, and stops the explanation backend. If the backend exits unexpectedly, the window retains the partial text and shows an error. Click “解释当前聊天” (Explain current chat) to restart the backend and generate the explanation again.

Another way to open it: after installation, double-click `open.cmd` in the extracted folder, then click “解释当前聊天” (Explain current chat). The launcher uses the data directory, Codex storage directory, and program paths selected during installation.

If automatic updates are missing, check that the Stop script is trusted, the window is open, and it is bound to the same chat. Ordinary Chat does not provide the local records required by this version; the plugin does not convert it into a new main chat.

## Update and uninstall

### Update an existing installation

**Users of this project's public beta can install the latest version directly without uninstalling first.** Updating from beta.1 to beta.2 has been verified, including installation from a different folder. Updates are manual; the plugin does not download new versions in the background.

Send the project URL and this request to your own Codex:

> Please update my installed Codex Reply Explainer to the latest beta. Read the new README and install.ps1 first. Read .local/installation.json in the previous extracted folder to identify my existing Codex storage and explanation data directories. Close the floating window, extract the latest Windows x64 plugin ZIP to a permanent new folder, and run its installer with the original CodexHome and DataDirectory. Locate the current codex.exe. Preserve my window size and position. Check whether the Stop script needs to be trusted again, guide me through restarting Codex, and verify the installed version, opening the window, and automatic explanations after new replies. Do not modify the desktop app's source code.

To update manually:

1. Close the floating window. Download and extract the latest Windows x64 plugin ZIP.
2. Read `.local/installation.json` in the previous extracted folder. Its `codexHome` and `dataDirectory` fields identify your existing directories.
3. Run `install.ps1` from the new folder with `-CodexHome` and `-DataDirectory` set to those original directories. Supply the current `-CodexPath` if Codex cannot be found. The installer updates this plugin's registration and runtime copy.
4. Check `/hooks` in the CLI using the same Codex storage directory. If the Stop script definition changed, inspect and trust it again. Restart the Codex desktop app and open the explanation window.
5. Confirm that the window size and position are restored and that the next completed reply in the selected chat updates the explanation automatically.

**When installing from a new folder, explicitly pass the original `-DataDirectory` to keep your window settings.** Otherwise, the installer uses `.local/data` inside the new folder. If your original data directory is inside the old extracted folder, keep that directory after updating.

### Uninstall

To uninstall:

```powershell
codex plugin remove reply-explainer@reply-explainer-preview
codex plugin marketplace remove reply-explainer-preview
```

You can then delete the extracted folder and your chosen explanation data directory. Keeping those files does not prevent uninstallation. If you installed with a custom `CODEX_HOME`, uninstall using the same environment.

## Build from source

Run these commands in the project directory:

```powershell
npm ci --cache .local/npm-cache
npm run build
npm test
npm run package
```

Building requires the Windows x64 .NET Framework C# compiler. Required WebView2 SDK files and licenses are in `vendor/webview2`. Build output stays inside the project's `dist` and `.local` directories; packages are written to `.local/releases`.

## Current limitations

This version depends on local record formats, database structure, and Codex's fork interface. Desktop updates may require adjustments. It preserves effective conversation history, while its separate explanation backend does not reproduce every part of the desktop backend's running state. Cache hits are measured using the server's returned counts.

Plugins containing lifecycle hooks are currently ineligible for the official public plugin directory. This beta is distributed as source code and a manually installed package. See the [official plugin documentation](https://developers.openai.com/plugins/build/plugins) and [hook documentation](https://learn.chatgpt.com/docs/hooks).

## Privacy and licenses

Data handling is described in [PRIVACY.md](PRIVACY.md). Project code is licensed under [MIT](LICENSE). Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `dist/licenses` in the installation package. The supporting project documents are currently in Chinese.

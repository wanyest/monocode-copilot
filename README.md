
<p align="center">
  <img src="public/monocode.png" alt="MonoCode-Copilot" width="88" />
</p>

<h1 align="center">MonoCode-Copilot</h1>

<p align="center">
  <strong>A desktop UI for your coding agents.</strong>
</p>

<p align="center">
  <img width="1680" height="1050" alt="Screenshot 2026-09-04 at 06 34 00" src="https://github.com/user-attachments/assets/2cd4a6ec-eb1e-4b45-8627-a76442ea3874" />
</p>

Works with your subscriptions on Claude Code, Codex, GitHub Copilot, Cursor, Grok Build, OpenCode, Pi, omp, and fx. If they’re installed and logged in, MonoCode-Copilot can run them. Tabs are sessions. The composer is the input. MonoCode-Copilot does not sell tokens.

## Install

> Install and log in to at least one provider first:
>
> - [Claude Code](https://claude.com/product/claude-code) - `claude auth login`
> - [Codex](https://developers.openai.com/codex/cli) - `codex login`
> - [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) - `copilot login`
> - [Cursor CLI](https://cursor.com/cli) - `agent login`
> - [Grok Build](https://docs.x.ai/build/overview) - `curl -fsSL https://x.ai/cli/install.sh | bash` then `grok login`
> - [OpenCode](https://opencode.ai) - `opencode auth login`
> - [Pi](https://pi.dev/) - `npm install -g @earendil-works/pi-coding-agent`
> - [omp](https://omp.sh) - `curl -fsSL https://omp.sh/install | sh`
> - [fx](https://fx.sh) - `curl -fsSL https://fx.sh/setup.sh | bash` then `fx login`

macOS (Apple Silicon): download the [latest MonoCode-Copilot DMG](https://github.com/wanyest/monocode-copilot/releases/latest), open it, and drag MonoCode-Copilot to Applications.

## Some notes

This is very early and you should expect bugs.

Small, focused pull requests are welcome. Anything large is worth an issue first - see [CONTRIBUTING.md](CONTRIBUTING.md).

## Build from source

This Copilot fork builds and releases for macOS only. The cross-platform source inherited from upstream remains in the repository to keep upstream merges manageable, but this fork does not run Windows or Linux builds.

Need Node.js 20+ and a current stable Rust toolchain.

```bash
npm install
npm run tauri dev
```

To run the standalone Copilot-branded app variant:

```bash
npm run tauri:copilot
```

## License

[MIT](LICENSE). Provider names and logos are trademarks of their owners - see [NOTICE](NOTICE).

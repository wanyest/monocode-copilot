<p align="center">
  <img src="public/monocode.png" alt="MonoCode-Copilot" width="88" />
</p>

<h1 align="center">MonoCode-Copilot</h1>

<p align="center">
  <strong>A GUI for your coding agents.</strong>
</p>

<p align="center">
  <img width="1680" height="1050" alt="MonoCode with agent sessions open side by side" src="https://github.com/user-attachments/assets/2cd4a6ec-eb1e-4b45-8627-a76442ea3874" />
</p>

Works with your subscriptions on Claude Code, Codex, GitHub Copilot, Cursor, Grok Build, OpenCode, Antigravity, Pi, omp, fx, Hermes Agent, and Devin. If they’re installed and logged in, MonoCode-Copilot can run them. Tabs are sessions. The composer is the input. MonoCode-Copilot does not sell tokens.

## Install

Install and sign in to at least one supported agent first. For [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli), install the CLI and run `copilot login`. See [provider setup](docs/providers.md) for all supported agents, including Devin.

macOS (Apple Silicon): download the [latest MonoCode-Copilot DMG](https://github.com/wanyest/monocode-copilot/releases/latest), open it, and drag MonoCode-Copilot to Applications.

This fork builds and releases for macOS only; Windows and Linux desktop builds are not provided.

## Get started

Open a project folder, choose an agent, and send a message. Each tab is a session. Split panes to work with sessions side by side.

- Keep conversations organized by project.
- Use separate Git worktrees for parallel tasks.
- Edit files and review changes in the app.
- Start a message with `/operator` to let an agent open sessions and manage worktrees and notes.

Monos are experimental agents that work across your projects. They keep a memory and can run scheduled tasks you set up with them.

MonoCode-Copilot is still early. If something breaks, [report a bug](https://github.com/wanyest/monocode-copilot/issues).

## Guides

- [Provider setup](docs/providers.md)
- [Agent access with /operator](docs/agent-access.md)
- [Remote sessions, experimental](docs/remote-access.md)

## Build from source

This Copilot fork builds and releases for macOS only. The cross-platform source inherited from upstream remains in the repository to keep upstream merges manageable, but this fork does not run Windows or Linux builds.

You’ll need Node.js 20+ and a current stable Rust toolchain. See [build setup](docs/building.md) for macOS dependencies and packaging.

The upstream mobile app is a separate Expo project in [`mobile/`](mobile/README.md); it is not part of this fork’s desktop CI or releases.

```bash
npm install
npm run tauri dev
```

To run the standalone Copilot-branded app variant:

```bash
npm run tauri:copilot
```

Upstream synchronization is manual; this fork does not automatically merge upstream changes.

Small, focused contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Contributors

Thanks to everyone who contributes to MonoCode!

[![MonoCode contributors](https://contrib.rocks/image?repo=hardbeat920/monocode)](https://github.com/hardbeat920/monocode/graphs/contributors)

Contributor image by [contrib.rocks](https://contrib.rocks).

## License

[MIT](LICENSE). Provider names and logos are trademarks of their owners. See [NOTICE](NOTICE).

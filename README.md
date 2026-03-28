# Claude Code Bridge

Bridges Obsidian with Claude Code CLI via a local MCP (Model Context Protocol) WebSocket server, exposing vault context as tools for AI-assisted workflows.

## Features

- Local MCP server over WebSocket -- auto-starts on plugin load
- Exposes vault tools to Claude Code: `get_active_note`, `get_opened_notes`, `get_selection`, `open_note`, `read_note`
- Sends real-time notifications: `selection_changed`, `at_mentioned`, `ide_connected`
- Command: **Send selection to Claude Code** -- push selected text to your Claude Code session
- Session-scoped auth via random UUID token (no persistent credentials)
- Auto-registers with Claude Code CLI via lock file in `~/.claude/ide/`

## Requirements

**Desktop only.** This plugin uses Node.js/Electron APIs (WebSocket server, file system) and is marked `isDesktopOnly: true`.

- Obsidian desktop v1.0.0+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed

## Installation

### Manual

1. Download `main.js`, `manifest.json` from the [latest release](../../releases/latest)
2. Create `.obsidian/plugins/obsidian-claude-code/` in your vault
3. Copy downloaded files into that folder
4. Reload Obsidian, then enable **Claude Code Bridge** in Settings > Community plugins

### Build from source

```bash
git clone https://github.com/tj19961229/obsidian-claude-code.git
cd obsidian-claude-code
npm install
npm run build
```

Copy `main.js` and `manifest.json` to your vault's plugin folder.

## How It Works

```
Obsidian                          Claude Code CLI
  |                                     |
  |-- plugin loads ----------------------|
  |   1. Start WebSocket on localhost    |
  |   2. Write lock file to             |
  |      ~/.claude/ide/<port>.lock       |
  |                                     |
  |   3. CLI reads lock file,           |
  |      discovers port + auth token    |
  |      and connects via WebSocket  <--|
  |                                     |
  |   4. CLI calls MCP tools to         |
  |      read vault context          <--|
  |                                     |
  |   5. Plugin sends notifications  -->|
  |      (selection, @mention)          |
```

On load, the plugin starts a WebSocket MCP server bound to `127.0.0.1` and writes a lock file containing the port and a session-scoped UUID auth token. Claude Code CLI discovers this lock file, connects, and can then invoke MCP tools to interact with the vault.

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_active_note` | Returns the currently active note's path, title, frontmatter, and tags |
| `get_opened_notes` | Lists all notes currently open in the workspace |
| `get_selection` | Returns the current editor selection text and cursor range |
| `open_note` | Opens a note by vault-relative file path |
| `read_note` | Reads the full content, frontmatter, and tags of a note |

### Notifications (server to client)

| Event | Trigger |
|-------|---------|
| `selection_changed` | User changes text selection in editor |
| `at_mentioned` | User invokes the "Send selection to Claude Code" command |
| `ide_connected` | Claude Code CLI successfully connects |

## Security

- **Localhost only**: The WebSocket server binds exclusively to `127.0.0.1`. No network-accessible ports are opened.
- **Auth token**: A random UUID is generated per session. All WebSocket connections must present this token via the `x-claude-code-ide-authorization` header.
- **Lock file permissions**: The lock file at `~/.claude/ide/<port>.lock` is written with mode `0o600` (owner read/write only).
- **No telemetry**: The plugin does not collect analytics or transmit vault content to external services.

## Privacy and Data

This plugin:
- Runs a **localhost-only** WebSocket server. No data leaves your machine.
- Writes a temporary lock file to `~/.claude/ide/` (deleted on plugin unload).
- Does not persist any vault data outside of Obsidian's normal storage.

## Development

```bash
npm install
npm run dev    # watch mode with source maps
npm run build  # production build
```

## License

[MIT](LICENSE)

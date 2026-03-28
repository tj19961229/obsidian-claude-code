/**
 * MCP Bridge Server
 *
 * Core orchestrator that manages the WebSocket server, MCP protocol,
 * lock file lifecycle, and tool registration. Each WebSocket connection
 * gets its own MCP Server instance with a dedicated transport.
 *
 * @author tj
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";
import { App, FileSystemAdapter } from "obsidian";
import { randomUUID } from "crypto";
import { IncomingMessage } from "http";

import { WebSocketTransport } from "./transport";
import {
  findAvailablePort,
  createLockFile,
  deleteLockFile,
} from "./lock-file";
import {
  buildActiveFileNotification,
  buildAtMentionedNotification,
  buildIdeConnectedNotification,
  buildSelectionChangedNotification,
  buildSelectionClearedNotification,
} from "../notifications/manager";
import {
  getActiveNote,
  getOpenedNotes,
  getSelection,
  openNote,
  readNote,
} from "../tools/editor-tools";

const SELECTION_DEBOUNCE_MS = 300;

export interface CachedSelection {
  filePath: string;
  text: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

interface ConnectedClient {
  server: Server;
  transport: WebSocketTransport;
  isIdeClient: boolean;
}

export class McpBridge {
  private readonly app: App;
  private readonly version: string;
  private readonly authToken: string;

  private wss: WebSocketServer | null = null;
  private port: number = 0;
  private clients: ConnectedClient[] = [];
  private selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _cachedSelection: CachedSelection | null = null;

  constructor(app: App, version: string) {
    this.app = app;
    this.version = version;
    this.authToken = randomUUID();
  }

  async start(): Promise<void> {
    this.port = await findAvailablePort();

    this.wss = new WebSocketServer({
      port: this.port,
      host: "127.0.0.1",
      maxPayload: 1024 * 1024,
    });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on("error", (err: Error) => {
      console.error("Claude Code Bridge: WebSocket server error", err.message);
    });

    const adapter = this.app.vault.adapter as FileSystemAdapter;
    createLockFile(this.port, this.authToken, adapter.getBasePath());
    console.log(
      `Claude Code Bridge: MCP server listening on ws://127.0.0.1:${this.port}`
    );
  }

  async stop(): Promise<void> {
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
      this.selectionDebounceTimer = null;
    }

    for (const client of this.clients) {
      await client.transport.close();
    }
    this.clients = [];

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.port > 0) {
      deleteLockFile(this.port);
    }
  }

  sendAtMentioned(filePath: string, lineStart: number, lineEnd: number): void {
    const notification = buildAtMentionedNotification(
      filePath,
      lineStart,
      lineEnd
    );
    this.broadcast(notification);
  }

  sendSelectionChanged(
    filePath: string,
    text: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
  ): void {
    this._cachedSelection = {
      filePath,
      text,
      startLine,
      startColumn: startCharacter,
      endLine,
      endColumn: endCharacter,
    };

    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
    }
    this.selectionDebounceTimer = setTimeout(() => {
      this.selectionDebounceTimer = null;
      const notification = buildSelectionChangedNotification(
        this.toAbsolutePath(filePath),
        text,
        startLine,
        startCharacter,
        endLine,
        endCharacter
      );
      this.broadcast(notification);
    }, SELECTION_DEBOUNCE_MS);
  }

  sendSelectionCleared(): void {
    this._cachedSelection = null;
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
      this.selectionDebounceTimer = null;
    }
    const notification = buildSelectionClearedNotification();
    this.broadcast(notification);
  }

  sendActiveFileChanged(filePath: string, cursorLine = 0, cursorCharacter = 0): void {
    this._cachedSelection = null;
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
      this.selectionDebounceTimer = null;
    }
    const notification = buildActiveFileNotification(
      this.toAbsolutePath(filePath),
      cursorLine,
      cursorCharacter
    );
    this.broadcast(notification);
  }

  private getVaultBasePath(): string {
    return (this.app.vault.adapter as FileSystemAdapter).getBasePath();
  }

  private toAbsolutePath(vaultRelativePath: string): string {
    return `${this.getVaultBasePath()}/${vaultRelativePath}`;
  }


  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const token = req.headers["x-claude-code-ide-authorization"] as string | undefined;
    if (!token || token !== this.authToken) {
      console.log("Claude Code Bridge: rejected connection (missing or invalid auth token)");
      ws.close(4001, "Invalid auth token");
      return;
    }

    const isIdeClient = true;
    const transport = new WebSocketTransport(ws);
    const server = this.createMcpServer();
    const client: ConnectedClient = { server, transport, isIdeClient };

    this.clients.push(client);

    transport.onclose = () => {
      this.clients = this.clients.filter((c) => c !== client);
    };

    server.connect(transport).then(() => {
      server.notification(buildIdeConnectedNotification(process.pid)).catch((err: Error) => {
        console.error("Claude Code Bridge: failed to send connected notification", err);
      });
    });
  }

  private createMcpServer(): Server {
    const server = new Server(
      {
        name: "obsidian-claude-code",
        version: this.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_active_note",
          description:
            "Get the currently active note in Obsidian, including its file path, title, frontmatter, and tags.",
          inputSchema: { type: "object" as const, properties: {} },
        },
        {
          name: "get_opened_notes",
          description:
            "Get a list of all currently open notes (tabs) in Obsidian.",
          inputSchema: { type: "object" as const, properties: {} },
        },
        {
          name: "get_selection",
          description:
            "Get the current text selection in the active Obsidian editor, including the selected text and cursor range.",
          inputSchema: { type: "object" as const, properties: {} },
        },
        {
          name: "open_note",
          description: "Open a note by its vault-relative file path in Obsidian.",
          inputSchema: {
            type: "object" as const,
            properties: {
              filePath: {
                type: "string",
                description: "Vault-relative path to the note (e.g. 'folder/note.md')",
              },
            },
            required: ["filePath"],
          },
        },
        {
          name: "read_note",
          description:
            "Read the full content, frontmatter, and tags of a note by its vault-relative file path.",
          inputSchema: {
            type: "object" as const,
            properties: {
              filePath: {
                type: "string",
                description: "Vault-relative path to the note (e.g. 'folder/note.md')",
              },
            },
            required: ["filePath"],
          },
        },
      ],
    }));

    server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const { name } = request.params;
        const args = (request.params.arguments ?? {}) as Record<string, string>;

        switch (name) {
          case "get_active_note":
            return getActiveNote(this.app);
          case "get_opened_notes":
            return getOpenedNotes(this.app);
          case "get_selection":
            return getSelection(this.app, this._cachedSelection);
          case "open_note":
            return openNote(this.app, args.filePath);
          case "read_note":
            return readNote(this.app, args.filePath);
          default:
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                },
              ],
            };
        }
      }
    );

    return server;
  }

  private broadcast(notification: { method: string; params?: Record<string, unknown> }): void {
    const targets = this.clients.filter((c) => c.isIdeClient);
    for (const client of targets) {
      client.server.notification(notification).catch((err: Error) => {
        console.error("Claude Code Bridge: broadcast error", err);
      });
    }
  }

}

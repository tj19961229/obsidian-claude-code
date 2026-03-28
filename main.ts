/**
 * Obsidian Claude Code Bridge Plugin
 *
 * Entry point for the plugin. Creates an MCP bridge that allows
 * Claude Code CLI to interact with the Obsidian vault via WebSocket.
 *
 * @author tj
 */
import { Plugin, Notice, MarkdownView } from "obsidian";
import { McpBridge } from "./src/mcp/server";

const SELECTION_POLL_MS = 300;

export default class ClaudeCodeBridgePlugin extends Plugin {
  private bridge: McpBridge | null = null;
  private selectionTimer: ReturnType<typeof setInterval> | null = null;
  private lastSelection = "";

  async onload(): Promise<void> {
    this.bridge = new McpBridge(this.app, this.manifest.version);
    await this.bridge.start();

    this.addCommand({
      id: "send-to-claude",
      name: "Send selection to Claude Code",
      editorCallback: (editor, view) => {
        if (!this.bridge) return;
        const file = view.file;
        if (!file) return;

        const fromLine = editor.getCursor("from").line;
        const toLine = editor.getCursor("to").line;
        this.bridge.sendAtMentioned(file.path, fromLine, toLine);
        new Notice(
          `Sent to Claude Code: ${file.basename}#L${fromLine + 1}-L${toLine + 1}`
        );
      },
    });

    this.selectionTimer = setInterval(() => {
      if (!this.bridge) return;
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file) return;

      const editor = view.editor;
      const isPreview = view.getMode() === "preview";
      let selection = "";
      let fromLine = 0;
      let fromCh = 0;
      let toLine = 0;
      let toCh = 0;

      if (isPreview) {
        const domSel = activeWindow.getSelection();
        if (domSel && domSel.rangeCount > 0) {
          const trimmed = domSel.toString().trim();
          if (trimmed) {
            selection = trimmed;
            const contentLines = trimmed.split("\n").filter((l) => l.trim().length > 0);
            toLine = Math.max(contentLines.length - 1, 0);
            toCh = contentLines.length > 0
              ? contentLines[contentLines.length - 1].length
              : 0;
          }
        }
      } else {
        const editorSelection = editor.getSelection();
        if (editorSelection) {
          selection = editorSelection;
          const from = editor.getCursor("from");
          const to = editor.getCursor("to");
          fromLine = from.line;
          fromCh = from.ch;
          toLine = to.line;
          toCh = to.ch;
        }
      }

      if (selection && selection !== this.lastSelection) {
        this.lastSelection = selection;
        this.bridge.sendSelectionChanged(
          view.file.path,
          selection,
          fromLine,
          fromCh,
          toLine,
          toCh
        );
      } else if (!selection && this.lastSelection) {
        this.lastSelection = "";
        this.bridge.sendSelectionCleared();
      }
    }, SELECTION_POLL_MS);

    console.log("Claude Code Bridge: loaded [build-20260328-1520] ide-filter+content-lines");
  }

  async onunload(): Promise<void> {
    if (this.selectionTimer) {
      clearInterval(this.selectionTimer);
      this.selectionTimer = null;
    }
    await this.bridge?.stop();
    this.bridge = null;
    console.log("Claude Code Bridge: unloaded");
  }
}

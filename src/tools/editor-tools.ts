/**
 * Editor Tools for MCP
 *
 * Implements Phase 1 tools that allow Claude Code to interact
 * with the Obsidian vault: reading notes, getting selections,
 * opening files, etc.
 *
 * @author tj
 */
import { App, MarkdownView, TFile } from "obsidian";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { CachedSelection } from "../mcp/server";

type ToolResult = CallToolResult;

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

function cachedSelectionResult(cached: CachedSelection): ToolResult {
  return textResult({
    filePath: cached.filePath,
    text: cached.text,
    range: {
      startLine: cached.startLine,
      startColumn: cached.startColumn,
      endLine: cached.endLine,
      endColumn: cached.endColumn,
    },
    cached: true,
  });
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
  };
}

/**
 * Get the currently active note's metadata.
 */
export function getActiveNote(app: App): ToolResult {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.file) {
    return errorResult("No active markdown note");
  }

  const file = view.file;
  const cache = app.metadataCache.getFileCache(file);

  return textResult({
    filePath: file.path,
    title: file.basename,
    frontmatter: cache?.frontmatter ?? null,
    tags: extractTags(cache),
  });
}

/**
 * Get all currently open notes (tabs).
 */
export function getOpenedNotes(app: App): ToolResult {
  const leaves = app.workspace.getLeavesOfType("markdown");
  const notes = leaves
    .map((leaf) => {
      const view = leaf.view as MarkdownView;
      const file = view.file;
      if (!file) return null;
      return {
        filePath: file.path,
        title: file.basename,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  return textResult({ notes });
}

/**
 * Get the current editor selection text and range.
 */
export function getSelection(
  app: App,
  cached?: CachedSelection | null
): ToolResult {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.file) {
    if (cached) return cachedSelectionResult(cached);
    return errorResult("No active markdown note");
  }

  const editor = view.editor;
  const selection = editor.getSelection();
  if (!selection) {
    if (cached) return cachedSelectionResult(cached);
    return errorResult("No text selected");
  }

  const from = editor.getCursor("from");
  const to = editor.getCursor("to");

  return textResult({
    filePath: view.file.path,
    text: selection,
    range: {
      startLine: from.line,
      startColumn: from.ch,
      endLine: to.line,
      endColumn: to.ch,
    },
  });
}

/**
 * Open a note by file path in Obsidian.
 */
export async function openNote(
  app: App,
  filePath: string
): Promise<ToolResult> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file || !(file instanceof TFile)) {
    return errorResult(`File not found: ${filePath}`);
  }

  await app.workspace.openLinkText(filePath, "", false);
  return textResult({ opened: filePath });
}

/**
 * Read note content and frontmatter by file path.
 */
export async function readNote(
  app: App,
  filePath: string
): Promise<ToolResult> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file || !(file instanceof TFile)) {
    return errorResult(`File not found: ${filePath}`);
  }

  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);

  return textResult({
    filePath: file.path,
    title: file.basename,
    content,
    frontmatter: cache?.frontmatter ?? null,
    tags: extractTags(cache),
  });
}

function extractTags(
  cache: ReturnType<App["metadataCache"]["getFileCache"]>
): string[] {
  if (!cache) return [];

  const tags: string[] = [];

  // Tags from frontmatter
  if (cache.frontmatter?.tags) {
    const fmTags = cache.frontmatter.tags;
    if (Array.isArray(fmTags)) {
      tags.push(...fmTags.map(String));
    } else if (typeof fmTags === "string") {
      tags.push(fmTags);
    }
  }

  // Inline tags
  if (cache.tags) {
    tags.push(...cache.tags.map((t) => t.tag));
  }

  return [...new Set(tags)];
}

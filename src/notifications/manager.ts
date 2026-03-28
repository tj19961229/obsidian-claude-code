/**
 * Notification Manager
 *
 * Constructs JSONRPC notification payloads for sending to
 * connected Claude Code CLI clients via MCP.
 *
 * @author tj
 */
import { JSONRPCNotification } from "@modelcontextprotocol/sdk/types.js";

export function buildSelectionChangedNotification(
  filePath: string,
  text: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number
): JSONRPCNotification {
  return {
    jsonrpc: "2.0",
    method: "selection_changed",
    params: {
      filePath,
      text,
      selection: {
        start: { line: startLine, character: startCharacter },
        end: { line: endLine, character: endCharacter },
      },
    },
  };
}

export function buildActiveFileNotification(
  filePath: string,
  cursorLine: number,
  cursorCharacter: number
): JSONRPCNotification {
  return {
    jsonrpc: "2.0",
    method: "selection_changed",
    params: {
      filePath,
      text: "",
      selection: {
        start: { line: cursorLine, character: cursorCharacter },
        end: { line: cursorLine, character: cursorCharacter },
      },
    },
  };
}

export function buildSelectionClearedNotification(): JSONRPCNotification {
  return {
    jsonrpc: "2.0",
    method: "selection_changed",
    params: {
      filePath: "",
      text: "",
      selection: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
    },
  };
}

export function buildAtMentionedNotification(
  filePath: string,
  lineStart: number,
  lineEnd: number
): JSONRPCNotification {
  return {
    jsonrpc: "2.0",
    method: "at_mentioned",
    params: {
      filePath,
      lineStart,
      lineEnd,
    },
  };
}

export function buildIdeConnectedNotification(
  pid: number
): JSONRPCNotification {
  return {
    jsonrpc: "2.0",
    method: "ide_connected",
    params: {
      pid,
    },
  };
}

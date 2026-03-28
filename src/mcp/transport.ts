/**
 * Custom WebSocket MCP Transport
 *
 * Implements the Transport interface from @modelcontextprotocol/sdk
 * for a single WebSocket connection. Each connected client gets its
 * own transport instance.
 *
 * @author tj
 */
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { WebSocket } from "ws";

export class WebSocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private readonly ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;

    this.ws.on("message", (data: Buffer) => {
      this.handleIncomingData(data);
    });

    this.ws.on("close", () => {
      this.onclose?.();
    });

    this.ws.on("error", (err: Error) => {
      this.onerror?.(err);
    });
  }

  async start(): Promise<void> {
    // WebSocket is already connected when transport is created
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(
        `WebSocket not open (state=${this.ws.readyState}), cannot send message`
      );
    }
    const payload = JSON.stringify(message);
    this.ws.send(payload);
  }

  async close(): Promise<void> {
    if (
      this.ws.readyState === WebSocket.OPEN ||
      this.ws.readyState === WebSocket.CONNECTING
    ) {
      this.ws.close();
    }
  }

  private handleIncomingData(data: Buffer): void {
    try {
      const text = data.toString("utf-8");
      const message = JSON.parse(text) as JSONRPCMessage;
      this.onmessage?.(message);
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error(`Failed to parse WebSocket message: ${String(err)}`);
      this.onerror?.(error);
    }
  }
}

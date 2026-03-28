/**
 * Lock File Management for Claude Code IDE discovery
 *
 * Claude Code CLI discovers IDE integrations by scanning lock files
 * in ~/.claude/ide/. Each lock file contains connection details for
 * a running IDE instance.
 *
 * @author tj
 */
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as net from "net";

const BASE_PORT = 27544;
const MAX_PORT_ATTEMPTS = 50;

export interface LockFileData {
  workspaceFolders: string[];
  pid: number;
  ideName: string;
  transport: string;
  runningInWindows: boolean;
  authToken: string;
}

/**
 * Returns the directory where lock files are stored.
 */
export function getLockDir(): string {
  return join(homedir(), ".claude", "ide");
}

/**
 * Finds an available TCP port starting from BASE_PORT.
 * Tries ports sequentially until one is free.
 */
export async function findAvailablePort(): Promise<number> {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
    const port = BASE_PORT + offset;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(
    `No available port found in range ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1}`
  );
}

/**
 * Creates a lock file at ~/.claude/ide/{port}.json
 */
export function createLockFile(
  port: number,
  authToken: string,
  vaultBasePath: string
): void {
  const lockDir = getLockDir();
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  const data: LockFileData = {
    workspaceFolders: [vaultBasePath],
    pid: process.pid,
    ideName: "Obsidian",
    transport: "ws",
    runningInWindows: process.platform === "win32",
    authToken,
  };

  const filePath = join(lockDir, `${port}.lock`);
  writeFileSync(filePath, JSON.stringify(data), "utf-8");
}

/**
 * Removes the lock file for the given port.
 */
export function deleteLockFile(port: number): void {
  const filePath = join(getLockDir(), `${port}.lock`);
  try {
    unlinkSync(filePath);
  } catch {
    // File may already be deleted; ignore
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, "127.0.0.1");
  });
}

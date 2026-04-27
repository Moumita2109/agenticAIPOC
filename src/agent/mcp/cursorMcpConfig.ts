import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type McpStdioServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

type McpJsonFile = {
  mcpServers?: Record<string, McpStdioServerConfig>;
};

function readJsonFile(filePath: string): McpJsonFile {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as McpJsonFile;
}

function resolveMcpJsonPath(workspaceRoot: string): { path: string } | null {
  const fromEnv = process.env.PLAYWRIGHT_MCP_CONFIG?.trim();
  if (fromEnv) {
    const abs = path.isAbsolute(fromEnv) ? fromEnv : path.resolve(workspaceRoot, fromEnv);
    if (fs.existsSync(abs)) return { path: abs };
  }
  const projectFile = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (fs.existsSync(projectFile)) return { path: projectFile };
  const homeFile = path.join(os.homedir(), ".cursor", "mcp.json");
  if (fs.existsSync(homeFile)) return { path: homeFile };
  return null;
}

function ensureNpxNonInteractive(command: string, args: string[] | undefined): string[] {
  const a = args ?? [];
  if (command === "npx" && !a.includes("-y") && !a.includes("--yes")) {
    return ["-y", ...a];
  }
  return a;
}

export type ResolvedPlaywrightMcpLaunch = McpStdioServerConfig & {
  configPath: string;
  serverName: string;
};

export function resolvePlaywrightMcpFromCursorConfig(workspaceRoot: string): ResolvedPlaywrightMcpLaunch {
  const resolved = resolveMcpJsonPath(workspaceRoot);
  if (!resolved) {
    throw new Error(
      "No MCP config found. Set PLAYWRIGHT_MCP_CONFIG, or add .cursor/mcp.json in the project, or ~/.cursor/mcp.json (Cursor default).",
    );
  }

  const serverName = process.env.PLAYWRIGHT_MCP_SERVER_NAME?.trim() || "playwright";
  const data = readJsonFile(resolved.path);
  const entry = data.mcpServers?.[serverName];
  if (!entry?.command) {
    throw new Error(`mcpServers.${serverName} is missing or has no "command" in ${resolved.path}`);
  }

  const args = ensureNpxNonInteractive(entry.command, entry.args);
  return {
    command: entry.command,
    args,
    env: entry.env,
    cwd: entry.cwd ? path.resolve(workspaceRoot, entry.cwd) : undefined,
    configPath: resolved.path,
    serverName,
  };
}

import { pathToFileURL } from "node:url";
import path from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolvePlaywrightMcpFromCursorConfig, type ResolvedPlaywrightMcpLaunch } from "./cursorMcpConfig.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("mcp-stdio");

export type PlaywrightMcpStdioSession = {
  client: Client;
  openAiTools: ChatCompletionTool[];
  launch: ResolvedPlaywrightMcpLaunch;
  dispose: () => Promise<void>;
};

function mcpToolsToOpenAi(tools: Awaited<ReturnType<Client["listTools"]>>["tools"]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? t.title ?? t.name,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

async function listAllTools(client: Client): Promise<Awaited<ReturnType<Client["listTools"]>>["tools"]> {
  const out: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    out.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

function formatCallToolResult(result: {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): { output: string; ok: boolean } {
  const lines: string[] = [];
  for (const part of result.content ?? []) {
    if (part.type === "text" && typeof part.text === "string") {
      lines.push(part.text);
    } else {
      lines.push(`[${part.type}]`);
    }
  }
  const output = lines.join("\n\n");
  return { output, ok: !result.isError };
}

export async function createPlaywrightMcpStdioSession(workspaceRoot: string): Promise<PlaywrightMcpStdioSession> {
  const launch = resolvePlaywrightMcpFromCursorConfig(workspaceRoot);
  log.info("Starting Playwright MCP subprocess", {
    configPath: launch.configPath,
    serverName: launch.serverName,
    command: launch.command,
    args: launch.args,
  });

  const workspaceUri = pathToFileURL(path.resolve(workspaceRoot)).href;
  if (!workspaceUri.startsWith("file://")) {
    throw new Error(`Invalid workspace root for MCP roots: ${workspaceRoot}`);
  }

  const client = new Client({ name: "agentic-playwright-mcp-poc", version: "0.1.0" }, { capabilities: { roots: {} } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: [{ uri: workspaceUri, name: "workspace" }],
  }));

  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    cwd: launch.cwd ?? workspaceRoot,
    env: launch.env ? { ...process.env, ...launch.env } as Record<string, string> : undefined,
  });

  await client.connect(transport);

  const mcpTools = await listAllTools(client);
  const openAiTools = mcpToolsToOpenAi(mcpTools);

  return {
    client,
    openAiTools,
    launch,
    dispose: async () => {
      await client.close().catch((e) => log.warn("client.close", { error: String(e) }));
    },
  };
}

export async function callPlaywrightMcpTool(
  client: Client,
  name: string,
  argumentsJson: string,
): Promise<{ output: string; ok: boolean }> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>;
  } catch {
    return { output: "Invalid JSON in tool arguments", ok: false };
  }

  const result = await client.callTool({ name, arguments: args });
  if (result && typeof result === "object" && Array.isArray((result as { content?: unknown }).content)) {
    return formatCallToolResult(result as { content?: Array<{ type: string; text?: string }>; isError?: boolean });
  }
  return { output: JSON.stringify(result), ok: true };
}

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { callLLM } from "../llm.js";
import { callPlaywrightMcpTool, createPlaywrightMcpStdioSession } from "../mcp/playwrightMcpStdioSession.js";
import { FINISH_CHAT_TOOL, runFinishTool } from "../tools/finishTool.js";
import { appendToolResult, createInitialState, stateSummary, type AgentState } from "../../utils/state.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("login-agent");

export type RunLoginAgentOptions = {
  goal: string;
  baseUrl: string;
  maxSteps?: number;
  extraContext?: string;
  /** Project root for resolving `.cursor/mcp.json` and MCP `roots` (default: `process.cwd()`). */
  workspaceRoot?: string;
};

export type RunLoginAgentResult = {
  state: AgentState;
  finalMessage: string;
  success: boolean;
  /** Close the Playwright MCP subprocess. Call after assertions (e.g. in `finally`). */
  dispose: () => Promise<void>;
  /** Valid until `dispose()`. Use for failure screenshots in tests. */
  mcpClient: Client;
};

export async function runLoginAgent(options: RunLoginAgentOptions): Promise<RunLoginAgentResult> {
  const maxSteps = options.maxSteps ?? 10;
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  let state = createInitialState(options.goal);

  const session = await createPlaywrightMcpStdioSession(workspaceRoot);
  const tools = [...session.openAiTools, FINISH_CHAT_TOOL];

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: [
        `Agent: Login agent`,
        `Test goal: ${options.goal}`,
        options.extraContext ? `Context:\n${options.extraContext}` : "",
        `BASE_URL: ${options.baseUrl}`,
        `Max agent steps (tool rounds): ${maxSteps}`,
        `MCP config: ${session.launch.configPath} (server "${session.launch.serverName}")`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  let finalMessage = "";
  let explicitSuccess: boolean | null = null;

  try {
    for (let round = 0; round < maxSteps; round++) {
      log.info(`LLM round ${round + 1}/${maxSteps}`);
      const response = await callLLM(messages, tools);

      if (response.kind === "message") {
        finalMessage = response.content;
        log.info("Model returned text", { finalMessage: finalMessage.slice(0, 500) });
        break;
      }

      const assistantMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: response.assistantContent ?? null,
        tool_calls: response.toolCalls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: c.arguments },
        })),
      };
      messages.push(assistantMsg);

      let shouldStop = false;

      for (const tc of response.toolCalls) {
        if (tc.name === "finish") {
          const fin = runFinishTool(tc.arguments);
          state = appendToolResult(state, {
            toolName: tc.name,
            input: tc.arguments,
            output: fin.output,
            ok: fin.ok,
          });
          explicitSuccess = fin.success;
          finalMessage = fin.summary;
          shouldStop = true;

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: fin.output,
          });
          continue;
        }

        log.info(`MCP tool ${tc.name}`, { args: tc.arguments.slice(0, 300) });
        const exec = await callPlaywrightMcpTool(session.client, tc.name, tc.arguments);
        state = appendToolResult(state, {
          toolName: tc.name,
          input: tc.arguments,
          output: exec.output,
          ok: exec.ok,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: exec.ok ? exec.output : `ERROR: ${exec.output}`,
        });
      }

      messages.push({
        role: "user",
        content: `Observation summary:\n${stateSummary(state)}\nContinue toward the goal or call finish.`,
      });

      if (shouldStop) {
        break;
      }
    }
  } catch (err) {
    await session.dispose();
    throw err;
  }

  const success =
    explicitSuccess !== null
      ? explicitSuccess
      : /success:\s*true/i.test(finalMessage) || /\bpassed\b/i.test(finalMessage);

  return {
    state,
    finalMessage,
    success,
    mcpClient: session.client,
    dispose: () => session.dispose(),
  };
}

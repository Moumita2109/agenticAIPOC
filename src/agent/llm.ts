import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { createLogger } from "../utils/logger.js";

const log = createLogger("llm");

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type CallLlmResult =
  | { kind: "tool_calls"; toolCalls: LlmToolCall[]; assistantContent: string | null }
  | { kind: "message"; content: string };

const SYSTEM_PROMPT = `You are an autonomous UI test agent. You control a real browser via the official Playwright MCP tool set (accessibility snapshots, not screenshots).

Rules:
- Use only the provided tools. Prefer browser_snapshot after navigation or when element refs are unknown. Clicks and typing use ref values from the latest snapshot when the tool requires them.
- Use browser_navigate with a full URL when possible. The user message includes BASE_URL — combine with paths as needed (e.g. login page path).
- After actions, take a snapshot or use verification tools in the set to confirm success (e.g. expected text or page state).
- When the goal is satisfied or clearly failed, call finish with success true/false and a short summary.
- Stay efficient: minimize redundant snapshots and respect the max steps budget.`;

export async function callLLM(
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
): Promise<CallLlmResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  log.debug("chat.completions.create", { model, messageCount: messages.length });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    tools,
    tool_choice: "auto",
  });

  const choice = completion.choices[0];
  const msg = choice?.message;
  if (!msg) {
    return { kind: "message", content: "No response from model." };
  }

  if (msg.tool_calls?.length) {
    const toolCalls: LlmToolCall[] = msg.tool_calls
      .filter((c) => c.type === "function")
      .map((c) => ({
        id: c.id,
        name: c.function.name,
        arguments: c.function.arguments ?? "{}",
      }));
    return { kind: "tool_calls", toolCalls, assistantContent: msg.content };
  }

  return { kind: "message", content: msg.content ?? "" };
}

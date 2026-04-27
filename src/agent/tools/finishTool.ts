import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const FINISH_CHAT_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "finish",
    description:
      "Call when the test goal is fully achieved or cannot be achieved. Summarize outcome for the user.",
    parameters: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        summary: { type: "string" },
      },
      required: ["success", "summary"],
    },
  },
};

export function runFinishTool(argumentsJson: string): { output: string; ok: boolean; success: boolean; summary: string } {
  try {
    const parsed = JSON.parse(argumentsJson || "{}") as { success?: boolean; summary?: string };
    const success = parsed.success ?? false;
    const summary = parsed.summary ?? "";
    return {
      output: JSON.stringify({ finished: true, success, summary }),
      ok: true,
      success,
      summary,
    };
  } catch {
    return {
      output: "finish: invalid JSON",
      ok: false,
      success: false,
      summary: "",
    };
  }
}

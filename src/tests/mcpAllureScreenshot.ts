import { attachment } from "allure-js-commons";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

function extractImageBufferFromCallToolResult(result: unknown): Buffer | null {
  if (!result || typeof result !== "object" || !("content" in result)) return null;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as { type?: string; data?: string; mimeType?: string };
    if (p.type === "image" && typeof p.data === "string") {
      return Buffer.from(p.data, "base64");
    }
  }
  return null;
}

/**
 * Takes a Playwright MCP viewport screenshot and attaches it to the current Allure test.
 * Safe to call when a test has failed; errors are swallowed so teardown still runs.
 */
export async function attachMcpFailureScreenshot(client: Client, name = "failure-screenshot"): Promise<void> {
  try {
    const result = await client.callTool({
      name: "browser_take_screenshot",
      arguments: { type: "png" },
    });
    const buf = extractImageBufferFromCallToolResult(result);
    if (buf?.length) {
      await attachment(name, buf, { contentType: "image/png" });
    }
  } catch {
    // MCP may be unhealthy; do not fail teardown
  }
}

import OpenAI from "openai";
import { createLogger } from "../../utils/logger.js";
import type { PlanScenario } from "./planScenario.js";

const log = createLogger("plan-extract");

function isCredential(v: unknown): v is PlanScenario["credentials"] {
  return v === "valid_login" || v === "invalid_login" || v === "none";
}

function normalizeFromJson(parsed: unknown): PlanScenario[] {
  if (!parsed || typeof parsed !== "object" || !("scenarios" in parsed)) {
    throw new Error('Plan extraction JSON must be an object with a "scenarios" array');
  }
  const list = (parsed as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Plan extraction returned no scenarios");
  }

  const out: PlanScenario[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const goal = typeof o.goal === "string" ? o.goal.trim() : "";
    const credentials = o.credentials;
    const extraContext =
      typeof o.extraContext === "string" && o.extraContext.trim() !== "" ? o.extraContext.trim() : undefined;

    if (!title || !goal || !isCredential(credentials)) {
      continue;
    }

    out.push({
      title,
      goal,
      credentials,
      extraContext,
    });
  }

  if (out.length === 0) {
    throw new Error("Plan extraction produced no valid scenarios (check title, goal, credentials)");
  }

  return out;
}

const EXTRACTION_SYSTEM = `You extract executable UI test scenarios from a Markdown project plan.

Return ONLY valid JSON with this exact shape:
{"scenarios":[{"title":"string","goal":"string","credentials":"valid_login"|"invalid_login"|"none","extraContext":"optional string"}]}

Rules:
- Produce 1 to 8 scenarios implied by the plan (prioritize login flows, "Example Scenario", MVP features, success criteria).
- title: short label for a test report (ASCII, no line breaks).
- goal: clear instruction for an autonomous browser agent (what to do and what outcome proves success).
- credentials:
  - valid_login: uses LOGIN_USERNAME / LOGIN_PASSWORD from environment for a successful login path.
  - invalid_login: uses INVALID_LOGIN_USERNAME / INVALID_LOGIN_PASSWORD and expects an error (optional INVALID_LOGIN_EXPECTED_TEXT).
  - none: flows that do not need those secrets (e.g. smoke navigation only).
- extraContext: optional extra hints (e.g. expected error substring) not covered by credential env vars.`;

export async function extractScenariosWithLlm(planMarkdown: string): Promise<PlanScenario[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.PLAN_EXTRACT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  log.info("Extracting scenarios from plan via LLM", { model });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM },
      {
        role: "user",
        content: `Extract UI test scenarios from this plan:\n\n${planMarkdown}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw?.trim()) {
    throw new Error("Plan extraction model returned empty content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Plan extraction model returned non-JSON");
  }

  return normalizeFromJson(parsed);
}

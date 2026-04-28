import type { PlanScenario } from "./planScenario.js";

const FENCE_RE = /```plan-scenarios\s*\n([\s\S]*?)```/;

function isCredential(v: unknown): v is PlanScenario["credentials"] {
  return v === "valid_login" || v === "invalid_login" || v === "none";
}

function normalizeScenario(raw: Record<string, unknown>, index: number): PlanScenario | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const goal = typeof raw.goal === "string" ? raw.goal.trim() : "";
  const credentials = raw.credentials;
  const extraContext =
    typeof raw.extraContext === "string" && raw.extraContext.trim() !== "" ? raw.extraContext.trim() : undefined;

  if (!title || !goal || !isCredential(credentials)) {
    return null;
  }

  return {
    title: title || `scenario-${index + 1}`,
    goal,
    credentials,
    extraContext,
  };
}

/**
 * If `plan.md` contains a ```plan-scenarios ... ``` fenced JSON block, parse it and skip LLM extraction.
 */
export function tryParsePlanScenariosFence(markdown: string): PlanScenario[] | null {
  const m = markdown.match(FENCE_RE);
  if (!m?.[1]) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1].trim());
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || !("scenarios" in parsed)) return null;
  const list = (parsed as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(list) || list.length === 0) return null;

  const out: PlanScenario[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const s = normalizeScenario(item as Record<string, unknown>, i);
    if (s) out.push(s);
  }

  return out.length > 0 ? out : null;
}

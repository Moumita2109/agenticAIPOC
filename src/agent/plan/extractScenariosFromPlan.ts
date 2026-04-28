import { createLogger } from "../../utils/logger.js";
import { extractScenariosWithLlm } from "./extractScenariosWithLlm.js";
import type { PlanScenario } from "./planScenario.js";
import { tryParsePlanScenariosFence } from "./tryParsePlanScenariosFence.js";

const log = createLogger("plan");

/**
 * Resolves scenarios from `plan.md`:
 * 1. If a ```plan-scenarios fenced JSON block exists and parses, use it (no extra LLM call).
 * 2. Otherwise call the LLM to extract structured scenarios from the full markdown.
 */
export async function extractScenariosFromPlanMarkdown(markdown: string): Promise<PlanScenario[]> {
  const fromFence = tryParsePlanScenariosFence(markdown);
  if (fromFence) {
    log.info("Using scenarios from plan-scenarios fenced block", { count: fromFence.length });
    return fromFence;
  }

  return extractScenariosWithLlm(markdown);
}

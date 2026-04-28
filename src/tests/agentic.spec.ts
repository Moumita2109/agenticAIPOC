import { test, expect } from "@playwright/test";
import {
  runLoginAgent,
  type RunLoginAgentOptions,
  type RunLoginAgentResult,
} from "../agent/login/loginAgent.js";
import { buildAgentExtraContext, hasRequiredEnvForCredentials } from "../agent/plan/buildAgentExtraContext.js";
import { extractScenariosFromPlanMarkdown } from "../agent/plan/extractScenariosFromPlan.js";
import type { PlanScenario } from "../agent/plan/planScenario.js";
import { readPlanMarkdown, resolvePlanMdPath } from "../agent/plan/readPlanFile.js";
import { attachMcpFailureScreenshot } from "./mcpAllureScreenshot.js";

function envTrim(key: string): string | undefined {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

async function withLoginAgentAndFailureScreenshot(
  options: RunLoginAgentOptions,
  assertRun: (run: RunLoginAgentResult) => void,
): Promise<void> {
  let run: RunLoginAgentResult | undefined;
  try {
    run = await runLoginAgent(options);
    assertRun(run);
  } catch (err) {
    if (run?.mcpClient) {
      await attachMcpFailureScreenshot(run.mcpClient);
    }
    throw err;
  } finally {
    await run?.dispose();
  }
}

const apiKey = process.env.OPENAI_API_KEY?.trim();

let scenarios: PlanScenario[] = [];
let extractionError: Error | undefined;

const planPathLabel = resolvePlanMdPath();

if (apiKey) {
  try {
    const markdown = readPlanMarkdown();
    scenarios = await extractScenariosFromPlanMarkdown(markdown);
  } catch (err) {
    extractionError = err instanceof Error ? err : new Error(String(err));
  }
}

test.describe("plan-driven login agent", () => {
  test.describe.configure({ timeout: 180_000 });

  if (!apiKey) {
    test("skipped — OPENAI_API_KEY required", () => {
      test.skip(true, "Set OPENAI_API_KEY to extract scenarios from plan.md and run the agent.");
    });
    return;
  }

  if (extractionError) {
    test(`plan load / extraction failed (${planPathLabel})`, () => {
      throw extractionError;
    });
    return;
  }

  if (scenarios.length === 0) {
    test(`no scenarios extracted (${planPathLabel})`, () => {
      throw new Error(
        "No scenarios were produced. Add a ```plan-scenarios JSON block to plan.md or ensure the plan describes test flows.",
      );
    });
    return;
  }

  for (const scenario of scenarios) {
    test(scenario.title, async () => {
      const baseUrlCandidate = envTrim("BASE_URL");
      test.skip(!baseUrlCandidate, "BASE_URL required");
      const baseUrl = baseUrlCandidate as string;

      test.skip(
        !hasRequiredEnvForCredentials(scenario),
        scenario.credentials === "valid_login"
          ? "LOGIN_USERNAME and LOGIN_PASSWORD required"
          : scenario.credentials === "invalid_login"
            ? "INVALID_LOGIN_USERNAME and INVALID_LOGIN_PASSWORD required"
            : "credential env vars required",
      );

      const extraContext = buildAgentExtraContext(scenario);
      if (scenario.credentials !== "none" && extraContext === undefined) {
        throw new Error("Missing credential env vars for this scenario.");
      }

      await withLoginAgentAndFailureScreenshot(
        {
          goal: scenario.goal,
          baseUrl,
          maxSteps: 10,
          extraContext,
        },
        (run) => {
          expect(run.state.toolResults.length, `Agent did not run tools. Last message: ${run.finalMessage}`).toBeGreaterThan(
            0,
          );
          expect(run.success, `Agent reported failure. Message: ${run.finalMessage}`).toBe(true);
        },
      );
    });
  }
});

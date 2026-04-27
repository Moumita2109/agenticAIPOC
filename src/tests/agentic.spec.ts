import { test, expect } from "@playwright/test";
import {
  runLoginAgent,
  type RunLoginAgentOptions,
  type RunLoginAgentResult,
} from "../agent/login/loginAgent.js";
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

test.describe("login agent", () => {
  test.describe.configure({ timeout: 180_000 });

  test("valid login: reaches secure area", async () => {
    test.skip(!process.env.OPENAI_API_KEY, "OPENAI_API_KEY required");

    const baseUrlCandidate = envTrim("BASE_URL");
    test.skip(!baseUrlCandidate, "BASE_URL required");
    const baseUrl = baseUrlCandidate as string;

    const username = envTrim("LOGIN_USERNAME");
    const password = envTrim("LOGIN_PASSWORD");
    test.skip(!username, "LOGIN_USERNAME required");
    test.skip(!password, "LOGIN_PASSWORD required");

    await withLoginAgentAndFailureScreenshot(
      {
        goal: "Test login with valid credentials and confirm the secure area is shown.",
        baseUrl,
        maxSteps: 10,
        extraContext: `Use username "${username}" and password "${password}". After login, assert success flash or secure area heading is visible.`,
      },
      (run) => {
        expect(run.state.toolResults.length, `Agent did not run tools. Last message: ${run.finalMessage}`).toBeGreaterThan(
          0,
        );
        expect(run.success, `Agent reported failure. Message: ${run.finalMessage}`).toBe(true);
      },
    );
  });

  test("invalid login: error is visible", async () => {
    test.skip(!process.env.OPENAI_API_KEY, "OPENAI_API_KEY required");

    const baseUrlCandidate = envTrim("BASE_URL");
    test.skip(!baseUrlCandidate, "BASE_URL required");
    const baseUrl = baseUrlCandidate as string;

    const invalidUser = envTrim("INVALID_LOGIN_USERNAME");
    const invalidPass = envTrim("INVALID_LOGIN_PASSWORD");
    test.skip(!invalidUser, "INVALID_LOGIN_USERNAME required");
    test.skip(!invalidPass, "INVALID_LOGIN_PASSWORD required");

    const errorHint = envTrim("INVALID_LOGIN_EXPECTED_TEXT");
    const extraContext = [
      `Use username "${invalidUser}" and password "${invalidPass}".`,
      errorHint
        ? `Expect a failure message that includes or matches: ${errorHint}.`
        : "Expect a visible login error or failure message.",
    ].join(" ");

    await withLoginAgentAndFailureScreenshot(
      {
        goal: "Test login with invalid credentials and verify an error message is shown.",
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
});

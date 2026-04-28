import type { PlanScenario } from "./planScenario.js";

function envTrim(key: string): string | undefined {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Maps credential mode + env vars into agent extra context (same spirit as legacy agentic.spec.ts).
 */
export function buildAgentExtraContext(scenario: PlanScenario): string | undefined {
  const parts: string[] = [];

  if (scenario.credentials === "valid_login") {
    const username = envTrim("LOGIN_USERNAME");
    const password = envTrim("LOGIN_PASSWORD");
    if (!username || !password) return undefined;
    parts.push(
      `Use username "${username}" and password "${password}". After login, assert success flash, secure area, or dashboard is visible as appropriate for the app.`,
    );
  } else if (scenario.credentials === "invalid_login") {
    const invalidUser = envTrim("INVALID_LOGIN_USERNAME");
    const invalidPass = envTrim("INVALID_LOGIN_PASSWORD");
    if (!invalidUser || !invalidPass) return undefined;
    const errorHint = envTrim("INVALID_LOGIN_EXPECTED_TEXT");
    parts.push(`Use username "${invalidUser}" and password "${invalidPass}".`);
    parts.push(
      errorHint
        ? `Expect a failure message that includes or matches: ${errorHint}.`
        : "Expect a visible login error or failure message.",
    );
  }

  if (scenario.extraContext?.trim()) {
    parts.push(scenario.extraContext.trim());
  }

  if (parts.length === 0) return undefined;
  return parts.join("\n\n");
}

export function hasRequiredEnvForCredentials(scenario: PlanScenario): boolean {
  if (scenario.credentials === "none") return true;
  if (scenario.credentials === "valid_login") {
    return Boolean(envTrim("LOGIN_USERNAME") && envTrim("LOGIN_PASSWORD"));
  }
  return Boolean(envTrim("INVALID_LOGIN_USERNAME") && envTrim("INVALID_LOGIN_PASSWORD"));
}

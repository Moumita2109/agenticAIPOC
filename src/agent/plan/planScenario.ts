export type PlanScenarioCredentials = "valid_login" | "invalid_login" | "none";

export type PlanScenario = {
  title: string;
  goal: string;
  credentials: PlanScenarioCredentials;
  extraContext?: string;
};

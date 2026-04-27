export type ToolResultRecord = {
  toolName: string;
  input: unknown;
  output: string;
  ok: boolean;
};

export type AgentState = {
  goal: string;
  stepIndex: number;
  toolResults: ToolResultRecord[];
  lastError: string | null;
};

export function createInitialState(goal: string): AgentState {
  return {
    goal,
    stepIndex: 0,
    toolResults: [],
    lastError: null,
  };
}

export function appendToolResult(state: AgentState, record: ToolResultRecord): AgentState {
  return {
    ...state,
    stepIndex: state.stepIndex + 1,
    toolResults: [...state.toolResults, record],
    lastError: record.ok ? null : String(record.output),
  };
}

export function stateSummary(state: AgentState): string {
  const lines = state.toolResults.map(
    (r, i) =>
      `Step ${i + 1}: ${r.toolName} ${r.ok ? "OK" : "FAIL"} — ${truncate(r.output, 500)}`,
  );
  return [`Goal: ${state.goal}`, state.lastError ? `Last error: ${state.lastError}` : "", ...lines].filter(Boolean).join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

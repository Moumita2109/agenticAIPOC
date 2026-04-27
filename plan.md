# Agentic Test Automation POC (Playwright + MCP)

## Objective

Build a Proof of Concept (POC) that demonstrates **agentic test automation** using:

- Playwright (execution layer)
- MCP-style tool abstraction (tool layer)
- LLM (decision-making agent)

The system should:

1. Accept natural language test input
2. Convert it into actionable steps
3. Execute steps using Playwright
4. Observe results and adapt (basic loop)

---

## Architecture

User Input → LLM Agent → MCP Tool Layer → Playwright → Browser → Observation → LLM

---

## Project Structure

```
src/
  agent/
    login/
      loginAgent.ts   # Login agent loop (MCP stdio + finish)
    llm.ts            # LLM integration
    mcp/              # Cursor mcp.json + Playwright MCP stdio session
    tools/
      finishTool.ts   # Local finish tool for agents
  tests/
    agentic.spec.ts   # Login agent tests
  utils/
    logger.ts
    state.ts
```

---

## Core Components

### 1. LLM Layer (`llm.ts`)

- Function: `callLLM(prompt, tools, context)`
- Input:
  - user goal
  - available tools
  - current state
- Output:
  - tool call OR final response

---

### 2. MCP Tool Layer (`playwrightTools.ts`)

Define tools as structured objects.

Example:

```ts
{
  name: "navigate",
  description: "Navigate to a URL",
  parameters: { url: string },
  execute: async ({ url }, page) => {}
}
```

### 3. Executor (`executor.ts`)

Maps LLM tool calls → actual Playwright execution.

Handles:

- logging
- error catching
- retries (basic)

### 4. Agent Loop (`login/loginAgent.ts` — Login agent)

Core logic:

```
while (goal not achieved):
  ask LLM → next step
  if tool call:
    execute tool
    capture result
    update context
  else:
    break
```

Must include:

- max step limit (to avoid infinite loops)
- error handling
- basic retry mechanism

### 5. Test Entry (`agentic.spec.ts`)

Accepts scenario: e.g. "Test login with valid credentials"

Calls:

- generate steps via agent
- execute steps

### Agent Flow

**Input:** "Login and verify dashboard"

**LLM generates:** navigate → type username → type password → click login → assert dashboard visible

**Tools execute via Playwright** → result is fed back to LLM

---

## Observability

Log each step:

- tool name
- inputs
- output

Capture:

- screenshots
- errors

Optional: Playwright trace

---

## Constraints

- Keep deterministic behavior where possible
- Avoid overly complex multi-agent systems
- Limit to 5–10 steps per execution

---

## MVP Features

- Natural language → steps
- Playwright execution
- Tool abstraction
- Basic retry
- Logging

---

## Stretch Goals

- Self-healing selectors
- DOM-aware reasoning
- API + UI hybrid execution
- Memory (store past runs)
- Flaky test detection

---

## Example Scenario

**Input:** "Test login with invalid credentials"

**Expected behavior:**

- Navigate to login
- Enter invalid creds
- Click login
- Verify error message

---

## Config

`.env` file:

- LLM API key

Configurable:

- base URL
- credentials

---

## Tech Stack

- TypeScript
- Playwright
- Node.js
- LLM API (OpenAI or equivalent)

---

## Success Criteria

Agent can:

- Interpret test input
- Execute via Playwright
- Validate outcome

Demonstrates:

- basic autonomy
- end-to-end flow

---

## Deliverable

A working CLI or test runner where:

```bash
npm run agent:test
```

executes a natural language test using the agentic flow.

---

## Setup

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` (and optional `OPENAI_MODEL`, `BASE_URL`, `LOGIN_USERNAME`, `LOGIN_PASSWORD`).
2. Run `npm install`.
3. If Playwright reports a missing browser binary, run `npm run playwright:install` (or `npx playwright install chromium`).
4. Run `npm run agent:test`.

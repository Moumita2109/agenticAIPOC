# Agentic Playwright MCP POC

Proof of concept for **agentic test automation**: natural-language goals are interpreted by an LLM, which drives the same **Playwright MCP server** you configure for Cursor ([`@playwright/mcp`](https://www.npmjs.com/package/@playwright/mcp)) over **stdio** via [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk). The agent lists MCP tools, maps them to OpenAI function calling, and executes `tools/call` on the subprocess. A small local **`finish`** tool ends the loop.

**Flow (tests):** `plan.md` → scenarios (fenced **`plan-scenarios`** JSON **or** one LLM extraction pass) → for each scenario, **Login agent** runs: user goal → LLM → OpenAI function calls → MCP client (`runLoginAgent`) spawns `npx … @playwright/mcp` as in `mcp.json` → browser + tools in that process → observations → LLM (repeat, with a max step limit). Add more agents under `src/agent/<feature>/`.

The browser used for automation is owned by the **MCP subprocess**, not the Playwright `page` fixture (tests no longer take `{ page }`).

### Cursor `mcp.json` (shared with this repo)

`runLoginAgent` (Login agent) loads MCP launch settings in this order:

1. `PLAYWRIGHT_MCP_CONFIG` — path to a JSON file (optional).
2. `<repo>/.cursor/mcp.json` — committed template (matches typical Cursor layout).
3. `~/.cursor/mcp.json` — your Cursor user config.

It uses the server entry named **`playwright`** by default (`PLAYWRIGHT_MCP_SERVER_NAME` to override). For `npx`, the code prepends **`-y`** if missing so installs are non-interactive in CI.

Example (also see `.cursor/mcp.json` in this repo):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

`npm install` includes `@playwright/mcp` as a dev dependency so `npx` can resolve it from the project when you run tests from the repo root.

`src/tests/agentic.spec.ts` reads **`plan.md`** as the scenario source of truth: it either parses an optional fenced **`plan-scenarios`** JSON block in that file or calls an LLM once per run to extract scenarios, then runs each scenario via the login agent using `BASE_URL` and the credential env vars below (no defaults in code).

## Requirements

- **Node.js** 20 or newer
- **OpenAI API key** (tests are skipped if `OPENAI_API_KEY` is unset)
- **Chromium** (installed automatically after `npm install` via the `postinstall` script)

## Setup

```bash
npm install
```

If browsers were not installed:

```bash
npm run playwright:install
```

## Configuration

Copy `.env.example` to `.env` in the project root and fill in your values. `.env` is listed in `.gitignore` — do not commit API keys or real credentials.

| Variable | Required for | Purpose |
|----------|----------------|---------|
| `OPENAI_API_KEY` | Agent tests | Required at startup to read `plan.md` and for every **login agent** run (including when scenarios come only from a `plan-scenarios` fence—no extraction LLM). If unset, the suite registers a single skipped test. |
| `OPENAI_MODEL` | — | Optional. OpenAI chat model for the **login agent** (default: `gpt-4o-mini`). |
| `BASE_URL` | Each scenario | Origin of the app (e.g. `https://the-internet.herokuapp.com`). No default; a scenario skips if missing. |
| `LOGIN_USERNAME` | Scenarios with `credentials: valid_login` | Known-good username. |
| `LOGIN_PASSWORD` | Scenarios with `credentials: valid_login` | Known-good password. |
| `INVALID_LOGIN_USERNAME` | Scenarios with `credentials: invalid_login` | Credentials that must fail login. |
| `INVALID_LOGIN_PASSWORD` | Scenarios with `credentials: invalid_login` | Credentials that must fail login. |
| `INVALID_LOGIN_EXPECTED_TEXT` | — | Optional substring for invalid-login scenarios (hint in agent context). |
| `PLAYWRIGHT_MCP_CONFIG` | — | Optional path to an `mcp.json` file. |
| `PLAYWRIGHT_MCP_SERVER_NAME` | — | Optional MCP server key (default: `playwright`). |
| `PLAN_MD_PATH` | — | Optional path to the plan Markdown file (default: `plan.md` in the project root). |
| `PLAN_EXTRACT_MODEL` | — | Optional model used **only** when extracting scenarios from Markdown (no `plan-scenarios` fence). Default: `OPENAI_MODEL` or `gpt-4o-mini`. |

Example for [The Internet](https://the-internet.herokuapp.com) demo login:

```env
BASE_URL=https://the-internet.herokuapp.com
LOGIN_USERNAME=tomsmith
LOGIN_PASSWORD=SuperSecretPassword!
INVALID_LOGIN_USERNAME=not_a_user
INVALID_LOGIN_PASSWORD=bad_password
INVALID_LOGIN_EXPECTED_TEXT=Your username is invalid!
```

`playwright.config.ts` loads env with `dotenv/config`.

### Plan-driven scenarios (`plan.md`)

- **Source file:** `plan.md` at the repo root by default, or override with **`PLAN_MD_PATH`** (absolute or relative to the project root).
- **How scenarios are chosen:**
  1. If `plan.md` contains a valid fenced block labeled **`plan-scenarios`** with JSON `{ "scenarios": [ ... ] }`, that list is used **without** calling the extraction LLM.
  2. Otherwise the **extraction** model (see **`PLAN_EXTRACT_MODEL`** / **`OPENAI_MODEL`**) reads the full Markdown and returns structured scenarios.
- **Each scenario** has a `goal`, optional `extraContext`, and **`credentials`**: `valid_login` (uses `LOGIN_*` env vars), `invalid_login` (uses `INVALID_LOGIN_*` and optional `INVALID_LOGIN_EXPECTED_TEXT`), or `none` (no login secrets injected). See the **Executable scenarios** section in `plan.md` for the canonical format and examples.

## Running tests

Run the agentic Playwright suite (headless Chromium):

```bash
npm run agent:test
```

`npm run agent:test:headed` still runs the Playwright test runner in headed mode; **visibility of the MCP-controlled browser** depends on [`@playwright/mcp` / Playwright](https://github.com/microsoft/playwright-mcp) defaults and env (not the Playwright test `page`).

Run all tests in `src/tests` with the Playwright CLI directly:

```bash
npx playwright test
```

Useful Playwright options:

```bash
npx playwright test --debug
npx playwright test --ui
```

## Allure Report

Playwright is configured with the `allure-playwright` reporter. Each run writes JSON (and attachments) under `allure-results/` (ignored by git). **`globalSetup`** deletes `allure-results/` and `allure-report/` before the run so old Allure data is not mixed in.

On **failed** login-agent tests, a **viewport PNG** is taken via MCP (`browser_take_screenshot`) and attached to Allure as `failure-screenshot` (see `src/tests/mcpAllureScreenshot.ts`).

Generate static HTML and open it:

```bash
npm run agent:test
npm run allure:generate
npm run allure:open
```

Or serve results directly (no `allure-report` folder):

```bash
npm run allure:serve
```

The `allure` CLI comes from `allure-commandline` and typically needs a **Java runtime** on your machine. If generation fails, follow the [Allure install guide](https://allurereport.org/docs/install/).

## Project layout

- `plan.md` — product / architecture notes and **executable scenario** definitions (`plan-scenarios` fence or content for LLM extraction)
- `src/agent/login/loginAgent.ts` — **Login agent** loop (LLM ↔ MCP stdio + `finish`, max steps)
- `src/agent/plan/` — read `plan.md`, parse optional `plan-scenarios` fence or LLM-extract scenarios
- `src/agent/mcp/cursorMcpConfig.ts` — resolves `mcp.json` and the `playwright` server launch command
- `src/agent/mcp/playwrightMcpStdioSession.ts` — MCP `Client` + `StdioClientTransport`, `listTools` / `callTool`, roots handler
- `src/agent/tools/finishTool.ts` — `finish` tool for explicit success/summary
- `src/agent/llm.ts` — OpenAI chat completions + tool calls
- `src/tests/agentic.spec.ts` — loads scenarios from `plan.md`, then invokes `runLoginAgent` per scenario
- `src/tests/allureGlobalSetup.ts` — clears Allure output folders before each test run
- `src/tests/mcpAllureScreenshot.ts` — MCP screenshot attachment to Allure when a login test fails
- `src/utils/` — logging and shared state helpers

## Notes

- **Scenario list:** Using the **`plan-scenarios`** JSON block in `plan.md` makes which tests exist stable without an extraction LLM call. **Browser steps** inside each scenario are still chosen by the login agent LLM, so runs can vary unless the model behaves consistently.
- Without `OPENAI_API_KEY`, without `BASE_URL`, or without the login env vars required for a scenario’s `credentials` mode, the affected tests **skip** with a short reason instead of failing on missing configuration.

For design goals, constraints, and future ideas, see `plan.md`.

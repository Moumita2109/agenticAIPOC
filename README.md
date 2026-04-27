# Agentic Playwright MCP POC

Proof of concept for **agentic test automation**: natural-language goals are interpreted by an LLM, which drives the same **Playwright MCP server** you configure for Cursor ([`@playwright/mcp`](https://www.npmjs.com/package/@playwright/mcp)) over **stdio** via [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk). The agent lists MCP tools, maps them to OpenAI function calling, and executes `tools/call` on the subprocess. A small local **`finish`** tool ends the loop.

**Flow:** user goal → LLM → OpenAI function calls → MCP client (`runLoginAgent`, **Login agent**) spawns `npx … @playwright/mcp` as in `mcp.json` → browser + tools inside that process → observations → LLM (repeat, with a max step limit). Add more agents under `src/agent/<feature>/`.

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

`src/tests/agentic.spec.ts` exercises login flows against whatever app you point to with `BASE_URL` and the credential env vars below (no defaults in code).

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
| `OPENAI_API_KEY` | Agent tests | If unset, agent tests are skipped. |
| `OPENAI_MODEL` | — | Optional. OpenAI chat model (default: `gpt-4o-mini`). |
| `BASE_URL` | Both login tests | Origin of the app (e.g. `https://the-internet.herokuapp.com`). No default; tests skip if missing. |
| `LOGIN_USERNAME` | Valid login test | Known-good username. |
| `LOGIN_PASSWORD` | Valid login test | Known-good password. |
| `INVALID_LOGIN_USERNAME` | Invalid login test | Credentials that must fail login. |
| `INVALID_LOGIN_PASSWORD` | Invalid login test | Credentials that must fail login. |
| `INVALID_LOGIN_EXPECTED_TEXT` | — | Optional substring the model should look for in the error UI. |
| `PLAYWRIGHT_MCP_CONFIG` | — | Optional path to an `mcp.json` file. |
| `PLAYWRIGHT_MCP_SERVER_NAME` | — | Optional MCP server key (default: `playwright`). |

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

- `src/agent/login/loginAgent.ts` — **Login agent** loop (LLM ↔ MCP stdio + `finish`, max steps)
- `src/agent/mcp/cursorMcpConfig.ts` — resolves `mcp.json` and the `playwright` server launch command
- `src/agent/mcp/playwrightMcpStdioSession.ts` — MCP `Client` + `StdioClientTransport`, `listTools` / `callTool`, roots handler
- `src/agent/tools/finishTool.ts` — `finish` tool for explicit success/summary
- `src/agent/llm.ts` — OpenAI chat completions + tool calls
- `src/tests/agentic.spec.ts` — Playwright tests that invoke `runLoginAgent`
- `src/tests/allureGlobalSetup.ts` — clears Allure output folders before each test run
- `src/tests/mcpAllureScreenshot.ts` — MCP screenshot attachment to Allure when a login test fails
- `src/utils/` — logging and shared state helpers

## Notes

- Tests are **not deterministic** in the strict sense: the LLM may choose slightly different steps; assertions still require the agent to report success and to have executed tools.
- Without `OPENAI_API_KEY`, or without `BASE_URL` / the login env vars needed for a given test, the specs call `test.skip` with a short reason instead of failing on missing configuration.

For design goals, constraints, and future ideas, see `plan.md`.

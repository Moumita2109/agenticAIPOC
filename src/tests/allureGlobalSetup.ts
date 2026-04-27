import fs from "node:fs/promises";
import path from "node:path";

/**
 * Runs once before all tests: removes previous Allure raw results and generated HTML
 * so each `playwright test` run starts from a clean reporting state.
 */
export default async function globalSetup(): Promise<void> {
  const root = process.cwd();
  for (const name of ["allure-results", "allure-report"]) {
    await fs.rm(path.join(root, name), { recursive: true, force: true });
  }
}

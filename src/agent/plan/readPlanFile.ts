import fs from "node:fs";
import path from "node:path";

export function resolvePlanMdPath(): string {
  const raw = process.env.PLAN_MD_PATH?.trim();
  if (raw && path.isAbsolute(raw)) return raw;
  if (raw) return path.resolve(process.cwd(), raw);
  return path.resolve(process.cwd(), "plan.md");
}

export function readPlanMarkdown(): string {
  const filePath = resolvePlanMdPath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`Plan file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const explicitNode = process.env.LOOP_SMOKE_NODE;
const pnpmNode = process.env.npm_node_execpath;
const nodePath = explicitNode || pnpmNode || process.execPath;
const repoRoot = path.resolve(__dirname, "../../..");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const webRoot = path.resolve(__dirname, '..');
const smokeScript = path.join(__dirname, "loop-runtime-smoke.ts");

if (!existsSync(nodePath)) {
  console.error(`[loop-smoke] Node executable not found: ${nodePath}`);
  process.exit(1);
}

console.log(`[loop-smoke] Using Node: ${nodePath}`);
console.log(`[loop-smoke] Working directory: ${webRoot}`);

const result = spawnSync(
  nodePath,
  ["--conditions=react-server", tsxCli, smokeScript],
  {
    cwd: webRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error("[loop-smoke] Failed to launch smoke script:", result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);

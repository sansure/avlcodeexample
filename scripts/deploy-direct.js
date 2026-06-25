#!/usr/bin/env node
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const credentialsPath = path.join(rootDir, "credentials.json");

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
} catch (e) {
  console.error("Cannot read credentials.json");
  process.exit(1);
}

const { api_token } = credentials;
if (!api_token) {
  console.error("No api_token in credentials.json");
  process.exit(1);
}

// Build first
console.log("Building...");
const build = spawnSync(
  process.execPath,
  [path.join(rootDir, "scripts", "build-routes.js")],
  { cwd: rootDir, stdio: "inherit", env: { ...process.env, CLOUDFLARE_API_TOKEN: api_token } }
);
if (build.status !== 0) { console.error("Build failed"); process.exit(1); }

// Deploy
console.log("Deploying...");
const deploy = spawnSync(
  process.execPath,
  [path.join(rootDir, "node_modules", ".bin", "wrangler"), "deploy", "--config", path.join(rootDir, "wrangler.toml")],
  { cwd: rootDir, stdio: "inherit", env: { ...process.env, CLOUDFLARE_API_TOKEN: api_token } }
);

if (deploy.status !== 0) {
  console.error("Deploy failed with status", deploy.status);
  process.exit(deploy.status || 1);
}
console.log("Deploy complete!");
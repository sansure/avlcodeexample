#!/usr/bin/env node
// 本地 build 脚本（不依赖全局 npm）

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const nodeBin = path.join(root, ".node/bin/node");
const buildScript = path.join(root, "scripts/build-routes.js");

console.log("🚀 执行本地 build...");

const child = spawn(nodeBin, [buildScript], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

#!/usr/bin/env node
// 本地 D1 迁移脚本

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const nodeBin = path.join(root, ".node/bin/node");
const wranglerBin = path.join(root, "node_modules/wrangler/bin/wrangler.js");

const args = [wranglerBin, "d1", "execute", "avlcodedb", "--local", "--file=./schema.sql"];

console.log("🚀 执行本地 D1 迁移...");
console.log(`   ${args.join(" ")}`);

const child = spawn(nodeBin, args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

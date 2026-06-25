#!/usr/bin/env node
// 部署脚本：读取本地 credentials.json 并调用 wrangler deploy
// 避免将 Cloudflare API Token 提交到 Git 仓库

import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const credentialsPath = path.join(rootDir, "credentials.json");

async function main() {
  let credentials;
  try {
    const raw = await fs.readFile(credentialsPath, "utf-8");
    credentials = JSON.parse(raw);
  } catch (e) {
    console.error(`❌ 无法读取 ${credentialsPath}`);
    console.error("   请先复制 credentials.example.json 为 credentials.json 并填入你的 Cloudflare 凭证。");
    process.exit(1);
  }

  const { account_id, api_token } = credentials;

  if (!api_token || typeof api_token !== "string" || api_token.trim() === "") {
    console.error("❌ credentials.json 中缺少 api_token");
    process.exit(1);
  }

  // 可选：account_id 可用于后续扩展（如 wrangler 需要）
  if (!account_id || typeof account_id !== "string" || account_id.trim() === "") {
    console.warn("⚠️  credentials.json 中缺少 account_id（当前 wrangler.toml 已指定 database_id，部署不依赖 account_id）");
  }

  // 先执行构建
  console.log("🚀 开始构建...");
  const buildResult = spawnSync(
    process.execPath,
    [path.join(rootDir, "scripts", "build-routes.js")],
    {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env, CLOUDFLARE_API_TOKEN: api_token },
    }
  );

  if (buildResult.status !== 0) {
    console.error("❌ 构建失败");
    process.exit(buildResult.status || 1);
  }

  // 执行 wrangler deploy
  console.log("🚀 开始部署...");
  const deployResult = spawnSync(
    process.execPath,
    [path.join(rootDir, "node_modules", ".bin", "wrangler"), "deploy", "--config", path.join(rootDir, "wrangler.toml")],
    {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env, CLOUDFLARE_API_TOKEN: api_token },
    }
  );

  if (deployResult.status !== 0) {
    console.error("❌ 部署失败");
    process.exit(deployResult.status || 1);
  }

  console.log("🎉 部署完成");
}

main().catch((e) => {
  console.error("部署脚本出错:", e);
  process.exit(1);
});

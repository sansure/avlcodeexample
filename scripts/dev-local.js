#!/usr/bin/env node
// 启动本地 Miniflare HTTP 服务器（用于浏览器访问测试）

import { Miniflare } from "miniflare";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function readModule(relativePath) {
  return {
    type: "ESModule",
    path: path.join(rootDir, relativePath),
    contents: await fs.readFile(path.join(rootDir, relativePath), "utf-8"),
  };
}

async function initD1(db) {
  let sql = await fs.readFile(path.join(rootDir, "schema.sql"), "utf-8");
  sql = sql.replace(/--[^\n]*/g, "");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const batch = statements.map((s) => db.prepare(s + ";"));
  await db.batch(batch);
}

async function run() {
  const modules = [
    await readModule("src/index.js"),
    await readModule("src/routes/index.js"),
    await readModule("src/routes/gist/index.js"),
  ];

  const mf = new Miniflare({
    modules,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    compatibilityDate: "2024-04-05",
    bindings: {
      SITE_BASE_URL: "https://example.avlcodesite.xyz",
      DEFAULT_TTL_DAYS: "30",
    },
    d1Databases: {
      AVLCODEDB: "avlcodedb-local",
    },
    r2Buckets: ["AVLCODE_BUCKET", "GIST_BUCKET"],
  });

  const url = await mf.ready;
  const db = await mf.getD1Database("AVLCODEDB");
  await initD1(db);

  console.error("MINIFLARE_URL=" + url.origin);
  console.log("Server ready at " + url.origin);

  // 保持运行
  process.stdin.resume();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

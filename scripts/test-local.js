#!/usr/bin/env node
// 本地模拟测试脚本：使用 Miniflare 启动 Worker 并发送测试请求
// 不依赖远程 Cloudflare 部署，不上传任何内容

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
  console.log("🗄️  初始化本地 D1 数据库...");
  let sql = await fs.readFile(path.join(rootDir, "schema.sql"), "utf-8");

  // 移除单行注释并按分号分割语句
  sql = sql.replace(/--[^\n]*/g, "");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // 使用 batch 批量执行
  const batch = statements.map((s) => db.prepare(s + ";"));
  await db.batch(batch);

  console.log(`✅ D1 数据库初始化完成（${statements.length} 条语句）`);
}

async function run() {
  console.log("🚀 启动本地 Miniflare 模拟环境...");

  // 读取所有 Worker 模块并作为 contents 传入，避免动态 import 在 Miniflare 中解析失败
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

  try {
    await mf.ready;
    console.log("✅ Miniflare 已就绪");

    // 初始化 D1 表结构
    const db = await mf.getD1Database("AVLCODEDB");
    await initD1(db);

    const tests = [
      { name: "首页", url: "https://example.avlcodesite.xyz/" },
      { name: "Gist 首页", url: "https://example.avlcodesite.xyz/gist/" },
      { name: "API 项目列表", url: "https://example.avlcodesite.xyz/api/projects" },
    ];

    for (const t of tests) {
      console.log(`\n🧪 测试: ${t.name} (${t.url})`);
      const res = await mf.dispatchFetch(t.url);
      const body = await res.text();
      console.log(`   状态: ${res.status}, 长度: ${body.length} bytes`);
      if (res.status >= 400) {
        console.log(`   响应: ${body.slice(0, 200)}`);
        process.exitCode = 1;
      }
    }

    // 测试 Gist API：创建公开 Gist
    console.log("\n🧪 测试: 创建公开 Gist");
    const createRes = await mf.dispatchFetch(
      "https://example.avlcodesite.xyz/gist/api/gists",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "测试 Gist",
          description: "本地模拟测试",
          is_public: true,
          ttl_days: 7,
          files: [
            { filename: "hello.js", content: "console.log('hello world');" },
            { filename: "README.md", content: "# Test\nThis is a test gist." },
          ],
        }),
      }
    );
    const createBody = await createRes.text();
    console.log(`   状态: ${createRes.status}`);
    if (createRes.status !== 201) {
      console.log(`   响应: ${createBody.slice(0, 300)}`);
      process.exitCode = 1;
    }

    let gistId = null;
    if (createRes.status === 201) {
      const data = JSON.parse(createBody);
      gistId = data.id;
      console.log(`   ✅ Gist 创建成功: id=${gistId}, 文件数=${data.files?.length ?? 0}`);
    }

    if (gistId) {
      // 测试 API 获取 Gist
      console.log(`\n🧪 测试: API 获取 Gist (${gistId})`);
      const apiRes = await mf.dispatchFetch(`https://example.avlcodesite.xyz/gist/api/gists/${gistId}`);
      const apiBody = await apiRes.text();
      console.log(`   状态: ${apiRes.status}`);
      if (apiRes.status !== 200) {
        console.log(`   响应: ${apiBody.slice(0, 300)}`);
        process.exitCode = 1;
      } else {
        const apiData = JSON.parse(apiBody);
        console.log(`   ✅ 文件数: ${apiData.files?.length ?? 0}`);
      }

      // 测试 Raw 文件（正确路径：/gist/raw/:id/:filename）
      console.log(`\n🧪 测试: Raw 文件 (${gistId}/hello.js)`);
      const rawRes = await mf.dispatchFetch(`https://example.avlcodesite.xyz/gist/raw/${gistId}/hello.js`);
      const rawBody = await rawRes.text();
      console.log(`   状态: ${rawRes.status}, 内容: ${rawBody.slice(0, 80)}`);
      if (rawRes.status !== 200) process.exitCode = 1;

      // 测试最新公开 Gist 列表
      console.log("\n🧪 测试: 最新公开 Gist 列表");
      const listRes = await mf.dispatchFetch("https://example.avlcodesite.xyz/gist/api/gists?public=1&limit=10");
      const listBody = await listRes.text();
      console.log(`   状态: ${listRes.status}`);
      if (listRes.status !== 200) {
        console.log(`   响应: ${listBody.slice(0, 300)}`);
        process.exitCode = 1;
      } else {
        const listData = JSON.parse(listBody);
        const firstFiles = listData.gists?.[0]?.files ?? [];
        console.log(`   ✅ Gist 数: ${listData.gists?.length ?? 0}, 首个 Gist 文件数: ${firstFiles.length}`);
      }
    }

    if (process.exitCode) {
      console.log("\n❌ 部分测试未通过");
    } else {
      console.log("\n🎉 本地模拟测试全部通过");
    }
  } catch (e) {
    console.error("❌ 测试失败:", e);
    process.exitCode = 1;
  } finally {
    await mf.dispose();
  }
}

run();

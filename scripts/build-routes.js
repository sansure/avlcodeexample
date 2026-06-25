#!/usr/bin/env node
// 构建脚本：将子项目合并到根目录 Worker
// 开发时子目录保持独立，部署/测试时运行此脚本合并

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { subProjects } from "../routes.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const routesDir = path.join(rootDir, "src", "routes");

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
    } else {
      await fs.copyFile(srcPath, dstPath);
    }
  }
}

async function cleanRoutes() {
  try {
    await fs.rm(routesDir, { recursive: true, force: true });
    await fs.mkdir(routesDir, { recursive: true });
  } catch (e) {
    console.error("清理 routes 目录失败:", e);
    throw e;
  }
}

async function build() {
  console.log("🚀 开始合并子项目到根目录...");
  await cleanRoutes();

  for (const project of subProjects) {
    const srcDir = path.join(rootDir, project.dir, "src");
    const dstDir = path.join(routesDir, project.name);

    try {
      await fs.access(srcDir);
    } catch {
      console.warn(`⚠️  跳过 ${project.name}: 目录不存在 ${srcDir}`);
      continue;
    }

    await copyDir(srcDir, dstDir);
    console.log(`✅ 已合并: ${project.name} -> src/routes/${project.name}/`);
  }

  // 生成路由注册文件
  const imports = subProjects
    .map((p) => `import ${p.name} from "./${p.name}/index.js";`)
    .join("\n");

  const routeMap = subProjects
    .map((p) => `  "${p.route}": ${p.name},`)
    .join("\n");

  const indexContent = `${imports}

// 子项目路由映射表
// 由 scripts/build-routes.js 自动生成，请勿手动修改
export const routes = {
${routeMap}
};

export const subProjectList = [
${subProjects
  .map(
    (p) =>
      `  { name: "${p.name}", route: "${p.route}", description: "${p.description}" },`
  )
  .join("\n")}
];
`;

  await fs.writeFile(path.join(routesDir, "index.js"), indexContent);
  console.log("✅ 已生成: src/routes/index.js");
  console.log("🎉 合并完成");
}

build().catch((e) => {
  console.error("构建失败:", e);
  process.exit(1);
});

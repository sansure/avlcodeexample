import gist from "./gist/index.js";

// 子项目路由映射表
// 由 scripts/build-routes.js 自动生成，请勿手动修改
export const routes = {
  "/gist/": gist,
};

export const subProjectList = [
  { name: "gist", route: "/gist/", description: "基于 Cloudflare Workers + D1 + R2 的 Gist 代码片段分享服务（支持配额统计与限制）" },
];

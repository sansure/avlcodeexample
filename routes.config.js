// 子项目路由配置
// 开发时：各子目录是独立 Worker 项目
// 部署/测试时：build 脚本会把这些子目录合并到根目录 Worker

export const subProjects = [
  {
    name: "gist",
    dir: "ac-cloudflare-r2-d1-gist",
    route: "/gist/",
    description: "基于 Cloudflare Workers + D1 + R2 的 Gist 代码片段分享服务（支持配额统计与限制）",
  },
  {
    name: "review",
    dir: "ac-review-tool",
    route: "/review/",
    description: "ac 审稿小工具：稿件提交、分配审稿人、审稿意见与附件管理（共享 R2/D1 配额限制）",
  },
  // 后续可以在这里添加更多子项目
  // {
  //   name: "counter",
  //   dir: "ac-memfire-cloud-counter",
  //   route: "/counter/",
  //   description: "免费访问计数器",
  // },
];

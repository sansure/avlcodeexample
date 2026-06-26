// 模拟浏览器上传中文文件名附件
const formData = new FormData();
const blob = new Blob(["hello world 中文内容"], { type: "text/plain" });

// 先登录获取 cookie
const loginRes = await fetch("http://127.0.0.1:8912/review/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: "admin" }),
});
const loginData = await loginRes.json();
console.log("login:", loginRes.status, loginData.user);

const cookie = loginRes.headers.get("set-cookie");
console.log("cookie:", cookie);

// 创建一篇稿件
const createRes = await fetch("http://127.0.0.1:8912/review/api/submissions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Cookie": cookie,
  },
  body: JSON.stringify({
    title: "测试稿件",
    category: "测试",
    content: "测试内容",
  }),
});
const createData = await createRes.json();
console.log("create submission:", createRes.status, createData);

const submissionId = createData.submission?.id || createData.id;

// 上传中文文件名附件
const filename = "测试文件.txt";
const encodedFilename = encodeURIComponent(filename);
const uploadRes = await fetch(
  `http://127.0.0.1:8912/review/api/submissions/${submissionId}/attachments?filename=${encodedFilename}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Cookie": cookie,
    },
    body: blob,
  }
);
const uploadData = await uploadRes.json();
console.log("upload:", uploadRes.status, uploadData);

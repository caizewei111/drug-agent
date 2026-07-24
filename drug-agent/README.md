# 药品说明书智能对比助手

基于 AI 智能体的药品说明书对比前端应用。纯静态页面 + Vercel Serverless 代理，部署后即可通过公网链接访问。

## 功能

- **文本输入**：并排粘贴两份药品说明书，带字数统计与清空
- **文件上传**：支持 PDF / Word(.docx) / TXT，前端解析提取文本
- **核心差异摘要**：醒目高亮表格，展示【适应症】【用法用量】【禁忌】【不良反应】等关键差异
- **完整对比报告**：默认折叠，可展开查看详尽逐项对比
- **跨域代理**：内置 Serverless 代理，公网部署后可正常调用智能体接口

## 智能体接口说明

依据接口文档，调用流程为：

1. **新建会话** `POST /api/v2/openapi/session` → 获得 `session_id`
2. **发起对话** `POST /api/v2/openapi/chat` → 传入 `query` + `session_id`，获得智能体回答

本项目通过 `/api/agent` Serverless 函数在服务端依次完成上述两步，并补上 CORS 头，使前端同源调用。

### 默认配置

| 配置项 | 默认值 |
|--------|--------|
| 开放平台 HOST | `https://seaf.360.cn:30080` |
| 智能体 ID | `7606` |
| 访问令牌 Token | `AckuHVUgqrA2kR8lvrrFXzphmOkmgyOS` |

> Token 默认内置在前端设置中（保存在浏览器 localStorage）。
> 生产环境建议改为在 Vercel 项目 **Settings → Environment Variables** 添加 `AGENT_API_KEY`，避免暴露。

## 文件结构

```
drug-agent/
├── index.html        # 页面（含内联前端 JS，避免被 Vercel 误识别为函数）
├── styles.css        # 样式
├── vercel.json       # Vercel 部署配置
├── package.json
├── server.js         # 本地开发服务器（静态服务 + API 代理）
├── api/
│   └── agent.js      # Serverless 跨域代理（新建会话 + 发起对话）
└── README.md
```

> ⚠️ 前端 JS 已内联到 `index.html`，根目录**没有**独立的 `.js` 前端文件。
> 这样可避免 Vercel 把前端脚本（含 `document` 等 DOM 操作）误当成 Serverless Function 执行，
> 从而报 `ReferenceError: document is not defined`。后端函数仅存在于 `api/` 目录下。

## 部署到 Vercel（推荐，获得公网链接）

### 方式一：拖拽上传（最快）

1. 打开 https://vercel.com ，登录
2. 点击 **Add New → Project**
3. 选择 **Deploy without Git**（或直接拖拽文件夹到部署区）
4. 把整个 `drug-agent` 文件夹拖入
5. 点击 **Deploy**
6. 等待几秒，获得链接，形如 `https://drug-agent-xxx.vercel.app`

### 方式二：Git 仓库部署（便于后续更新）

1. 把 `drug-agent` 文件夹推送到 GitHub 仓库
2. 在 Vercel 中 **Import** 该仓库
3. Framework Preset 选 **Other**，其余保持默认
4. 点击 **Deploy**

### 配置鉴权（推荐）

在 Vercel 项目 **Settings → Environment Variables** 添加：

- `AGENT_API_KEY` = `AckuHVUgqrA2kR8lvrrFXzphmOkmgyOS`

设置后，代理函数会优先使用环境变量中的 Token，前端设置中的 Token 可留空。

### Vercel 运行时要求

- `package.json` 已声明 `engines.node >=18`，Vercel 会据此使用 Node 18 运行时
- `api/agent.js` 使用 Node 内置 `https` 模块发起请求（不依赖 `fetch`），兼容性最佳
- `vercel.json` 已配置 `maxDuration: 300`，避免长耗时对比任务超时

## 本地运行（推荐，保证完整流程）

```bash
cd drug-agent
node server.js
# 浏览器打开 http://localhost:3000
```

`server.js` 同时提供静态文件服务与 `/api/agent` 接口代理，保证
「输入/上传文件 → 调用智能体 → 接收返回 → 展示结果」完整流程可运行。

> ⚠️ 请勿直接双击 `index.html`（file:// 协议）打开，否则 `/api/agent` 代理不可用，
> 会导致请求失败、无法加载结果。务必通过 `node server.js` 启动后访问。

## 跨域说明

浏览器直接调用 `https://seaf.360.cn:30080` 会被 CORS 拦截。
本项目通过 `/api/agent` Serverless 函数在服务端转发请求并补上 CORS 头，
使前端同源调用，部署后开箱即用。

## 技术栈

- 原生 HTML / CSS / JavaScript（无构建依赖）
- pdf.js（PDF 解析）、mammoth.js（Word 解析）
- Vercel Serverless Functions（Node.js 18+，使用内置 `fetch`）

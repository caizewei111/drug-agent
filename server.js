/**
 * 本地开发服务器（ESM）
 * 同时提供静态文件服务 + 智能体接口代理（新建会话 + 发起对话）
 *
 * 用法：
 *   node server.js
 *   浏览器打开 http://localhost:3000
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = "https://seaf.360.cn:30080";
const TOKEN = process.env.AGENT_API_KEY || "AckuHVUgqrA2kR8lvrrFXzphmOkmgyOS";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ---------- 工具：发起请求（Node 18+ 内置 fetch） ----------
async function postJson(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = token.startsWith("Bearer ") ? token : "Bearer " + token;
  }
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
  return { ok: resp.ok, status: resp.status, json };
}

// 从对话响应中提取回答文本
function extractAnswer(json) {
  if (!json) return "";
  if (typeof json === "string") return json;
  let data = json.data != null ? json.data : json;
  if (Array.isArray(data)) {
    const msgs = data.filter((i) => i && i.message).map((i) => i.message);
    const ans =
      msgs.find((m) => m.type === "answer") ||
      msgs.find((m) => m.type === "confirmed") ||
      msgs.find((m) => m.role === "assistant") ||
      msgs[msgs.length - 1];
    if (ans && ans.content) return ans.content;
    const joined = msgs.filter((m) => m.role === "assistant" && m.content).map((m) => m.content).join("\n");
    if (joined) return joined;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.list)) {
      const msgs = data.list.filter((m) => m && m.content);
      const ans =
        msgs.find((m) => m.type === "answer") ||
        msgs.find((m) => m.type === "confirmed") ||
        msgs.find((m) => m.role === "assistant") ||
        msgs[msgs.length - 1];
      if (ans && ans.content) return ans.content;
    }
    if (data.message && data.message.content) return data.message.content;
    if (data.content) return data.content;
  }
  return JSON.stringify(json);
}

// ---------- 代理：/api/agent ----------
async function handleAgent(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf-8");
  let body;
  try { body = JSON.parse(raw); } catch (e) { body = {}; }

  const query = body.query || body.message || body.content || body.input || "";
  if (!query) {
    return respond(res, 400, { error: "缺少 query 参数" });
  }

  try {
    // 1. 新建会话
    const sessionBody = {};
    if (body.external_user) sessionBody.external_user = body.external_user;

    const sResp = await postJson(`${HOST}/api/v2/openapi/session`, sessionBody, TOKEN);
    if (!sResp.ok || sResp.json?.context?.code !== 0) {
      return respond(res, 502, {
        error: "新建会话失败",
        detail: sResp.json?.context?.message || `HTTP ${sResp.status}`,
      });
    }
    const sessionId = sResp.json.data?.session_id;
    if (!sessionId) {
      return respond(res, 502, { error: "新建会话未返回 session_id" });
    }

    // 2. 发起对话
    const chatBody = { query, stream: false, session_id: sessionId };
    if (body.external_user) chatBody.external_user = body.external_user;

    const cResp = await postJson(`${HOST}/api/v2/openapi/chat`, chatBody, TOKEN);
    if (!cResp.ok) {
      return respond(res, 502, {
        error: "发起对话失败",
        detail: cResp.json?.context?.message || `HTTP ${cResp.status}`,
      });
    }

    const answer = extractAnswer(cResp.json);
    return respond(res, 200, { answer, session_id: sessionId });
  } catch (err) {
    return respond(res, 502, { error: "代理请求上游失败", detail: err && err.message ? err.message : String(err) });
  }
}

function respond(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

// ---------- 静态文件服务 ----------
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(__dirname, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ""));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ---------- 主服务 ----------
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "POST" && req.url.split("?")[0] === "/api/agent") {
    return handleAgent(req, res);
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  药品说明书智能对比助手已启动：`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
});

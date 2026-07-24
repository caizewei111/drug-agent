/**
 * Vercel Serverless Function —— 智能体接口跨域代理
 * 路由：POST /api/agent
 *
 * 作用：浏览器直接调用 https://seaf.360.cn:30080 会被 CORS 拦截，
 * 本函数在服务端转发请求并补上 CORS 响应头，使前端可同源调用。
 *
 * 调用流程（依据接口文档）：
 *   1. POST /api/v2/openapi/session   新建会话，获得 session_id
 *   2. POST /api/v2/openapi/chat      发起对话，传入 query + session_id
 *
 * 返回：{ answer: string, session_id: string }
 *
 * 注意：使用 Node 内置 https 模块发起请求，不依赖 fetch，
 * 兼容所有 Node 版本。本文件绝对不包含任何 document/window/DOM 操作。
 */

import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

const DEFAULT_HOST = "https://seaf.360.cn:30080";
const DEFAULT_TOKEN = "AckuHVUgqrA2kR8lvrrFXzphmOkmgyOS";

// 使用原生 Node.js HTTP 响应方法
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(body);
}

/**
 * 用 Node 内置 https/http 模块发起 POST 请求
 * 返回 { ok, status, text }
 */
function requestPost(urlStr, bodyObj, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(bodyObj);
    const lib = url.protocol === "https:" ? https : http;

    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData),
    };
    if (token) {
      headers["Authorization"] = token.startsWith("Bearer ") ? token : "Bearer " + token;
    }

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers,
    };

    const req = lib.request(options, (resp) => {
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode, text });
      });
    });

    req.on("error", (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

export default async function handler(req, res) {
  // ---------- CORS 预检 ----------
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "仅支持 POST 请求" });
  }

  try {
    const body = req.body || {};
    const host = (body.host || DEFAULT_HOST).replace(/\/+$/, "");
    const query = body.query || body.message || body.content || body.input || "";
    const externalUser = body.external_user || "";

    if (!query) {
      return sendJson(res, 400, { error: "缺少 query 参数" });
    }

    // ---------- 鉴权 ----------
    const apiKey = body.api_key || process.env.AGENT_API_KEY || DEFAULT_TOKEN;

    // ---------- 1. 新建会话 ----------
    const sessionBody = {};
    if (externalUser) sessionBody.external_user = externalUser;

    const sResp = await requestPost(`${host}/api/v2/openapi/session`, sessionBody, apiKey);
    let sessionJson;
    try { sessionJson = JSON.parse(sResp.text); } catch (e) { sessionJson = { _raw: sResp.text }; }

    if (!sResp.ok || !sessionJson || sessionJson.context?.code !== 0) {
      return sendJson(res, 502, {
        error: "新建会话失败",
        detail: sessionJson?.context?.message || `HTTP ${sResp.status}`,
      });
    }

    const sessionId = sessionJson.data?.session_id;
    if (!sessionId) {
      return sendJson(res, 502, { error: "新建会话未返回 session_id" });
    }

    // ---------- 2. 发起对话 ----------
    const chatBody = { query, stream: false, session_id: sessionId };
    if (externalUser) chatBody.external_user = externalUser;

    const cResp = await requestPost(`${host}/api/v2/openapi/chat`, chatBody, apiKey);
    let chatJson;
    try { chatJson = JSON.parse(cResp.text); } catch (e) { chatJson = { _raw: cResp.text }; }

    if (!cResp.ok) {
      return sendJson(res, 502, {
        error: "发起对话失败",
        detail: chatJson?.context?.message || `HTTP ${cResp.status}`,
      });
    }

    const answer = extractAnswer(chatJson);
    return sendJson(res, 200, { answer, session_id: sessionId });
  } catch (err) {
    return sendJson(res, 502, {
      error: "代理请求上游失败",
      detail: err && err.message ? err.message : String(err),
    });
  }
}

// ---------- 工具函数 ----------

function extractAnswer(json) {
  if (!json) return "";
  if (typeof json === "string") return json;

  let data = json.data != null ? json.data : json;

  if (Array.isArray(data)) {
    const msgs = data.filter((item) => item && item.message).map((item) => item.message);
    const answerMsg =
      msgs.find((m) => m.type === "answer") ||
      msgs.find((m) => m.type === "confirmed") ||
      msgs.find((m) => m.role === "assistant") ||
      msgs[msgs.length - 1];
    if (answerMsg && answerMsg.content) return answerMsg.content;
    const joined = msgs.filter((m) => m.role === "assistant" && m.content).map((m) => m.content).join("\n");
    if (joined) return joined;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.list)) {
      const msgs = data.list.filter((m) => m && m.content);
      const answerMsg =
        msgs.find((m) => m.type === "answer") ||
        msgs.find((m) => m.type === "confirmed") ||
        msgs.find((m) => m.role === "assistant") ||
        msgs[msgs.length - 1];
      if (answerMsg && answerMsg.content) return answerMsg.content;
    }
    if (data.message && data.message.content) return data.message.content;
    if (data.content) return data.content;
    if (data.answer) return data.answer;
  }
  return JSON.stringify(json);
}

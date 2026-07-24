/* ============================================================
 * 药品说明书智能对比助手 - 前端逻辑
 *
 * 调用流程：
 *   前端 -> POST /api/agent (同源 Serverless 代理)
 *   代理 -> 新建会话 + 发起对话 -> 返回 { answer, session_id }
 *
 * 注意：本文件为前端脚本，仅在浏览器中执行。
 *   不会在页面加载时自动发起请求，只在用户点击按钮时调用。
 * ============================================================ */

(function () {
  "use strict";

  // ---------- 默认配置 ----------
  const DEFAULT_API_URL = "/api/agent";
  const DEFAULT_TOKEN = "AckuHVUgqrA2kR8lvrrFXzphmOkmgyOS";

  // ---------- DOM 引用 ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- 状态 ----------
  const state = {
    mode: "text",
    loading: false, // 防重复点击
    fileText: { A: "", B: "" },
    fileName: { A: "", B: "" },
    settings: {
      apiUrl: DEFAULT_API_URL,
      apiKey: DEFAULT_TOKEN,
    },
  };

  // ---------- 初始化 ----------
  function init() {
    // 防御性：确保页面初始状态正常，不显示 loading
    state.loading = false;
    const overlay = $("#loadingOverlay");
    if (overlay) overlay.hidden = true;
    const btn = $("#compareBtn");
    if (btn) btn.disabled = false;

    loadSettings();
    bindEvents();
    initPdfWorker();
  }

  function initPdfWorker() {
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  }

  // ---------- 设置持久化 ----------
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("drugAgentSettings") || "{}");
      state.settings = {
        apiUrl: saved.apiUrl || DEFAULT_API_URL,
        apiKey: saved.apiKey || DEFAULT_TOKEN,
      };
    } catch (e) {}
    $("#apiUrlInput").value = state.settings.apiUrl;
    $("#apiKeyInput").value = state.settings.apiKey;
  }

  function saveSettings() {
    state.settings.apiUrl = $("#apiUrlInput").value.trim() || DEFAULT_API_URL;
    state.settings.apiKey = $("#apiKeyInput").value.trim();
    localStorage.setItem("drugAgentSettings", JSON.stringify(state.settings));
    $("#settingsHint").textContent = "设置已保存 ✓";
    setTimeout(() => { $("#settingsHint").textContent = ""; }, 2000);
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $("#settingsToggle").addEventListener("click", toggleSettings);
    $("#saveSettingsBtn").addEventListener("click", saveSettings);

    $("#tabText").addEventListener("click", () => switchTab("text"));
    $("#tabFile").addEventListener("click", () => switchTab("file"));

    $("#textA").addEventListener("input", () => updateCount("textA", "countA"));
    $("#textB").addEventListener("input", () => updateCount("textB", "countB"));

    $$(".clear-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-target");
        $("#" + id).value = "";
        updateCount(id, id === "textA" ? "countA" : "countB");
      });
    });

    $$(".dropzone").forEach((dz) => {
      const drug = dz.getAttribute("data-drug");
      const input = $(`.file-input[data-drug="${drug}"]`);
      dz.addEventListener("click", () => input.click());
      dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
      dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        dz.classList.remove("dragover");
        if (e.dataTransfer.files.length) handleFile(drug, e.dataTransfer.files[0]);
      });
      input.addEventListener("change", (e) => {
        if (e.target.files.length) handleFile(drug, e.target.files[0]);
      });
    });

    $$(".upload-card").forEach((card) => {
      const drug = card.getAttribute("data-drug");
      card.querySelector(".reupload-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        $(`.file-input[data-drug="${drug}"]`).click();
      });
      card.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        removeFile(drug);
      });
    });

    $("#compareBtn").addEventListener("click", startCompare);
    $("#toggleDetailBtn").addEventListener("click", toggleDetail);
  }

  function toggleSettings() {
    const panel = $("#settingsPanel");
    panel.hidden = !panel.hidden;
  }

  function switchTab(mode) {
    state.mode = mode;
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".tab-panel").forEach((p) => p.classList.remove("active"));
    if (mode === "text") {
      $("#tabText").classList.add("active");
      $("#textMode").classList.add("active");
    } else {
      $("#tabFile").classList.add("active");
      $("#fileMode").classList.add("active");
    }
  }

  function updateCount(textId, countId) {
    const val = $("#" + textId).value;
    $("#" + countId).textContent = val.length + " 字";
  }

  // ---------- 文件处理 ----------
  async function handleFile(drug, file) {
    const card = $(`.upload-card[data-drug="${drug}"]`);
    const status = card.querySelector(".file-status");
    const dropzone = card.querySelector(".dropzone");
    const fileInfo = card.querySelector(".file-info");
    const fileNameEl = card.querySelector(".file-name");

    const name = file.name.toLowerCase();
    const ext = name.split(".").pop();

    if (!["pdf", "docx", "txt", "text"].includes(ext)) {
      showFileStatus(status, "不支持的文件格式，请上传 PDF / Word(.docx) / TXT", "error");
      return;
    }

    showFileStatus(status, "正在解析文件……");
    dropzone.style.display = "none";
    fileInfo.hidden = false;
    fileNameEl.textContent = file.name;

    try {
      let text = "";
      if (ext === "pdf") text = await parsePdf(file);
      else if (ext === "docx") text = await parseDocx(file);
      else text = await parseTxt(file);

      if (!text || !text.trim()) throw new Error("未能从文件中提取到文本内容");

      state.fileText[drug] = text;
      state.fileName[drug] = file.name;
      showFileStatus(status, `解析成功，共 ${text.length} 字`, "success");
    } catch (err) {
      showFileStatus(status, "解析失败：" + err.message, "error");
      state.fileText[drug] = "";
      state.fileName[drug] = "";
      dropzone.style.display = "";
      fileInfo.hidden = true;
    }
  }

  function removeFile(drug) {
    const card = $(`.upload-card[data-drug="${drug}"]`);
    const dropzone = card.querySelector(".dropzone");
    const fileInfo = card.querySelector(".file-info");
    const status = card.querySelector(".file-status");
    const input = $(`.file-input[data-drug="${drug}"]`);
    state.fileText[drug] = "";
    state.fileName[drug] = "";
    input.value = "";
    dropzone.style.display = "";
    fileInfo.hidden = true;
    status.textContent = "";
    status.className = "file-status";
  }

  function showFileStatus(el, msg, type) {
    el.textContent = msg;
    el.className = "file-status" + (type ? " " + type : "");
  }

  async function parsePdf(file) {
    if (!window.pdfjsLib) throw new Error("PDF 解析库未加载");
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return text.trim();
  }

  async function parseDocx(file) {
    if (!window.mammoth) throw new Error("Word 解析库未加载");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return (result.value || "").trim();
  }

  function parseTxt(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result || "").trim());
      reader.onerror = () => reject(new Error("读取文本文件失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  // ---------- 获取输入文本 ----------
  function getInputTexts() {
    if (state.mode === "text") {
      return { a: $("#textA").value.trim(), b: $("#textB").value.trim() };
    }
    return { a: state.fileText.A, b: state.fileText.B };
  }

  // ---------- 开始对比（仅按钮点击触发） ----------
  async function startCompare() {
    // 防重复点击：正在分析中则直接忽略
    if (state.loading) return;

    const { a, b } = getInputTexts();
    if (!a || !b) {
      showActionHint("请确保两份药品说明书内容均已填写/上传", true);
      return;
    }

    showActionHint("");
    state.loading = true;
    showLoading(true, "分析中…");

    // 30 秒超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const result = await callAgent(a, b, controller.signal);
      $("#resultsSection").hidden = true;
      renderResults(result);
      $("#resultsSection").hidden = false;
      $("#resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      if (err.name === "AbortError") {
        showActionHint("请求超时，请重试", true);
      } else {
        showActionHint("对比失败：" + err.message + "（可重试）", true);
      }
    } finally {
      clearTimeout(timeoutId);
      state.loading = false;
      showLoading(false);
    }
  }

  function showActionHint(msg, isError) {
    const el = $("#actionHint");
    el.textContent = msg;
    el.style.color = isError ? "var(--danger)" : "var(--text-light)";
  }

  function showLoading(show, text) {
    $("#loadingOverlay").hidden = !show;
    $("#compareBtn").disabled = show;
    if (text) $("#loadingText").textContent = text;
  }

  // ---------- 调用智能体 API（经同源代理 /api/agent） ----------
  async function callAgent(textA, textB, signal) {
    const { apiUrl, apiKey } = state.settings;
    const prompt = buildPrompt(textA, textB);

    const body = { query: prompt };
    if (apiKey) body.api_key = apiKey;

    let response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (netErr) {
      if (netErr.name === "AbortError") throw netErr;
      throw new Error("网络请求失败，请检查网络连接");
    }

    if (!response.ok) {
      const errText = await response.text();
      let detail = errText;
      try { detail = JSON.parse(errText).error || errText; } catch (e) {}
      throw new Error(`接口返回错误 ${response.status}：${String(detail).slice(0, 200)}`);
    }

    const data = await response.json();

    if (data && typeof data.answer === "string" && data.answer.trim()) {
      return data.answer;
    }
    throw new Error("接口未返回有效内容：" + JSON.stringify(data).slice(0, 200));
  }

  // ---------- 构造提示词 ----------
  function buildPrompt(textA, textB) {
    return [
      "请对比以下两份药品说明书，并输出对比结果。",
      "",
      "【药品A说明书】",
      textA,
      "",
      "【药品B说明书】",
      textB,
      "",
      "请按以下要求输出：",
      "1. 先输出「核心差异摘要」，针对【适应症】【用法用量】【禁忌】【不良反应】等关键维度，",
      "   用表格形式列出差异（维度 | 药品A | 药品B | 差异说明）。",
      "2. 再输出「完整对比报告」，逐项详尽对比两份说明书的全部条目，条理清晰。",
      "3. 如内容相同请明确标注「一致」。",
    ].join("\n");
  }

  // ---------- 结果渲染 ----------
  function renderResults(rawText) {
    const parsed = parseAgentResult(rawText);
    renderSummary(parsed.summary);
    renderDetail(parsed.detail, rawText);
  }

  function parseAgentResult(text) {
    const result = { summary: [], detail: "" };

    const jsonMatch = extractJsonBlock(text);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch);
        if (Array.isArray(obj.summary)) result.summary = obj.summary;
        if (obj.detail) result.detail = obj.detail;
        if (result.summary.length || result.detail) return result;
      } catch (e) {}
    }

    const tables = extractMarkdownTables(text);
    if (tables.length) result.summary = parseTableToRows(tables[0]);

    result.detail = jsonMatch ? text.replace(jsonMatch, "").trim() : text;
    return result;
  }

  function extractJsonBlock(text) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      const inner = fence[1].trim();
      if (inner.startsWith("{") || inner.startsWith("[")) return inner;
    }
    const objMatch = text.match(/\{[\s\S]*"summary"[\s\S]*\}/);
    if (objMatch) return objMatch[0];
    return null;
  }

  function extractMarkdownTables(text) {
    const tableRegex = /(\|[^\n]+\|\n)(\|[\s:|-]+\|\n)((?:\|[^\n]+\|\n?)+)/g;
    const tables = [];
    let m;
    while ((m = tableRegex.exec(text)) !== null) tables.push(m[0]);
    return tables;
  }

  function parseTableToRows(tableText) {
    const lines = tableText.trim().split("\n").filter((l) => l.trim());
    if (lines.length < 3) return [];
    const parseRow = (line) => line.split("|").map((c) => c.trim()).filter((c) => c !== "");
    const header = parseRow(lines[0]);
    const rows = [];
    for (let i = 2; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      if (cells.length) rows.push(cells);
    }
    return rows.map((cells) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cells[idx] || ""; });
      return obj;
    });
  }

  function renderSummary(rows) {
    const tbody = $("#summaryBody");
    tbody.innerHTML = "";

    if (!rows || !rows.length) {
      tbody.innerHTML = `
        <tr><td colspan="4" class="empty-result">
          <div class="empty-icon">ℹ️</div>
          智能体未返回结构化摘要，请查看下方完整对比报告。
        </td></tr>`;
      return;
    }

    rows.forEach((row) => {
      let dim, a, b, diff;
      if (Array.isArray(row)) {
        [dim, a, b, diff] = row;
      } else {
        dim = row["维度"] || row["差异维度"] || row["dimension"] || row["项目"] || "";
        a = row["药品A"] || row["药品 A"] || row["A"] || row["药品a"] || "";
        b = row["药品B"] || row["药品 B"] || row["B"] || row["药品b"] || "";
        diff = row["差异说明"] || row["差异"] || row["说明"] || row["备注"] || "";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="dim-cell">${escapeHtml(dim || "—")}</td>
        <td>${escapeHtml(a || "—")}</td>
        <td>${escapeHtml(b || "—")}</td>
        <td class="diff-cell">${formatDiffTag(diff)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function formatDiffTag(diff) {
    if (!diff) return "—";
    const text = escapeHtml(diff);
    let cls = "medium";
    if (/一致|相同|无差异|no\s*difference|same/i.test(diff)) cls = "low";
    else if (/禁忌|严重|禁用|慎用|危险|contraindication/i.test(diff)) cls = "high";
    return `<span class="diff-tag ${cls}">${text}</span>`;
  }

  function renderDetail(detail, rawText) {
    const content = detail || rawText || "（无内容）";
    $("#detailContent").innerHTML = markdownToHtml(content);
    $("#detailContent").classList.add("collapsed");
    $("#toggleDetailBtn").textContent = "展开";
  }

  function toggleDetail() {
    const el = $("#detailContent");
    const btn = $("#toggleDetailBtn");
    if (el.classList.contains("collapsed")) {
      el.classList.remove("collapsed");
      btn.textContent = "收起";
    } else {
      el.classList.add("collapsed");
      btn.textContent = "展开";
    }
  }

  function markdownToHtml(md) {
    let html = escapeHtml(md);
    html = html.replace(
      /(\|[^\n]+\|\n)(\|[\s:|-]+\|\n)((?:\|[^\n]+\|\n?)+)/g,
      (match) => {
        const lines = match.trim().split("\n").filter((l) => l.trim());
        const parseRow = (line) => line.split("|").map((c) => c.trim()).filter((c) => c !== "");
        const header = parseRow(lines[0]);
        const body = lines.slice(2).map(parseRow);
        let t = '<table><thead><tr>';
        header.forEach((h) => { t += `<th>${h}</th>`; });
        t += '</tr></thead><tbody>';
        body.forEach((row) => {
          t += '<tr>';
          row.forEach((c) => { t += `<td>${c}</td>`; });
          t += '</tr>';
        });
        t += '</tbody></table>';
        return t;
      }
    );
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    html = html
      .split(/\n\n+/)
      .map((block) => {
        if (/^<(h3|ul|ol|table)/.test(block.trim())) return block;
        return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
      })
      .join("\n");
    return html;
  }

  // ---------- 工具函数 ----------
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "&#34;")
      .replace(/'/g, "'");
  }

  // ---------- 启动 ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

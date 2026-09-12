import Fastify from "fastify";
import FastifyCors from "@fastify/cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");
const ARONA_PROMPT_PATH = join(__dirname, "..", "arona.txt");

// ─── Load Arona Persona ─────────────────────────────────────
let ARONA_PROMPT = "";
try {
  ARONA_PROMPT = readFileSync(ARONA_PROMPT_PATH, "utf-8").trim();
} catch {
  ARONA_PROMPT = "你是阿洛娜（Arona），什亭之匣的AI助手。";
}

// ─── Load Config ────────────────────────────────────────────
function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    console.log("[WARN] config.json not found, using defaults");
    return JSON.parse(readFileSync(join(__dirname, "config.default.json"), "utf-8"));
  }
}

function resolveEnv(val) {
  if (typeof val !== "string") return val;
  const m = val.match(/^\$\{(\w+)\}$/);
  return m ? (process.env[m[1]] ?? "") : val;
}

let CONFIG = loadConfig();

// ─── Memory Manager ─────────────────────────────────────────
class MemoryManager {
  constructor(config) {
    this.config = config.memory || {};
    this.storagePath = this.config.storage_path || "/etc/ai-os/memory.json";
    this.compressAfter = this.config.compress_after || 30;
    this.compressionModel = this.config.compression_model || "deepseek/deepseek-chat";
    this.systemPrompt = this.config.system_prompt ||
      "你是记忆压缩专家。将以下对话历史压缩为简短摘要，保留所有重要事实、决定、用户偏好和上下文。输出纯JSON格式：{\"summary\":\"...\",\"facts\":[\"...\"],\"preferences\":[\"...\"]}";
    this.profileConfig = this.config.profile_analysis || {};
    this.sessions = new Map();
    this.load();
  }

  // 获取当天日期字符串（用于每日统计）
  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  load() {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, "utf-8"));
        if (data.sessions) {
          for (const [id, s] of Object.entries(data.sessions)) {
            this.sessions.set(id, { ...s, messages: s.messages || [] });
          }
        }
        console.log(`[Memory] Loaded ${this.sessions.size} sessions from ${this.storagePath}`);
      }
    } catch (e) {
      console.log(`[Memory] Failed to load: ${e.message}`);
    }
  }

  save() {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = {
        savedAt: new Date().toISOString(),
        sessions: Object.fromEntries(this.sessions),
      };
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.log(`[Memory] Failed to save: ${e.message}`);
    }
  }

  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        compressedAt: null,
        compressedSummary: "",
        facts: [],
        preferences: [],
        lastCompressCount: 0,
        createdAt: new Date().toISOString(),
        dailyCounts: {},
        dailyMessages: {},
        lastProfileDate: null,
        profiles: {},
        // ── 推理中断追踪 ──────────────────────────────────────
        lastProcessedAt: null,      // 最后一条消息被完整处理的时间戳
        reasoningState: null,       // 中断时保存的推理上下文
      });
    }
    return this.sessions.get(sessionId);
  }

  // 添加消息，recordTime 记录本次交互完成时间（用于检测中断）
  addMessage(sessionId, role, content, recordTime = true) {
    const session = this.getOrCreateSession(sessionId);
    const now = recordTime ? new Date().toISOString() : session.lastProcessedAt;
    const today = this._today();
    session.dailyCounts[today] = (session.dailyCounts[today] || 0) + 1;
    if (!session.dailyMessages[today]) session.dailyMessages[today] = [];
    session.dailyMessages[today].push({ role, content, timestamp: now });
    session.messages.push({ role, content, timestamp: now });
    return session;
  }

  // 检查是否有新消息在推理期间到达（中断信号）
  hasInterrupt(sessionId) {
    const session = this.getOrCreateSession(sessionId);
    if (!session.lastProcessedAt) return false;
    // 查找 lastProcessedAt 之后的用户消息
    return session.messages.some(m => m.role === "user" && m.timestamp > session.lastProcessedAt);
  }

  // 标记当前消息已处理，清除中断状态
  markProcessed(sessionId) {
    const session = this.getOrCreateSession(sessionId);
    session.lastProcessedAt = new Date().toISOString();
    session.reasoningState = null;
  }

  // 保存推理状态（供中断后恢复）
  saveReasoningState(sessionId, context) {
    const session = this.getOrCreateSession(sessionId);
    session.reasoningState = context;
  }

  // 获取推理上下文，用于客户端继续
  getReasoningContext(sessionId) {
    const session = this.getOrCreateSession(sessionId);
    return session.reasoningState || null;
  }

  // 恢复中断的推理（客户端携带 reasoning_context 重新请求）
  restoreReasoning(sessionId, ctx) {
    const session = this.getOrCreateSession(sessionId);
    if (ctx?.messages) session.messages = ctx.messages;
    session.lastProcessedAt = ctx?.lastProcessedAt || new Date().toISOString();
    session.reasoningState = null;
    console.log(`[Interrupt] Resumed session ${sessionId} from reasoning state (${(session.messages?.length || 0)} msgs)`);
  }

  // 获取用于发送给 AI 的消息列表（含压缩摘要）
  getMessages(sessionId) {
    const session = this.getOrCreateSession(sessionId);
    const msgs = session.messages.map(m => ({ role: m.role, content: m.content }));
    if (session.compressedSummary) {
      msgs.unshift({
        role: "system",
        content: `[历史记忆]\n${session.compressedSummary}\n重要事实：${(session.facts || []).join("; ")}\n用户偏好：${(session.preferences || []).join("; ")}`,
      });
    }
    return msgs;
  }

  shouldCompress(sessionId) {
    const session = this.getOrCreateSession(sessionId);
    const userCount = session.messages.filter(m => m.role === "user").length;
    return userCount - session.lastCompressCount >= this.compressAfter;
  }

  async compress(sessionId, routeChat) {
    const session = this.getOrCreateSession(sessionId);
    if (!this.config.enabled) return { compressed: false, reason: "disabled" };

    const userCount = session.messages.filter(m => m.role === "user").length;
    if (userCount - session.lastCompressCount < this.compressAfter) {
      return { compressed: false, reason: "not enough messages" };
    }

    try {
      const historyText = session.messages
        .map(m => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
        .join("\n");

      const resp = await routeChat(CONFIG, this.compressionModel, [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: `请压缩以下对话历史：\n${historyText}` },
      ], { max_tokens: 500 });

      let summary = resp.content;
      let facts = [];
      let preferences = [];
      try {
        const jsonMatch = summary.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          summary = parsed.summary || summary;
          facts = parsed.facts || [];
          preferences = parsed.preferences || [];
        }
      } catch { /* ignore */ }

      const keepFrom = session.messages.length - this.compressAfter * 2;
      session.messages = session.messages.slice(Math.max(0, keepFrom));
      session.compressedSummary = summary;
      session.facts = facts;
      session.preferences = preferences;
      session.lastCompressCount = userCount;
      session.compressedAt = new Date().toISOString();

      // 触发每日人物画像分析
      await this._tryDailyProfileAnalysis(sessionId, routeChat);

      this.save();
      console.log(`[Memory] Compressed session ${sessionId} (${userCount} interactions → kept ${session.messages.length} messages)`);
      return { compressed: true, summary: summary.slice(0, 200), factsCount: facts.length };
    } catch (e) {
      console.log(`[Memory] Compression failed: ${e.message}`);
      return { compressed: false, error: e.message };
    }
  }

  // ─── 每日人物画像分析 ──────────────────────────────────────
  async _tryDailyProfileAnalysis(sessionId, routeChat) {
    if (!this.profileConfig?.enabled) return;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const today = this._today();
    const dailyCount = session.dailyCounts[today] || 0;
    const minMessages = this.profileConfig.min_daily_messages || 100;

    // 信息量不足则跳过
    if (dailyCount < minMessages) {
      console.log(`[Profile] Session ${sessionId}: ${dailyCount} messages today (< ${minMessages}), skip analysis`);
      return;
    }

    // 今天已分析过则跳过
    if (session.lastProfileDate === today) {
      console.log(`[Profile] Session ${sessionId}: already analyzed today`);
      return;
    }

    try {
      const todayMessages = session.dailyMessages[today] || [];
      const historyText = todayMessages
        .map(m => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
        .join("\n");

      const resp = await routeChat(CONFIG, this.compressionModel, [
        { role: "system", content: this.profileConfig.analysis_prompt || "你是人物画像分析师。分析每个人物的性格情感喜好，同时分析群聊特征。" },
        { role: "user", content: `请分析今日 (${today}) 的对话记录（共 ${dailyCount} 条消息）：\n${historyText}` },
      ], { max_tokens: 1000 });

      let profileData = { profiles: {}, group: {} };
      try {
        const jsonMatch = resp.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) profileData = JSON.parse(jsonMatch[0]);
      } catch {
        profileData.raw = resp.content;
      }

      session.profiles[today] = profileData;
      session.lastProfileDate = today;
      this.save();
      console.log(`[Profile] Session ${sessionId}: daily analysis done (${dailyCount} messages, ${today})`);
    } catch (e) {
      console.log(`[Profile] Analysis failed: ${e.message}`);
    }
  }

  clearSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      this.save();
    }
  }

  getSessionStatus(sessionId) {
    const session = this.getOrCreateSession(sessionId);
    const userCount = session.messages.filter(m => m.role === "user").length;
    const today = this._today();
    return {
      sessionId,
      messageCount: session.messages.length,
      userMessages: userCount,
      compressed: !!session.compressedSummary,
      compressedAt: session.compressedAt,
      factsCount: (session.facts || []).length,
      nextCompressionIn: Math.max(0, this.compressAfter - (userCount - session.lastCompressCount)),
      todayMessageCount: session.dailyCounts[today] || 0,
      lastProfileDate: session.lastProfileDate,
      hasProfileToday: session.lastProfileDate === today && !!session.profiles[today],
    };
  }

  getAllSessions() {
    const result = [];
    for (const [id, s] of this.sessions) {
      result.push(this.getSessionStatus(id));
    }
    return result;
  }

  // 获取某 session 某天的画像数据
  getProfile(sessionId, date) {
    const session = this.sessions.get(sessionId);
    if (!session || !date) return null;
    return session.profiles[date] || session.profiles[this._today()] || null;
  }

  // 获取所有 session 今天的画像
  getTodayProfiles() {
    const result = {};
    for (const [id, s] of this.sessions) {
      const today = this._today();
      if (s.profiles[today]) {
        result[id] = s.profiles[today];
      }
    }
    return result;
  }
}

let memory = null;
if (CONFIG.memory?.enabled) {
  memory = new MemoryManager(CONFIG);
  console.log(`[Memory] Enabled, compress after ${memory.compressAfter} interactions`);
}

// ─── Providers ──────────────────────────────────────────────
async function callOpenAICompatible(providerCfg, modelId, messages, opts = {}) {
  const url = providerCfg.base_url.replace(/\/$/, "") + "/chat/completions";
  const body = { model: modelId, messages, ...opts };
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${resolveEnv(providerCfg.api_key)}`,
  };
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[${providerCfg.base_url}] ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const choice = data.choices?.[0];
  return {
    model: modelId,
    content: choice?.message?.content ?? "",
    finish_reason: choice?.finish_reason,
    usage: data.usage ?? {},
  };
}

async function callAnthropic(providerCfg, modelId, messages, opts = {}) {
  const url = providerCfg.base_url.replace(/\/$/, "") + "/v1/messages";
  const systemMsg = messages.find((m) => m.role === "system");
  const convMsgs = messages.filter((m) => m.role !== "system");
  const body = {
    model: modelId,
    messages: convMsgs,
    max_tokens: opts.max_tokens ?? 4096,
  };
  if (systemMsg) body.system = systemMsg.content;
  const apiKey = resolveEnv(providerCfg.api_key);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[Anthropic] ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return {
    model: modelId,
    content: data.content?.[0]?.text ?? "",
    finish_reason: data.stop_reason,
    usage: data.usage ?? {},
  };
}

// ─── Router ─────────────────────────────────────────────────
function resolveModel(config, modelSpec) {
  if (modelSpec.includes("/")) {
    const [prov, id] = modelSpec.split("/", 2);
    return { provider: prov, modelId: id };
  }
  const def = config.routing.default_model;
  if (def.includes("/")) {
    const [prov, id] = def.split("/", 2);
    return { provider: prov, modelId: id };
  }
  return { provider: "openai", modelId: def || modelSpec };
}

async function routeChat(config, modelSpec, messages, opts = {}) {
  const { provider, modelId } = resolveModel(config, modelSpec);
  const cfg = config.models[provider];
  if (!cfg) throw new Error(`Unknown provider: "${provider}". Available: ${Object.keys(config.models).join(", ")}`);
  if (provider === "anthropic") return callAnthropic(cfg, modelId, messages, opts);
  return callOpenAICompatible(cfg, modelId, messages, opts);
}

// ─── Fastify App ────────────────────────────────────────────
const app = Fastify({ logger: true });
await app.register(FastifyCors, { origin: true });

app.get("/health", () => ({
  status: "ok",
  port: CONFIG.ai_gateway.port,
  models: Object.keys(CONFIG.models).length,
  providers: Object.keys(CONFIG.models),
  memory: memory ? { enabled: true, sessions: memory.sessions.size } : { enabled: false },
}));

app.get("/v1/models", () => {
  const data = [];
  for (const [prov, cfg] of Object.entries(CONFIG.models)) {
    for (const m of (cfg.available ?? [])) {
      data.push({ id: m.id, object: "model", owned_by: prov });
    }
  }
  return { data };
});

app.post("/v1/chat/completions", async (req, reply) => {
  const { model, messages, temperature, max_tokens, session_id, tools } = req.body;
  const sessionId = session_id || "default";
  const effectiveTools = tools || (CONFIG.bot?.tools_enabled ? BOT_TOOLS : []);

  try {
    // 构建完整消息列表（含记忆压缩摘要）
    const incomingMessages = messages || [];
    let fullMessages = [...incomingMessages];
    if (memory) {
      const memMessages = memory.getMessages(sessionId);
      fullMessages = [...memMessages, ...fullMessages];
    }

    // ─── 新会话截断与继续决策 ──────────────────────────────────
    // 判断是否为"新会话"：用户消息内容与上次不同，或首次请求
    const lastUserMsg = memory
      ? memory.getOrCreateSession(sessionId).messages
          .filter(m => m.role === "user")
          .pop()
      : null;
    const currentUserMsg = incomingMessages.find(m => m.role === "user");
    const isNewSession = !lastUserMsg ||
      (currentUserMsg && lastUserMsg.content !== currentUserMsg.content);

    if (isNewSession && memory) {
      const session = memory.getOrCreateSession(sessionId);
      const totalMsgs = session.messages.length;
      const MAX_MESSAGES = 500; // 单 session 最大消息数
      if (totalMsgs > MAX_MESSAGES) {
        // 历史过长，触发压缩以腾出空间
        console.log(`[Session] New session detected for ${sessionId}, ${totalMsgs} msgs > ${MAX_MESSAGES}, triggering compress`);
        await memory.compress(sessionId, routeChat);
      }
      console.log(`[Session] New session for ${sessionId}: ${currentUserMsg?.content?.slice(0, 60) || "empty"} | continuing from ${session.messages.length} msgs`);
    }

    // ─── 推理中断与继续机制 ───────────────────────────────────
    // 解析推理上下文（客户端恢复时携带）
    const reasoningCtx = req.body?.reasoning_context;
    if (memory && reasoningCtx?.messages) {
      memory.restoreReasoning(sessionId, reasoningCtx);
      const restored = memory.getOrCreateSession(sessionId);
      fullMessages = [...memory.getMessages(sessionId), ...incomingMessages];
      // 执行未完成的工具调用
      if (reasoningCtx.pendingToolCalls?.length > 0) {
        console.log(`[Interrupt] Resuming: executing ${reasoningCtx.pendingToolCalls.length} pending tool calls`);
        for (const tc of reasoningCtx.pendingToolCalls) {
          const fn = tc.function;
          const args = JSON.parse(fn.arguments || "{}");
          const toolResult = await executeTool(fn.name, args);
          fullMessages.push({ role: "assistant", content: null, tool_calls: [tc] });
          fullMessages.push({ role: "tool", tool_call_id: tc.id, content: toolResult.content });
        }
        finalContent = reasoningCtx.finalContent || "";
      } else {
        finalContent = reasoningCtx.finalContent || "";
      }
    }

    // ─── 工具调用循环（无上限，支持中断/恢复）───────────────
    if (!finalContent) finalContent = "";
    let interrupted = false;

    while (true) {
      // 检查是否有新消息在推理期间到达（中断信号）
      if (memory && !reasoningCtx) {
        if (memory.hasInterrupt(sessionId)) {
          console.log(`[Interrupt] New message detected, pausing reasoning for ${sessionId}`);
          memory.saveReasoningState(sessionId, {
            messages: fullMessages.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls })),
            lastProcessedAt: session.lastProcessedAt,
            pendingToolCalls: [],
            finalContent,
          });
          interrupted = true;
          break;
        }
      }

      const callOpts = { temperature, max_tokens };
      if (effectiveTools.length > 0) {
        callOpts.tools = effectiveTools;
        callOpts.tool_choice = "auto";
      }

      const resp = await routeChat(CONFIG, model, fullMessages, callOpts);
      finalContent = resp.content;

      // 检查是否有工具调用（OpenAI 格式）
      const toolCallsList = resp.tool_calls || resp.content?.tool_calls;
      if (!toolCallsList || toolCallsList.length === 0) break;

      // 保存每个工具调用前的最新状态，以便中断后恢复
      const pendingTcs = [...toolCallsList];

      for (const tc of toolCallsList) {
        const fn = tc.function;
        const args = JSON.parse(fn.arguments || "{}");
        app.log.info(`[Bot] Tool call: ${fn.name}(${JSON.stringify(args)})`);
        const toolResult = await executeTool(fn.name, args);
        fullMessages.push({ role: "assistant", content: null, tool_calls: [tc] });
        fullMessages.push({ role: "tool", tool_call_id: tc.id, content: toolResult.content });
      }

      // 每次工具调用完成后再次检查中断
      if (memory && !reasoningCtx && memory.hasInterrupt(sessionId)) {
        console.log(`[Interrupt] Paused after tool calls for ${sessionId}`);
        memory.saveReasoningState(sessionId, {
          messages: fullMessages.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls })),
          lastProcessedAt: session.lastProcessedAt,
          pendingToolCalls: pendingTcs,
          finalContent: "",
        });
        interrupted = true;
        break;
      }

      // 安全检查：防止极端情况下上下文过大
      if (fullMessages.length > 2000) {
        console.log(`[Bot] Context exceeded 2000 messages, truncating`);
        fullMessages = fullMessages.slice(-500);
      }
    }

    // 记录对话历史（中断时不记录，等待恢复后追加）
    if (memory && !interrupted) {
      const originalUserMsg = incomingMessages.find(m => m.role === "user");
      if (originalUserMsg) {
        memory.addMessage(sessionId, "user", originalUserMsg.content);
      }
      memory.addMessage(sessionId, "assistant", finalContent);
      memory.markProcessed(sessionId);
      if (memory.shouldCompress(sessionId)) {
        await memory.compress(sessionId, routeChat);
      } else {
        memory.save();
      }
    }

    // 构建推理上下文（用于客户端继续）
    let reasoning_context = null;
    if (interrupted && memory) {
      reasoning_context = memory.getReasoningContext(sessionId);
      console.log(`[Interrupt] Saved reasoning state for ${sessionId}, interrupted=true`);
    }

    return {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: resp.model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: finalContent },
        finish_reason: interrupted ? "interrupted" : "stop",
      }],
      usage: resp.usage ?? {},
      interrupted,
      reasoning_context,
      memory: memory ? memory.getSessionStatus(sessionId) : null,
    };
  } catch (e) {
    app.log.error(`Chat failed: ${e.message}`);
    const isNetwork = e.message.includes("fetch failed") || e.message.includes("ECONNREFUSED") || e.message.includes("ENOTFOUND");
    reply.code(502).send({
      error: {
        message: isNetwork ? "Network error: cannot reach provider." : e.message,
        type: isNetwork ? "network_error" : "provider_error",
      },
      memory: memory ? memory.getSessionStatus(sessionId) : null,
    });
  }
});

app.post("/v1/completions", async (req, reply) => {
  const { model, prompt, max_tokens, session_id } = req.body;
  const sessionId = session_id || "default";
  try {
    const resp = await routeChat(CONFIG, model, [{ role: "user", content: prompt }], { max_tokens });
    if (memory) {
      memory.addMessage(sessionId, "user", prompt);
      memory.addMessage(sessionId, "assistant", resp.content);
      if (memory.shouldCompress(sessionId)) {
        await memory.compress(sessionId, routeChat);
      } else {
        memory.save();
      }
    }
    return {
      id: `cmpl-${Date.now()}`,
      object: "text_completion",
      choices: [{ text: resp.content, index: 0, finish_reason: "stop" }],
      memory: memory ? memory.getSessionStatus(sessionId) : null,
    };
  } catch (e) {
    reply.code(502).send({ error: { message: e.message } });
  }
});

app.post("/v1/system/complete", async (req, reply) => {
  const { context, prefix, route, max_tokens } = req.body;
  const routeModel = (CONFIG.routing.routes?.[route] ?? CONFIG.routing.default_model) || "gpt-4o";
  try {
    const resp = await routeChat(CONFIG, routeModel, [
      { role: "system", content: "You are a system assistant. Help complete commands and scripts concisely." },
      { role: "user", content: `Context:\n${context}\n\nComplete: ${prefix}` },
    ], { max_tokens });
    return { completion: resp.content, route: routeModel };
  } catch (e) {
    reply.code(502).send({ error: { message: e.message } });
  }
});

app.post("/v1/astrbot/chat", async (req, reply) => {
  return app.inject({ method: "POST", url: "/v1/chat/completions", payload: req.body });
});

app.post("/v1/astrbot/completions", async (req, reply) => {
  return app.inject({ method: "POST", url: "/v1/completions", payload: req.body });
});

// ─── Memory API ─────────────────────────────────────────────
app.get("/api/memory/status", async (req, reply) => {
  if (!memory) return reply.code(404).send({ error: "Memory not enabled" });
  const sessionId = req.query.session_id || "default";
  return memory.getSessionStatus(sessionId);
});

app.get("/api/memory/sessions", async (req, reply) => {
  if (!memory) return reply.code(404).send({ error: "Memory not enabled" });
  return memory.getAllSessions();
});

app.post("/api/memory/compress", async (req, reply) => {
  if (!memory) return reply.code(404).send({ error: "Memory not enabled" });
  const sessionId = req.body?.session_id || "default";
  const result = await memory.compress(sessionId, routeChat);
  return result;
});

app.delete("/api/memory/session", async (req, reply) => {
  if (!memory) return reply.code(404).send({ error: "Memory not enabled" });
  const sessionId = req.body?.session_id || "default";
  memory.clearSession(sessionId);
  return { ok: true, sessionId };
});

app.delete("/api/memory/all", async (req, reply) => {
  if (!memory) return reply.code(404).send({ error: "Memory not enabled" });
  memory.sessions.clear();
  memory.save();
  return { ok: true, sessionsCleared: 0 };
});

app.get("/api/memory/profile", async (req, reply) => {
  if (!memory) return reply.code(404).send({ error: "Memory not enabled" });
  const sessionId = req.query.session_id || "default";
  const date = req.query.date || undefined;
  const profile = memory.getProfile(sessionId, date);
  return profile || { sessionId, date: date || "today", profiles: {}, group: {}, messageCount: 0, analyzed: false };
});

app.get("/api/memory/profiles/today", async (req, reply) => {
  if (!memory) return reply.code(404).send({ error: "Memory not enabled" });
  return memory.getTodayProfiles();
});

// ─── Bot Tools API ──────────────────────────────────────────
app.get("/api/tools", () => ({
  tools: BOT_TOOLS.map(t => ({ name: t.function.name, description: t.function.description })),
}));

app.post("/api/bot/tool", async (req, reply) => {
  const { tool, args } = req.body || {};
  if (!tool) return reply.code(400).send({ error: "missing tool name" });
  try {
    const result = await executeTool(tool, args || {});
    return { ok: true, result: result.content };
  } catch (e) {
    return reply.code(500).send({ error: e.message });
  }
});

// ─── 桌面文件系统 API ────────────────────────────────────────
app.get("/api/fs/list", async (req, reply) => {
  const dir = req.query.dir || "/";
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
      .map(e => ({
        name: e.name,
        dir: e.isDirectory(),
        size: e.isFile() ? statSync(join(dir, e.name)).size : 0,
        mtime: e.isFile() ? new Date(statSync(join(dir, e.name)).mtime).toLocaleString("zh-CN") : "-",
      }))
      .sort((a, b) => a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1);
    return { entries };
  } catch (e) {
    return reply.code(404).send({ error: e.message });
  }
});

app.post("/api/fs/read", async (req, reply) => {
  const { path } = req.body || {};
  if (!path) return reply.code(400).send({ error: "missing path" });
  try {
    const content = readFileSync(path, "utf-8");
    return { content };
  } catch (e) {
    return reply.code(404).send({ error: e.message });
  }
});

// ─── 系统信息 API ────────────────────────────────────────────
app.get("/api/system/info", () => {
  try {
    return {
      hostname: os.hostname(),
      os: `Debian GNU/Linux ${process.platform}`,
      kernel: "6.1.0-amd64",
      cpu: `${os.cpus().length} cores`,
      memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
      uptime: `${Math.round(os.uptime() / 60)} minutes`,
    };
  } catch {
    return { hostname: "shittimchest", os: "Debian 13", kernel: "6.1.0-amd64", uptime: "unknown" };
  }
});

app.get("/api/system/network", () => {
  try {
    const nets = os.networkInterfaces();
    const interfaces = Object.entries(nets)
      .filter(([_, addrs]) => addrs.some(a => !a.internal))
      .map(([name, addrs]) => {
        const main = addrs.find(a => a.family === "IPv4" && !a.internal);
        return { name, ip: main?.address || "-", mac: main?.mac || "-" };
      });
    return { interfaces, dns: ["8.8.8.8", "1.1.1.1"] };
  } catch {
    return { interfaces: [], dns: [] };
  }
});

// ─── Bot 自主调度 ────────────────────────────────────────────
if (CONFIG.bot?.autonomous?.enabled) {
  const { default: cron } = await import("node-cron");
  const autonomous = CONFIG.bot.autonomous;

  async function botAutonomousTask() {
    try {
      const resp = await fetch(`http://localhost:${CONFIG.ai_gateway.port}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: autonomous.default_model || "deepseek/deepseek-chat",
          messages: [
            { role: "system", content: autonomous.system_prompt || "你是系统的 AI 助手。请检查系统状态、日志和重要事件，如有异常及时记录到 /var/log/ai-os-bot.log。用中文简短回复。" },
            { role: "user", content: autonomous.task || "检查系统状态并汇报" },
          ],
          session_id: "bot-autonomous",
          tools: BOT_TOOLS,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        // 写入日志
        const fs = (await import("fs")).default;
        const logPath = "/var/log/ai-os-bot.log";
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${content}\n`);
        console.log(`[Bot] Autonomous task completed: ${content.slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`[Bot] Autonomous task failed: ${e.message}`);
    }
  }

  // 按 cron 表达式调度
  const schedule = autonomous.schedule || "0 * * * *"; // 每小时
  cron.schedule(schedule, botAutonomousTask);
  console.log(`[Bot] Autonomous scheduler enabled: cron "${schedule}"`);
}

// ─── Bot 每日活跃任务调度 ──────────────────────────────────
const ACTIVE_TASKS = new Map(); // date → [{ time, planned, executed }]
let activeCronJobs = [];

function getTodayKey() { return new Date().toISOString().slice(0, 10); }

if (CONFIG.bot?.active?.enabled) {
  const { default: cron } = await import("node-cron");
  const activeCfg = CONFIG.bot.active;
  const fs_mod = await import("fs");
  const path_mod = await import("path");

  async function scheduleActiveTasks() {
    const today = getTodayKey();
    if (ACTIVE_TASKS.has(today)) return; // 已调度过

    const count = activeCfg.min_tasks + Math.floor(Math.random() * (activeCfg.max_tasks - activeCfg.min_tasks + 1));
    const times = new Set();
    // 每天 8:00 ~ 22:00 之间随机分配
    for (let i = 0; i < count; i++) {
      const hour = 8 + Math.floor(Math.random() * 14);
      const minute = Math.floor(Math.random() * 60);
      times.add(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }

    const tasks = Array.from(times).sort().map(time => ({
      time,
      planned: new Date(`${today}T${time}:00`).getTime(),
      executed: false,
      activity: "",
    }));
    ACTIVE_TASKS.set(today, tasks);
    console.log(`[Active] Scheduled ${tasks.length} tasks for ${today}`);

    // 为每个任务注册 cron（使用近似时间，误差最多 ±1 分钟）
    for (const task of tasks) {
      const [h, m] = task.time.split(":").map(Number);
      try {
        const job = cron.schedule(`${m} ${h} * * *`, async () => {
          await executeActiveTask(task);
        });
        activeCronJobs.push({ job, task });
      } catch (e) {
        console.log(`[Active] Failed to schedule ${task.time}: ${e.message}`);
      }
    }
  }

  async function executeActiveTask(task) {
    try {
      const now = new Date();
      const today = getTodayKey();
      const activities = activeCfg.activity_pool || [];
      const systemPrompt = (activeCfg.system_prompt || "")
        .replace("{time}", now.toLocaleTimeString("zh-CN"))
        .replace("{date}", now.toLocaleDateString("zh-CN"));

      // 获取今日记忆摘要作为上下文
      let memoryContext = "";
      if (memory) {
        const todayMsgs = (memory.getOrCreateSession("main").dailyCounts[today] || 0);
        memoryContext = `今日已有 ${todayMsgs} 条对话记录。`;
      }

      const resp = await fetch(`http://localhost:${CONFIG.ai_gateway.port}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: activeCfg.default_model || "deepseek/deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `当前时间 ${now.toLocaleTimeString("zh-CN")}。可用活动：${activities.join("、")}。请执行其中一项，简短说明你在做什么。${memoryContext}` },
          ],
          session_id: "bot-active",
          tools: BOT_TOOLS,
          max_tokens: 200,
        }),
      });

      let content = "";
      let toolExecuted = false;
      if (resp.ok) {
        const data = await resp.json();
        content = data.choices?.[0]?.message?.content || "";
        // 如果模型调用了工具，等待工具结果
        const toolCalls = data.choices?.[0]?.message?.tool_calls;
        if (toolCalls?.length > 0) {
          toolExecuted = true;
          for (const tc of toolCalls) {
            const args = JSON.parse(tc.function.arguments || "{}");
            const result = await executeTool(tc.function.name, args);
            content += `\n工具结果(${tc.function.name}): ${result.content?.slice(0, 200) || "ok"}`;
          }
        }
      }

      // 更新任务状态
      const tasks = ACTIVE_TASKS.get(today);
      if (tasks) {
        const t = tasks.find(t => t.time === task.time);
        if (t) { t.executed = true; t.activity = content.slice(0, 100); }
      }

      // 写入日志
      const logPath = activeCfg.log_path || "/var/log/ai-os-active.log";
      try {
        fs_mod.mkdirSync(path_mod.dirname(logPath), { recursive: true });
        fs_mod.appendFileSync(logPath, `[${now.toISOString()}] [${task.time}] ${content}\n`);
      } catch (_) { /* 日志写入失败不影响主流程 */ }

      console.log(`[Active] Task at ${task.time}: ${content.slice(0, 80)}`);
    } catch (e) {
      console.log(`[Active] Task failed at ${task.time}: ${e.message}`);
    }
  }

  // 每日零点重置
  cron.schedule("0 0 * * *", () => {
    const today = getTodayKey();
    ACTIVE_TASKS.delete(today);
    console.log(`[Active] Reset tasks for new day: ${today}`);
  });

  // 启动时立即调度今天或明天的任务
  await scheduleActiveTasks();
  console.log(`[Active] Active scheduler enabled (${activeCfg.min_tasks}~${activeCfg.max_tasks} tasks/day)`);
}

// ─── 活跃任务 API ────────────────────────────────────────────
app.get("/api/active/status", (req, reply) => {
  const today = getTodayKey();
  const tasks = ACTIVE_TASKS.get(today) || [];
  const executed = tasks.filter(t => t.executed).length;
  const nextTask = tasks.find(t => !t.executed);
  return {
    enabled: !!CONFIG.bot?.active?.enabled,
    today,
    totalTasks: tasks.length,
    executed,
    remaining: tasks.length - executed,
    nextTask: nextTask ? { time: nextTask.time, activity: nextTask.activity?.slice(0, 80) } : null,
    allTasks: tasks,
  };
});

app.get("/api/active/history", (req, reply) => {
  const days = parseInt(req.query.days || "7");
  const history = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const tasks = ACTIVE_TASKS.get(key);
    if (tasks && tasks.length > 0) {
      history.push({ date: key, total: tasks.length, executed: tasks.filter(t => t.executed).length, tasks });
    }
  }
  return history;
});

app.post("/api/active/run-now", async (req, reply) => {
  if (!CONFIG.bot?.active?.enabled) return reply.code(403).send({ error: "active mode not enabled" });
  const task = { time: new Date().toLocaleTimeString("zh-CN"), planned: Date.now(), executed: false, activity: "" };
  await executeActiveTask(task);
  return { ok: true, time: task.time };
});

app.post("/api/active/schedule-today", async (req, reply) => {
  if (!CONFIG.bot?.active?.enabled) return reply.code(403).send({ error: "active mode not enabled" });
  await scheduleActiveTasks();
  const today = getTodayKey();
  const tasks = ACTIVE_TASKS.get(today) || [];
  return { ok: true, tasks: tasks.length };
});

// ─── 分步对话初始化向导 ─────────────────────────────────────
const ARONA_API_SCRIPT = [
  {
    key: "provider",
    question: "老师老师！先告诉阿洛娜，你用的那个AI服务商源ID是什么呀？就是那个一串字母数字组合的东西，没有它阿洛娜可找不到地方连接哦！",
    type: "select",
    options: ["DeepSeek", "OpenAI", "Anthropic", "其他（自定义端点）"],
  },
  {
    key: "api_key",
    question: "然后当然就是API密钥啦！那个长长的像密码一样的东西，老师可要保管好，别弄丢了，不然阿洛娜也没办法帮你工作呢！",
    type: "password",
    options: [],
  },
  {
    key: "base_url",
    question: "还有还有，那个自定义端点URL是什么？如果老师用的是默认地址，那就可以跳过，但如果老师有特殊网络需求，一定要填对才行喔！",
    type: "text",
    options: [],
  },
  {
    key: "chat_permission",
    question: "阿洛娜还要确认一下，老师的API密钥有没有对话权限呀？有些平台需要单独开启这个功能，不然就算填对了也用不了，阿洛娜以前就遇到过这种情况……",
    type: "select",
    options: ["有对话权限", "不确定，帮我检查一下", "应该没有，换个方式试试"],
  },
  {
    key: "extra_config",
    question: "最后嘛，如果老师有额外的请求头或者网络代理设置，也一起告诉阿洛娜吧！这样阿洛娜才能完整地跑起来，帮老师做事！",
    type: "text",
    options: [],
  },
];
const SETUP_STATE_FILE = "/etc/ai-os/setup_state.json";
const SETUP_DONE_FLAG = "/etc/ai-os/setup_done";
const SETUP_SYSTEM_PROMPT = `你是阿洛娜（Arona），什亭之匣（AI OS）的AI助手。你正在帮助老师完成系统的初始化配置。

当前已收集的信息：{context}

你的任务是：
1. 如果还没有 API 配置，第一步必须询问 AI API 的配置（提供商、端点、API Key）。这是固定步骤，不可跳过。
2. 后续步骤由 LLM 根据已收集的信息动态生成，每次只问一个问题。
3. 问题应该是自然的对话形式，用中文提问，符合阿洛娜活泼可爱的性格。
4. 收集完所有必要信息后，返回 {"done": true, "summary": "配置完成摘要"}。

必要信息包括：
- AI API 配置（provider, base_url, api_key）
- 系统名称/昵称
- 用户称呼
- 时区
- 其他个性化设置

返回格式（非完成状态）：
{"question": "你的问题", "type": "text|select|password", "options": ["选项1", "选项2"]}

返回格式（完成状态）：
{"done": true, "summary": "摘要"}`;

function loadSetupState() {
  try {
    if (existsSync(SETUP_STATE_FILE)) {
      return JSON.parse(readFileSync(SETUP_STATE_FILE, "utf-8"));
    }
  } catch (e) {}
  return { step: 0, context: {}, answers: [], history: [] };
}

function saveSetupState(state) {
  try {
    const dir = dirname(SETUP_STATE_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(SETUP_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error("[Setup] Save failed:", e.message);
  }
}

function markSetupDone() {
  try {
    const dir = dirname(SETUP_DONE_FLAG);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(SETUP_DONE_FLAG, new Date().toISOString(), "utf-8");
  } catch (e) {
    console.error("[Setup] Mark done failed:", e.message);
  }
}

app.get("/api/setup/status", (req, reply) => {
  if (existsSync(SETUP_DONE_FLAG)) {
    return { done: true };
  }
  const state = loadSetupState();
  return {
    done: false,
    step: state.step,
    totalSteps: 5,
    history: state.history.slice(-6),
    context: state.context,
  };
});

app.post("/api/setup/next", async (req, reply) => {
  const state = loadSetupState();
  const { answer } = req.body || {};

  // 保存答案到历史
  if (answer !== undefined) {
    state.history.push({ role: "user", content: answer });
    state.step++;
  }

  // 如果是第一步（没有历史），返回阿洛娜的第一个问题
  if (state.history.length === 0) {
    saveSetupState(state);
    return ARONA_API_SCRIPT[0];
  }

  // 检查是否还在 API 配置阶段（前 5 步）
  const apiStepIndex = state.history.length - 1; // 0-based
  if (apiStepIndex < ARONA_API_SCRIPT.length) {
    const nextQuestion = ARONA_API_SCRIPT[apiStepIndex];
    if (nextQuestion) {
      state.context[nextQuestion.key] = answer;
      saveSetupState(state);
      return nextQuestion;
    }
  }

  // API 配置已完成，进入个性化设置阶段（LLM 动态生成）
  const contextEntries = Object.entries(state.context);
  const contextStr = contextEntries.length > 0
    ? contextEntries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")
    : "无";

  try {
    const config = loadConfig();
    const modelSpec = config.routing?.default_model || "deepseek/deepseek-chat";
    const systemPrompt = SETUP_SYSTEM_PROMPT.replace("{context}", contextStr);
    const messages = [
      { role: "system", content: systemPrompt },
      ...state.history,
    ];

    const resp = await routeChat(config, modelSpec, messages, { max_tokens: 300 });
    let parsed;
    try {
      const jsonMatch = resp.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { done: false, question: "还有什么需要确认的吗，老师？" };
    } catch {
      parsed = { done: false, question: "还有什么需要确认的吗，老师？" };
    }

    state.context[`step_${state.step}`] = answer;
    saveSetupState(state);

    if (parsed.done) {
      markSetupDone();
      return { done: true, summary: parsed.summary || "配置完成！欢迎使用什亭之匣，老师！" };
    }

    return parsed;
  } catch (e) {
    console.error("[Setup] LLM call failed:", e.message);
    const fallbackQuestions = [
      "那老师怎么称呼比较好呢？",
      "您的系统昵称想叫什么？",
      "时区确认一下，是 Asia/Shanghai 吗？",
      "好的，配置完成！欢迎使用什亭之匣，老师！",
    ];
    const idx = Math.min(state.step - ARONA_API_SCRIPT.length, fallbackQuestions.length - 1);
    return { question: fallbackQuestions[idx], type: "text", options: [] };
  }
});

app.post("/api/setup/submit", async (req, reply) => {
  const { key, value } = req.body || {};
  const state = loadSetupState();
  if (key && value !== undefined) {
    state.context[key] = value;
    saveSetupState(state);
  }
  markSetupDone();
  return { ok: true };
});

app.post("/api/setup/reset", (req, reply) => {
  try {
    if (existsSync(SETUP_STATE_FILE)) unlinkSync(SETUP_STATE_FILE);
    if (existsSync(SETUP_DONE_FLAG)) unlinkSync(SETUP_DONE_FLAG);
  } catch (e) {}
  return { ok: true };
});

// ─── 系统用户认证 ─────────────────────────────────────────
const AUTH_USER = "aiuser";

app.post("/api/auth/setup", async (req, reply) => {
  const { password } = req.body || {};
  if (!password) return reply.code(400).send({ ok: false, error: "missing password" });
  try {
    execFileSync("chpasswd", [], { input: `${AUTH_USER}:${password}\n` });
    return { ok: true };
  } catch (e) {
    app.log.error(`auth setup failed: ${e.message}`);
    return reply.code(500).send({ ok: false, error: e.message });
  }
});

app.post("/api/auth/login", async (req, reply) => {
  const { password } = req.body || {};
  if (!password) return reply.code(400).send({ ok: false, error: "missing password" });
  try {
    execFileSync("python3", ["-c", [
      "import crypt,sys",
      `h=open('/etc/shadow').read()`,
      `row=[l for l in h.splitlines() if l.startswith('${AUTH_USER}:')]`,
      `if not row or crypt.crypt(sys.argv[1], row[0].split(':')[1])!=row[0].split(':')[1]: sys.exit(1)`,
    ].join(";")], { args: [password] });
    return { ok: true };
  } catch (e) {
    return reply.code(401).send({ ok: false, error: "authentication failed" });
  }
});

app.post("/api/auth/password", async (req, reply) => {
  const { password } = req.body || {};
  if (!password) return reply.code(400).send({ ok: false, error: "missing password" });
  try {
    execFileSync("chpasswd", [], { input: `${AUTH_USER}:${password}\n` });
    return { ok: true };
  } catch (e) {
    app.log.error(`password change failed: ${e.message}`);
    return reply.code(500).send({ ok: false, error: e.message });
  }
});

const PORT = CONFIG.ai_gateway.port;
const HOST = CONFIG.ai_gateway.host;
await app.listen({ port: PORT, host: HOST });
console.log(`AI Gateway running on http://${HOST}:${PORT}`);
console.log(`API docs:    http://${HOST}:${PORT}/docs`);
console.log(`Health:      http://${HOST}:${PORT}/health`);
console.log(`Models:      ${Object.keys(CONFIG.models).join(", ")}`);
if (memory) {
  console.log(`Memory:      enabled (compress after ${memory.compressAfter} interactions)`);
  console.log(`Memory db:   ${memory.storagePath}`);
}

#!/bin/bash
# ============================================================
# AI OS - 无UI Debian 12 一键部署脚本
# 适用: Debian 12 minimal (无图形界面)
# 用法: sudo bash deploy.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*"; exit 1; }

echo ""
echo "============================================================"
echo "  AI OS - 部署脚本 v1.0"
echo "  适用: Debian 12 Minimal (无图形界面)"
echo "============================================================"
echo ""

if [ "$EUID" -ne 0 ]; then
    err "请使用 sudo 运行: sudo bash deploy.sh"
fi

# ─── 检查网络 ──────────────────────────────────────────────
info "[0/7] 检查网络连接..."
if ! curl -s --max-time 5 https://www.debian.org -o /dev/null; then
    warn "无法访问外网，请检查网络配置"
    warn "  ifconfig | grep inet          # 查看IP"
    warn "  ping -c 2 8.8.8.8            # 测试网络"
    warn "  cat /etc/resolv.conf          # 查看DNS"
    echo ""
fi
ok "网络检查完成"

# ─── 1. 安装基础依赖 ──────────────────────────────────────
info "[1/7] 安装系统依赖..."
export DEBIAN_FRONTEND=noninteractive

# 先更新包列表
apt-get update -qq 2>/dev/null

# 安装基础工具
apt-get install -y --no-install-recommends \
    curl git sudo ca-certificates \
    procps net-tools iputils-ping \
    2>/dev/null || true
ok "基础工具安装完成"

# ─── 2. 配置中文 Locale ───────────────────────────────────
info "[2/7] 配置中文 locale..."

# 确保 locale-gen 可用
apt-get install -y --no-install-recommends locales 2>/dev/null || true

# 启用 zh_CN.UTF-8 和 en_US.UTF-8
sed -i 's/# zh_CN.UTF-8 UTF-8/zh_CN.UTF-8 UTF-8/' /etc/locale.gen 2>/dev/null || \
    echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen
sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen 2>/dev/null || \
    echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen

# 生成 locale
locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null
update-locale LANG=zh_CN.UTF-8 LC_ALL=zh_CN.UTF-8 2>/dev/null || true

# 写入系统 locale 配置
cat > /etc/default/locale << 'EOF'
LANG=zh_CN.UTF-8
LANGUAGE=zh_CN:en
LC_ALL=zh_CN.UTF-8
EOF

# 写入 shell 环境变量
cat > /etc/profile.d/99-locale.sh << 'EOF'
export LANG=zh_CN.UTF-8
export LANGUAGE=zh_CN:en
export LC_ALL=zh_CN.UTF-8
export TERM=xterm-256color
export PYTHONIOENCODING=utf-8
export GIT_TERMINAL_PROMPT=0
EOF
chmod +x /etc/profile.d/99-locale.sh

# 同时写入 /etc/environment（登录前生效）
cat > /etc/environment << 'EOF'
LANG=zh_CN.UTF-8
LANGUAGE=zh_CN:en
LC_ALL=zh_CN.UTF-8
TERM=xterm-256color
EOF

ok "Locale 配置完成: zh_CN.UTF-8"

# ─── 3. 安装 Node.js ─────────────────────────────────────
info "[3/7] 安装 Node.js..."
if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    if echo "$NODE_VER" | grep -qE "v18|v20|v21|v22|v23|v24"; then
        ok "Node.js 已安装: $NODE_VER"
    else
        warn "Node.js 版本过旧: $NODE_VER，正在升级..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs 2>/dev/null
        ok "Node.js 已升级: $(node --version)"
    fi
else
    info "安装 Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs 2>/dev/null
    ok "Node.js 安装完成: $(node --version)"
fi
ok "npm 版本: $(npm --version)"

# ─── 4. 创建目录结构 ─────────────────────────────────────
info "[4/7] 创建目录结构..."
mkdir -p /opt/ai-os/gateway /opt/ai-os/gui
mkdir -p /etc/ai-gateway /var/log/ai-gateway
mkdir -p /etc/systemd/system
ok "目录创建完成"

# ─── 5. 部署 AI Gateway ─────────────────────────────────
info "[5/7] 部署 AI Gateway..."

# package.json
cat > /opt/ai-os/gateway/package.json << 'EOF'
{
  "name": "ai-gateway",
  "version": "1.0.0",
  "type": "module",
  "main": "server.mjs",
  "scripts": {"start": "node server.mjs"},
  "dependencies": {"fastify": "^5.0.0", "@fastify/cors": "^10.0.0"}
}
EOF

# 配置文件
cat > /etc/ai-gateway/config.json << 'EOF'
{
  "ai_gateway": {"port": 8080, "host": "0.0.0.0", "log_level": "info"},
  "models": {
    "openai": {
      "api_key": "",
      "base_url": "https://api.openai.com/v1",
      "available": [
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"}
      ]
    },
    "anthropic": {
      "api_key": "",
      "base_url": "https://api.anthropic.com",
      "available": [
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
        {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"}
      ]
    },
    "deepseek": {
      "api_key": "",
      "base_url": "https://api.deepseek.com",
      "available": [
        {"id": "deepseek-chat", "name": "DeepSeek Chat"},
        {"id": "deepseek-reasoner", "name": "DeepSeek Reasoner"}
      ]
    },
    "local": {
      "api_key": "",
      "base_url": "http://localhost:11434/v1",
      "available": [
        {"id": "llama3.2", "name": "Llama 3.2 (Local)"},
        {"id": "qwen2.5:7b", "name": "Qwen 2.5 7B (Local)"}
      ]
    }
  },
  "routing": {
    "default_model": "deepseek/deepseek-chat",
    "fallback_model": "local/llama3.2",
    "routes": {
      "system_completion": "deepseek/deepseek-chat",
      "fast_response": "openai/gpt-4o-mini",
      "reasoning": "deepseek/deepseek-reasoner"
    }
  },
  "system_completion": {"enabled": true, "trigger_key": "ctrl+space"},
  "astrbot": {"enabled": true, "endpoint": "/v1/astrbot"}
}
EOF

cat > /etc/ai-gateway/env << 'EOF'
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
DEEPSEEK_API_KEY=""
EOF
chmod 600 /etc/ai-gateway/env

# server.mjs - 从脚本同目录复制
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/../gateway/server.mjs" ]; then
    cp "${SCRIPT_DIR}/../gateway/server.mjs" /opt/ai-os/gateway/server.mjs
    ok "Gateway 源码已复制"
else
    warn "未找到 server.mjs 源码，使用内联版本..."
    cat > /opt/ai-os/gateway/server.mjs << 'GWSRV'
import Fastify from "fastify";
import FastifyCors from "@fastify/cors";
import { readFileSync } from "fs";
const CONFIG_PATH = "/etc/ai-gateway/config.json";
function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")); }
  catch(e) { console.error("[FATAL] Cannot load config:", e.message); process.exit(1); }
}
function resolveEnv(val) {
  if (typeof val !== "string") return val;
  const m = val.match(/^\$\{(\w+)\}$/);
  return m ? (process.env[m[1]] ?? "") : val;
}
let CONFIG = loadConfig();
async function callAPI(cfg, modelId, messages, opts) {
  opts = opts || {};
  const url = cfg.base_url.replace(/\/$/, "") + "/chat/completions";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + resolveEnv(cfg.api_key) },
    body: JSON.stringify({ model: modelId, messages, ...opts })
  });
  if (!resp.ok) { const txt = await resp.text(); throw new Error("[" + cfg.base_url + "] HTTP " + resp.status + ": " + txt.slice(0, 200)); }
  const data = await resp.json();
  const c = data.choices?.[0];
  return { model: modelId, content: c?.message?.content ?? "", finish_reason: c?.finish_reason, usage: data.usage ?? {} };
}
function resolveModel(spec) {
  if (spec.includes("/")) { const p = spec.split("/", 2); return { provider: p[0], modelId: p[1] }; }
  const def = CONFIG.routing.default_model || "openai/gpt-4o";
  if (def.includes("/")) { const p = def.split("/", 2); return { provider: p[0], modelId: p[1] }; }
  return { provider: "openai", modelId: def };
}
async function routeChat(spec, messages, opts) {
  const { provider, modelId } = resolveModel(spec);
  const cfg = CONFIG.models[provider];
  if (!cfg) throw new Error("Unknown provider: " + provider);
  if (provider === "anthropic") throw new Error("Anthropic not supported yet");
  return callAPI(cfg, modelId, messages, opts);
}
const app = Fastify({ logger: false });
await app.register(FastifyCors, { origin: true });
app.get("/health", () => ({ status: "ok", version: "1.0.0", port: CONFIG.ai_gateway.port, models: Object.keys(CONFIG.models).length, providers: Object.keys(CONFIG.models) }));
app.get("/v1/models", () => {
  const data = [];
  for (const [prov, cfg] of Object.entries(CONFIG.models))
    for (const m of (cfg.available || [])) data.push({ id: m.id, object: "model", owned_by: prov });
  return { data };
});
app.post("/v1/chat/completions", async (req, reply) => {
  try {
    const resp = await routeChat(req.body.model, req.body.messages, req.body);
    return { id: "chatcmpl-" + Date.now(), object: "chat.completion", created: Math.floor(Date.now()/1000), model: resp.model,
      choices: [{ index: 0, message: { role: "assistant", content: resp.content }, finish_reason: resp.finish_reason || "stop" }], usage: resp.usage || {} };
  } catch(e) { console.error("[CHAT ERROR]", e.message); reply.code(502).send({ error: { message: e.message, type: "provider_error" } }); }
});
app.post("/v1/completions", async (req, reply) => {
  try {
    const resp = await routeChat(req.body.model, [{ role: "user", content: req.body.prompt }], req.body);
    return { id: "cmpl-" + Date.now(), object: "text_completion", choices: [{ text: resp.content, index: 0, finish_reason: "stop" }] };
  } catch(e) { reply.code(502).send({ error: { message: e.message } }); }
});
app.post("/v1/system/complete", async (req, reply) => {
  try {
    const rm = (CONFIG.routing.routes && CONFIG.routing.routes[req.body.route]) || CONFIG.routing.default_model;
    const resp = await routeChat(rm || "deepseek/deepseek-chat", [
      { role: "system", content: "You are a system assistant." },
      { role: "user", content: "Context:\n" + (req.body.context||"") + "\nComplete: " + (req.body.prefix||"") }
    ]);
    return { completion: resp.content, route: rm };
  } catch(e) { reply.code(502).send({ error: { message: e.message } }); }
});
app.post("/v1/astrbot/chat", async (req, reply) => app.inject({ method: "POST", url: "/v1/chat/completions", payload: req.body }));
app.post("/v1/astrbot/completions", async (req, reply) => app.inject({ method: "POST", url: "/v1/completions", payload: req.body }));
await app.listen({ port: CONFIG.ai_gateway.port, host: CONFIG.ai_gateway.host });
console.log("\nAI Gateway running on http://0.0.0.0:" + CONFIG.ai_gateway.port);
console.log("API Docs:    http://0.0.0.0:" + CONFIG.ai_gateway.port + "/docs");
console.log("Models:      " + Object.keys(CONFIG.models).join(", ") + "\n");
GWSRV
fi

cd /opt/ai-os/gateway
npm install --omit=dev --silent 2>/dev/null || {
    warn "本地 npm 安装失败，尝试全局..."
    npm install -g fastify @fastify/cors 2>/dev/null || warn "请手动: npm install -g fastify @fastify/cors"
}
ok "AI Gateway 部署完成"

# ─── 6. 部署 AI Desktop ─────────────────────────────────
info "部署 AI Desktop..."
cat > /opt/ai-os/gui/package.json << 'EOF'
{"name":"ai-desktop","version":"1.0.0","type":"module","dependencies":{}}
EOF

if [ -f "${SCRIPT_DIR}/../gui/app.mjs" ]; then
    cp "${SCRIPT_DIR}/../gui/app.mjs" /opt/ai-os/gui/app.mjs
    ok "Desktop 源码已复制"
else
    warn "未找到 app.mjs，使用内联版本"
    cat > /opt/ai-os/gui/app.mjs << 'DTAPP'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createServer } from "http";
const CACHE_DIR = join(process.env.HOME || "/root", ".config", "ai-os");
const SESSION_FILE = join(CACHE_DIR, "sessions.json");
const PORT = 8082;
mkdirSync(CACHE_DIR, { recursive: true });
let sessions = [];
if (existsSync(SESSION_FILE)) try { sessions = JSON.parse(readFileSync(SESSION_FILE, "utf-8")); } catch {}
function save() { writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2)); }
const srv = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:" + PORT);
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"});
    res.end('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI Desktop</title>' +
      '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#1a1a2e;color:#eee;height:100vh;display:flex;flex-direction:column}' +
      '.topbar{height:36px;background:#16213e;padding:0 16px;display:flex;align-items:center;border-bottom:1px solid #0f3460}' +
      '.title{font-size:13px;color:#e94560;font-weight:600}.sys-info{font-size:12px;color:#888;margin-left:auto}' +
      '.main{display:flex;flex:1;overflow:hidden}.sidebar{width:200px;background:#16213e;border-right:1px solid #0f3460;padding:12px}' +
      'button{width:100%;padding:8px;background:#e94560;color:white;border:none;border-radius:4px;cursor:pointer;margin-bottom:12px}' +
      '.session-list{overflow-y:auto}.session-item{padding:8px;border-bottom:1px solid #0f3460;cursor:pointer;font-size:13px}' +
      '.session-item:hover{background:#1a1a2e}.session-item.active{background:#0f3460;border-left:3px solid #e94560}' +
      '.content{flex:1;display:flex;flex-direction:column}.chat-area{flex:1;overflow-y:auto;padding:16px}' +
      '.msg{margin-bottom:8px;padding:8px 12px;border-radius:8px;font-size:14px}.msg.user{margin-left:auto;background:#0f3460}' +
      '.msg.assistant{margin-right:auto;background:#1a1a2e;border:1px solid #0f3460}' +
      '.input-area{padding:12px;border-top:1px solid #0f3460;display:flex;gap:8px;background:#16213e}' +
      'textarea{flex:1;background:#1a1a2e;border:1px solid #0f3460;color:#eee;padding:8px;border-radius:4px;resize:none;height:40px}' +
      'button{padding:0 20px;background:#e94560;color:white;border:none;border-radius:4px;cursor:pointer}</style>' +
      '</head><body><div class="topbar"><span class="title">AI DESKTOP</span><span class="sys-info" id="si">Checking...</span></div>' +
      '<div class="main"><div class="sidebar"><button onclick="createSession()">新建会话</button><div class="session-list" id="sl"></div></div>' +
      '<div class="content" id="ca"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:#555">' +
      '<div style="text-align:center"><h1 style="color:#e94560;margin-bottom:8px">AI Desktop</h1><p>创建新会话开始对话</p></div></div></div></div>' +
      '<script>let sessions=[],cur=null;async function load(){const r=await fetch("/api/sessions");sessions=(await r.json()).sessions||[];render();}' +
      'function render(){const l=document.getElementById("sl");l.innerHTML=sessions.map(s=>\'<div class="session-item \'+(s.id===cur?"active":"")+\'" onclick="sel("\'+s.id+\'")"><div>\'+s.name+\'</div><div style="font-size:11px;color:#666">\'+new Date(s.created).toLocaleTimeString()+\'</div></div>\').join("");}' +
      'async function createSession(){const n=prompt("会话名称:","会话 "+(sessions.length+1));const r=await fetch("/api/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n||"会话 "+(sessions.length+1)})});const s=await r.json();cur=s.id;sessions.push(s);render();renderChat();}' +
      'function sel(id){cur=id;render();renderChat();}' +
      'async function renderChat(){const a=document.getElementById("ca");if(!cur){a.innerHTML=\'<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#555"><div style="text-align:center"><h1 style="color:#e94560">AI Desktop</h1><p>创建新会话</p></div></div>\';return;}const s=sessions.find(x=>x.id===cur);if(!s)return;' +
      'a.innerHTML="<div class=\\"chat-area\\" id=\\"ch\\">"+s.messages.map(m=>\'<div class="msg \'+m.role+\'">\'+esc(m.content)+\'</div>\').join("")+"</div><div class=\\"input-area\\"><textarea id=\\"ib\\" placeholder=\\"输入消息...\\"></textarea><button onclick=\\"send(\\')">发送</button></div>";document.getElementById("ch").scrollTop=99999;}' +
      'async function send(){const ib=document.getElementById("ib"),c=ib.value.trim();if(!c||!cur)return;ib.value="";const s=sessions.find(x=>x.id===cur);s.messages.push({role:"user",content:c,time:Date.now()});renderChat();' +
      'const r=await fetch("/api/sessions/"+cur,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"message",content:c}));' +
      'if(r.ok){s.messages.push({role:"assistant",content:"[AI 响应中...]",time:Date.now()});renderChat();}}' +
      'function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}' +
      'async function updateSys(){try{const r=await fetch("http://localhost:8080/health");const d=await r.json();document.getElementById("si").textContent="网关正常 | "+d.models+" 个模型";}catch{document.getElementById("si").textContent="网关离线";}}' +
      'load();setInterval(updateSys,30000);updateSys();</script></body></html>';
  } else if (req.method === "GET" && url.pathname === "/api/sessions") {
    res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({sessions}));
  } else if (req.method === "POST" && url.pathname === "/api/sessions") {
    let b=""; req.on("data",d=>b+=d); req.on("end",()=>{
      const body=JSON.parse(b||"{}");
      const s={id:Date.now().toString(),name:body.name||"会话 "+(sessions.length+1),created:Date.now(),messages:[]};
      sessions.push(s);save();res.writeHead(201,{"Content-Type":"application/json"});res.end(JSON.stringify(s));
    });
  } else if (req.method === "POST" && url.pathname.startsWith("/api/sessions/")) {
    const id=url.pathname.split("/")[3]; const s=sessions.find(x=>x.id===id);
    if(!s){res.writeHead(404).end();return;}
    let b=""; req.on("data",d=>b+=d); req.on("end",async()=>{
      const body=JSON.parse(b||"{}");
      if(body.action==="message"){
        s.messages.push({role:"user",content:body.content,time:Date.now()});
        try{const r=await fetch("http://localhost:8080/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"deepseek/deepseek-chat",messages:s.messages})});
          if(r.ok){const d=await r.json();s.messages.push({role:"assistant",content:d.choices?.[0]?.message?.content||"[错误]",time:Date.now()});}
          else{s.messages.push({role:"assistant",content:"[网关返回错误]",time:Date.now()});}
        }catch(e){s.messages.push({role:"assistant",content:"[网络错误]",time:Date.now()});}
        save();res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));
      } else { res.writeHead(400).end(); }
    });
  } else if (req.method === "DELETE" && url.pathname.startsWith("/api/sessions/")) {
    const id=url.pathname.split("/")[3]; sessions=sessions.filter(x=>x.id!==id);save();res.writeHead(204).end();
  } else { res.writeHead(404).end(); }
});
srv.listen(PORT, "0.0.0.0", () => console.log("AI Desktop on http://0.0.0.0:" + PORT));
DTAPP
fi
ok "AI Desktop 部署完成"

# ─── 7. 注册 systemd 服务 ────────────────────────────────
info "注册 systemd 服务..."
cat > /etc/systemd/system/ai-gateway.service << 'SVCEOF'
[Unit]
Description=AI Gateway Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-os/gateway
ExecStart=/usr/bin/node /opt/ai-os/gateway/server.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
EnvironmentFile=/etc/ai-gateway/env

[Install]
WantedBy=multi-user.target
SVCEOF

cat > /etc/systemd/system/ai-desktop.service << 'SVCEOF'
[Unit]
Description=AI Desktop Environment
After=ai-gateway.service
Requires=ai-gateway.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-os/gui
ExecStart=/usr/bin/node /opt/ai-os/gui/app.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable ai-gateway.service
systemctl enable ai-desktop.service
systemctl start ai-gateway.service
systemctl start ai-desktop.service
ok "systemd 服务已注册并启动"

# ─── 8. 创建用户 ─────────────────────────────────────────
info "创建用户..."
useradd -m -s /bin/bash -G sudo aiuser 2>/dev/null || true
echo "aiuser:aiuser123" | chpasswd 2>/dev/null || true
echo 'aiuser ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers 2>/dev/null || true

# SSH 配置
mkdir -p /etc/ssh/sshd_config.d
echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config 2>/dev/null || true
echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config 2>/dev/null || true
service ssh restart 2>/dev/null || /usr/sbin/sshd 2>/dev/null || true
ok "用户 aiuser 创建完成"

# ─── 完成 ─────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  部署完成!"
echo "============================================================"
echo ""
echo "  AI 网关:    http://localhost:8080"
echo "  API文档:    http://localhost:8080/docs"
echo "  AI桌面:     http://localhost:8082"
echo ""
echo "  登录用户:    aiuser / aiuser123"
echo "  SSH端口:     22"
echo ""
echo "  下一步:"
echo "    1. sudo nano /etc/ai-gateway/config.json   (填入 DeepSeek API Key)"
echo "    2. sudo systemctl restart ai-gateway"
echo "    3. curl http://localhost:8080/health"
echo ""
echo "  管理命令:"
echo "    systemctl status ai-gateway"
echo "    journalctl -u ai-gateway -f"
echo "    ip addr show"
echo ""

sleep 2
if curl -s http://localhost:8080/health &>/dev/null; then
    ok "网关运行正常: $(curl -s http://localhost:8080/health)"
else
    warn "网关可能还在启动中: systemctl status ai-gateway"
fi
echo ""

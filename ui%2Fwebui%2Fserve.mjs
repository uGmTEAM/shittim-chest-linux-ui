import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── 加载配置 ──────────────────────────────────────────────
const CONFIG_PATHS = [
    path.join(ROOT, "config.json"),         // 同目录
    path.resolve(__dirname, "../../config.json"),  // 项目根
    path.resolve(__dirname, "../../../config.json"), // 再上一级
];
let CONFIG = {};
for (const p of CONFIG_PATHS) {
    if (fs.existsSync(p)) {
        try {
            CONFIG = JSON.parse(fs.readFileSync(p, "utf-8"));
            console.log("Loaded config from", p);
            break;
        } catch (e) { /* skip */ }
    }
}

const webuiPort = CONFIG.webui_port || CONFIG.port || 8099;
const gatewayPort = CONFIG.gateway_port || CONFIG.ai_gateway?.port || 8081;

// ─── 加载 arona.txt 提示词 ──────────────────────────────────
const PROMPT_PATH = CONFIG.prompt_path || path.resolve(ROOT, "arona.txt");
let PROMPT_CACHE = "";
try {
    PROMPT_CACHE = fs.readFileSync(PROMPT_PATH, "utf-8");
    console.log("Loaded arona.txt prompt (" + PROMPT_CACHE.length + " chars)");
} catch (e) {
    console.warn("Warning: arona.txt not found at", PROMPT_PATH);
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".jsx": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".skel": "application/octet-stream",
    ".atlas": "text/plain; charset=utf-8",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

const PUBLIC_API = {
    "username": CONFIG.username || "",
    "ai_greeting": CONFIG.ai_greeting || "老师",
    "gateway_port": gatewayPort,
    "gateway_url": CONFIG.gateway_url || `http://127.0.0.1:${gatewayPort}`,
};

http.createServer((req, res) => {
    // API 路由：返回 arona.txt 提示词
    if (req.url === "/api/prompt") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ prompt: PROMPT_CACHE }));
        return;
    }

    // API 路由：返回公共配置
    if (req.url === "/api/config") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(PUBLIC_API));
        return;
    }

    // API 路由：清除配置并跳转（HTTP 302 直接跳转，不依赖 JS）
    if (req.url.startsWith("/api/clear-config")) {
        res.writeHead(302, {
            "Location": "/",
            "Cache-Control": "no-store, no-cache",
        });
        res.end();
        return;
    }

    let rawUrl = req.url;
    const queryIdx = rawUrl.indexOf("?");
    let pathPart = queryIdx >= 0 ? rawUrl.slice(0, queryIdx) : rawUrl;
    let filePath = path.join(__dirname, pathPart === "/" ? "index.html" : pathPart);
    if (pathPart === "/") filePath = path.join(__dirname, "index.html");

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not Found");
            return;
        }
        // 清除配置：在 index.html 响应中注入 localStorage.clear() 脚本
        const q = queryIdx >= 0 ? rawUrl.slice(queryIdx + 1) : "";
        if (pathPart === "/" && q.includes("_clear=1")) {
            const body = data.toString();
            const injectScript = '<script>localStorage.clear();</script>';
            const modified = body.replace("</head>", injectScript + "</head>");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, no-cache" });
            res.end(modified);
            return;
        }
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
        res.end(data);
    });
}).listen(webuiPort, () => {
    console.log("什亭之匣 WebUI: http://127.0.0.1:" + webuiPort);
    console.log("Gateway API:    http://127.0.0.1:" + gatewayPort);
});

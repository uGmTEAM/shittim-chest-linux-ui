#!/usr/bin/env node
/**
 * 什亭之匣 AI OS - 发行包打包脚本 (跨平台)
 * 用法: node build-package.mjs [版本号]
 * 输出: output/ai-os-v{VERSION}.zip
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const VERSION = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUTPUT_DIR = path.join(ROOT, "output");
const PKG_NAME = `ai-os-v${VERSION}`;
const BUILD_DIR = path.join(OUTPUT_DIR, PKG_NAME);
const ZIP_PATH = path.join(OUTPUT_DIR, `${PKG_NAME}.zip`);

const GREEN = "\x1b[0;32m", CYAN = "\x1b[0;36m", YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m", RESET = "\x1b[0m";

function copy(src, dest) {
    if (!fs.existsSync(src)) return false;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            copy(path.join(src, entry.name), path.join(dest, entry.name));
        }
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
    return true;
}

console.log(`${GREEN}═══ 什亭之匣 发行包打包 ═══${RESET}`);
console.log(`  版本:   ${VERSION}`);
console.log(`  输出:   ${ZIP_PATH}`);

// 准备
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

// WebUI
console.log(`${CYAN}▸ WebUI${RESET}`);
const webuiSrc = path.join(ROOT, "ui", "webui");
const webuiDst = path.join(BUILD_DIR, "webui");
for (const item of ["index.html", "login.html", "preview.html", "serve.mjs"]) {
    copy(path.join(webuiSrc, item), path.join(webuiDst, item));
}
for (const dir of ["js", "css", "assets", "vendor"]) {
    copy(path.join(webuiSrc, dir), path.join(webuiDst, dir));
}

// Gateway
console.log(`${CYAN}▸ Gateway${RESET}`);
const gwSrc = path.join(ROOT, "gateway");
const gwDst = path.join(BUILD_DIR, "gateway");
for (const item of ["server.mjs", "package.json", "config.json"]) {
    copy(path.join(gwSrc, item), path.join(gwDst, item));
}

// Scripts
console.log(`${CYAN}▸ Scripts${RESET}`);
const scriptsSrc = path.join(ROOT, "scripts");
const scriptsDst = path.join(BUILD_DIR, "scripts");
for (const item of ["ai-os.service", "start-all.sh", "stop-all.sh"]) {
    copy(path.join(scriptsSrc, item), path.join(scriptsDst, item));
}

// 顶层
console.log(`${CYAN}▸ Root files${RESET}`);
copy(path.join(ROOT, "install.sh"),           path.join(BUILD_DIR, "install.sh"));
copy(path.join(ROOT, "config.default.json"),  path.join(BUILD_DIR, "config.json"));
copy(path.join(ROOT, "arona.txt"),            path.join(BUILD_DIR, "arona.txt"));

// README
fs.writeFileSync(path.join(BUILD_DIR, "README.txt"),
`什亭之匣 AI OS v${VERSION}
=============================

Linux 系统级安装包 (Debian/Ubuntu)

安装（需要 root）:
  sudo bash install.sh

无人值守安装（默认值）:
  sudo bash install.sh --yes

安装后:
  systemctl status ai-os
  curl http://127.0.0.1:8099

强制重置密码:
  root / <用户名>:
  We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho.

目录结构:
  /opt/ai-os/webui/     WebUI 前端 + serve.mjs
  /opt/ai-os/gateway/   Fastify AI Gateway
  /opt/ai-os/scripts/   systemd + 启动脚本
  /opt/ai-os/config.json  安装生成的主配置
  /opt/ai-os/arona.txt  AI 人格提示词
`);

// Zip 打包
console.log(`${CYAN}▸ Zip 打包${RESET}`);
const platform = process.platform;
try {
    if (platform === "win32") {
        // Windows: 用 PowerShell 压缩
        execSync(
            `Compress-Archive -Path "${BUILD_DIR}" -DestinationPath "${ZIP_PATH}" -Force`,
            { shell: "powershell.exe", stdio: "inherit" }
        );
    } else {
        // Linux/Mac: 用 zip
        execSync(`cd "${OUTPUT_DIR}" && rm -f "${PKG_NAME}.zip" && zip -q -r "${PKG_NAME}.zip" "${PKG_NAME}/"`, {
            stdio: "inherit"
        });
    }
} catch (e) {
    console.error(`压缩失败: ${e.message}`);
    process.exit(1);
}

const stats = fs.statSync(ZIP_PATH);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

console.log(`${GREEN}✓ 完成${RESET}`);
console.log(`  ${YELLOW}${ZIP_PATH}${RESET}`);
console.log(`  大小: ${CYAN}${sizeMB} MB${RESET}`);

// 清理 build 目录
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
console.log(`  ${DIM}(已清理临时目录)${RESET}`);

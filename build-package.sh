#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════╗
# ║    什亭之匣 AI OS - 发行包打包脚本                          ║
# ║    用法: bash build-package.sh [版本号]                    ║
# ╚═══════════════════════════════════════════════════════════╝

set -euo pipefail

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; C='\033[0;36m'; N='\033[0m'

ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="${1:-$(date +%Y%m%d)}"
OUTPUT_DIR="$ROOT/output"
PKG_NAME="ai-os-v${VERSION}"
BUILD_DIR="$OUTPUT_DIR/${PKG_NAME}"
ZIP_PATH="$OUTPUT_DIR/${PKG_NAME}.zip"

echo -e "${G}═══ 什亭之匣 发行包打包 ═══${N}"
echo -e "  版本:   ${W}v${VERSION}${N}"
echo -e "  输出:   ${W}${ZIP_PATH}${N}"

mkdir -p "$OUTPUT_DIR"

# 清理旧构建
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# ─── 复制 webui ───────────────────────────────────────────────
echo -e "${C}▸ WebUI${N}"
mkdir -p "$BUILD_DIR/webui"
cp -a "$ROOT/ui/webui/"*.html "$BUILD_DIR/webui/" 2>/dev/null || true
cp -a "$ROOT/ui/webui/js"       "$BUILD_DIR/webui/"
cp -a "$ROOT/ui/webui/css"      "$BUILD_DIR/webui/"
cp -a "$ROOT/ui/webui/assets"   "$BUILD_DIR/webui/" 2>/dev/null || true
cp -a "$ROOT/ui/webui/vendor"   "$BUILD_DIR/webui/" 2>/dev/null || true
cp -a "$ROOT/ui/webui/serve.mjs" "$BUILD_DIR/webui/"

# webui/.gitignore 类文件清理
rm -f "$BUILD_DIR/webui"/*.log 2>/dev/null || true

# ─── 复制 gateway ─────────────────────────────────────────────
echo -e "${C}▸ Gateway${N}"
mkdir -p "$BUILD_DIR/gateway"
cp -a "$ROOT/gateway/"*.mjs      "$BUILD_DIR/gateway/" 2>/dev/null || true
cp -a "$ROOT/gateway/package.json" "$BUILD_DIR/gateway/"
cp -a "$ROOT/gateway/config.json" "$BUILD_DIR/gateway/config.default.json" 2>/dev/null || true
# 不复制 node_modules（install.sh 里会 npm install）

# ─── 复制 scripts ────────────────────────────────────────────
echo -e "${C}▸ Scripts${N}"
mkdir -p "$BUILD_DIR/scripts"
cp -a "$ROOT/scripts/ai-os.service"  "$BUILD_DIR/scripts/" 2>/dev/null || true
cp -a "$ROOT/scripts/start-all.sh"   "$BUILD_DIR/scripts/" 2>/dev/null || true
cp -a "$ROOT/scripts/stop-all.sh"    "$BUILD_DIR/scripts/" 2>/dev/null || true
chmod +x "$BUILD_DIR/scripts/"*.sh 2>/dev/null || true

# ─── 顶层文件 ────────────────────────────────────────────────
echo -e "${C}▸ Root files${N}"
cp -a "$ROOT/install.sh"               "$BUILD_DIR/"
cp -a "$ROOT/config.default.json"      "$BUILD_DIR/config.json" 2>/dev/null || true
cp -a "$ROOT/arona.txt"                "$BUILD_DIR/" 2>/dev/null || true
chmod +x "$BUILD_DIR/install.sh"

# ─── 写 README.txt ───────────────────────────────────────────
cat > "$BUILD_DIR/README.txt" <<EOF
什亭之匣 AI OS v${VERSION}
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

发行地址:
  https://github.com/your-org/ai-os/releases
EOF

# ─── 打包 ────────────────────────────────────────────────────
echo -e "${C}▸ Zip 打包${N}"
cd "$OUTPUT_DIR"
rm -f "$ZIP_PATH"
zip -q -r "${PKG_NAME}.zip" "${PKG_NAME}/"

echo -e "${G}✓ 完成${N}"
echo -e "  ${W}${ZIP_PATH}${N}"
echo -e "  大小: ${C}$(du -h "$ZIP_PATH" | cut -f1)${N}"

# 列出包含内容
echo -e "\n${D}包内容:${N}"
unzip -l "$ZIP_PATH" | tail -20

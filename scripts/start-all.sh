#!/bin/bash
# 什亭之匣 - 一键启动 Gateway + WebUI
# install.sh 会把此脚本安装到 /opt/ai-os/bin/start-all.sh

set -e

BASE="/opt/ai-os"
cd "$BASE"

LOG_DIR="$BASE/logs"
mkdir -p "$LOG_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动什亭之匣全套服务..."

# ── 启动 Gateway ──
cd "$BASE/gateway"
nohup node server.mjs > "$LOG_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!
echo "[$(date)] Gateway PID=$GATEWAY_PID"

# ── 等待 Gateway 就绪 ──
sleep 2

# ── 启动 WebUI ──
cd "$BASE/webui"
nohup node serve.mjs > "$LOG_DIR/webui.log" 2>&1 &
WEBUI_PID=$!
echo "[$(date)] WebUI PID=$WEBUI_PID"

# ── 写入 PID 文件 ──
echo "$GATEWAY_PID" > "$BASE/gateway.pid"
echo "$WEBUI_PID"   > "$BASE/webui.pid"

echo "[$(date)] 全部启动完毕"
echo "  WebUI:  http://127.0.0.1:8099"
echo "  Gateway: http://127.0.0.1:8081"

# 保持前台（systemd 需要）
wait

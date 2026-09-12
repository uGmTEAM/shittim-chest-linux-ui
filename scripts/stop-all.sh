#!/bin/bash
# 什亭之匣 - 停止 Gateway + WebUI

BASE="/opt/ai-os"

echo "停止什亭之匣服务..."

for f in "$BASE/webui.pid" "$BASE/gateway.pid"; do
    if [ -f "$f" ]; then
        PID=$(cat "$f")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "已停止 PID=$PID"
        fi
        rm -f "$f"
    fi
done

# 兜底：杀掉残留 node 进程
pkill -f "node.*serve.mjs" 2>/dev/null || true
pkill -f "node.*server.mjs" 2>/dev/null || true

echo "全部停止"

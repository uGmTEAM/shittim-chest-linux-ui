#!/bin/bash
# ============================================================
# AI OS - 验证脚本
# 用法: sudo bash verify.sh
# ============================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

OK=0; FAIL=0

echo ""
echo "=== AI OS 服务检查 ==="
echo ""

if command -v node &>/dev/null; then
    pass "Node.js: $(node --version)"
    ((OK++))
else
    fail "Node.js 未安装"
    ((FAIL++))
fi

if command -v npm &>/dev/null; then
    pass "npm: $(npm --version)"
    ((OK++))
else
    fail "npm 未安装"
    ((FAIL++))
fi

if pgrep -f "server.mjs" &>/dev/null; then
    GW_PID=$(pgrep -f "server.mjs")
    pass "AI Gateway 运行中 (PID $GW_PID)"
    ((OK++))
else
    warn "AI Gateway 未运行"
    ((FAIL++))
fi

if curl -s http://localhost:8080/health &>/dev/null; then
    GW_H=$(curl -s http://localhost:8080/health)
    pass "AI Gateway 健康: $GW_H"
    ((OK++))
else
    warn "AI Gateway 端口 8080 无响应"
    ((FAIL++))
fi

if pgrep -f "app.mjs" &>/dev/null; then
    DT_PID=$(pgrep -f "app.mjs")
    pass "AI Desktop 运行中 (PID $DT_PID)"
    ((OK++))
else
    warn "AI Desktop 未运行"
    ((FAIL++))
fi

if curl -s http://localhost:8082 &>/dev/null; then
    pass "AI Desktop 端口 8082 可访问"
    ((OK++))
else
    warn "AI Desktop 端口 8082 无响应"
    ((FAIL++))
fi

if [ -f "/etc/ai-gateway/config.json" ]; then
    pass "配置文件存在"
    ((OK++))
    if grep -q '"api_key": ""' /etc/ai-gateway/config.json; then
        warn "API Key 未配置，请编辑 /etc/ai-gateway/config.json"
    else
        pass "API Key 已配置"
        ((OK++))
    fi
else
    fail "配置文件不存在"
    ((FAIL++))
fi

for svc in ai-gateway ai-desktop; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        pass "systemd $svc: running"
        ((OK++))
    else
        warn "systemd $svc: not active"
        ((FAIL++))
    fi
done

if locale | grep -q "zh_CN.UTF-8"; then
    pass "Locale: zh_CN.UTF-8"
    ((OK++))
else
    warn "Locale 未配置中文"
    ((FAIL++))
fi

if id aiuser &>/dev/null; then
    pass "用户 aiuser 已创建"
    ((OK++))
else
    warn "用户 aiuser 不存在"
    ((FAIL++))
fi

echo ""
echo "============================================================"
echo "  结果: $OK 通过, $FAIL 失败"
echo "============================================================"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}所有检查通过！AI OS 已就绪。${NC}"
    echo ""
    echo "  访问地址:"
    echo "    AI Gateway:  http://localhost:8080/docs"
    echo "    AI Desktop:  http://localhost:8082"
    echo ""
    echo "  获取 VM IP:"
    echo "    ip addr show | grep inet"
    echo ""
elif [ $FAIL -le 2 ]; then
    echo -e "${YELLOW}基本正常，有少量警告。${NC}"
else
    echo -e "${RED}存在问题，请检查上述失败项。${NC}"
    echo ""
    echo "修复建议:"
    echo "  sudo systemctl restart ai-gateway"
    echo "  sudo journalctl -u ai-gateway -n 20"
fi
echo ""

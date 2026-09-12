#!/bin/bash
set -e
exec > /var/log/ai-os-install.log 2>&1
echo "=== AI OS Deploy Started ==="

echo "[1/7] Installing dependencies..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl git sudo ca-certificates \
    nodejs npm \
    fonts-wqy-zenhei fonts-wqy-microhei \
    dbus-x11 xdg-utils htop vim-tiny \
    openssh-server procps net-tools iputils-ping 2>/dev/null || true
echo "[OK] Dependencies installed"

echo "[2/7] Configuring locale..."
echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true
locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null || true
cat > /etc/default/locale << 'EOF'
LANG=zh_CN.UTF-8
LANGUAGE=zh_CN:en
LC_ALL=zh_CN.UTF-8
EOF
cat > /etc/profile.d/99-locale.sh << 'EOF'
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
export TERM=xterm-256color
export PYTHONIOENCODING=utf-8
EOF
chmod +x /etc/profile.d/99-locale.sh
echo "[OK] Locale configured"

echo "[3/7] Creating directories..."
mkdir -p /opt/ai-os/gateway /opt/ai-os/gui /etc/ai-gateway
echo "[OK] Directories created"

echo "[4/7] Deploying AI Gateway..."
cp /ai-os-scripts/server.mjs /opt/ai-os/gateway/server.mjs 2>/dev/null || true
cat > /opt/ai-os/gateway/package.json << 'EOF'
{"name":"ai-gateway","version":"1.0.0","type":"module","main":"server.mjs","scripts":{"start":"node server.mjs"},"dependencies":{"fastify":"^5.0.0","@fastify/cors":"^10.0.0"}}
EOF
cat > /etc/ai-gateway/config.json << 'EOF'
{"ai_gateway":{"port":8080,"host":"0.0.0.0"},"models":{"openai":{"api_key":"","base_url":"https://api.openai.com/v1"},"deepseek":{"api_key":"","base_url":"https://api.deepseek.com"},"local":{"api_key":"","base_url":"http://localhost:11434/v1"}},"routing":{"default_model":"deepseek/deepseek-chat"}}
EOF
cd /opt/ai-os/gateway && npm install --omit=dev --silent 2>/dev/null || true
echo "[OK] AI Gateway deployed"

echo "[5/7] Deploying AI Desktop..."
cp /ai-os-scripts/app.mjs /opt/ai-os/gui/app.mjs 2>/dev/null || true
cat > /opt/ai-os/gui/package.json << 'EOF'
{"name":"ai-desktop","version":"1.0.0","type":"module"}
EOF
echo "[OK] AI Desktop deployed"

echo "[6/7] Registering systemd services..."
cat > /etc/systemd/system/ai-gateway.service << 'EOF'
[Unit]
Description=AI Gateway Service
After=network-online.target
[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-os/gateway
ExecStart=/usr/bin/node /opt/ai-os/gateway/server.mjs
Restart=always
StandardOutput=journal
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/ai-desktop.service << 'EOF'
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
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ai-gateway.service ai-desktop.service
systemctl start ai-gateway.service ai-desktop.service
echo "[OK] Services started"

echo "[7/7] Configuring users..."
useradd -m -s /bin/bash -G sudo aiuser 2>/dev/null || true
echo "aiuser:aiuser123" | chpasswd 2>/dev/null || true
echo 'aiuser ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers 2>/dev/null || true
sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config 2>/dev/null || true
service ssh restart 2>/dev/null || /usr/sbin/sshd 2>/dev/null || true
echo "[OK] Users configured"

echo ""
echo "=== AI OS Deploy Complete ==="
GW_IP=$(ip addr show ens33 2>/dev/null | grep 'inet 192' | awk '{print $2}' | cut -d/ -f1)
[ -z "$GW_IP" ] && GW_IP=$(hostname -I | awk '{print $1}')
echo "  AI Gateway:  http://$GW_IP:8080/docs"
echo "  AI Desktop:  http://$GW_IP:8082"
echo "  SSH:         ssh aiuser@$GW_IP (password: aiuser123)"
echo "  Next: sudo nano /etc/ai-gateway/config.json"

#!/bin/bash
# 安装 QML 依赖并配置应用
set -e

echo "=== 安装 QML 应用 ==="

# 安装 Qt 运行时
apt-get update
apt-get install -y \
    qt6-base-dev \
    qt6-declarative-dev \
    qt6-multimedia-dev \
    qml6-module-qtquick-controls \
    qml6-module-qtgraphicaleffects \
    qml6-module-qtquick-layouts \
    python3-pip \
    python3-pyside6.qtquickextras

# 复制应用
mkdir -p /opt/ai-os/ui/qml-app
cp -r /tmp/qml-app/* /opt/ai-os/ui/qml-app/

# 创建桌面快捷方式
cat > /usr/share/applications/ai-os.desktop << 'EOF'
[Desktop Entry]
Name=AI OS
Comment=AI Desktop Application
Exec=python3 /opt/ai-os/ui/qml-app/main.py
Icon=dialog-information
Type=Application
Categories=Utility;
Terminal=false
EOF

chmod +x /opt/ai-os/ui/qml-app/main.py

# 创建 assets 目录
mkdir -p /opt/ai-os/ui/qml-app/assets/sprites
mkdir -p /opt/ai-os/ui/qml-app/assets/audio

echo "✓ QML 应用已部署到 /opt/ai-os/ui/qml-app/"
echo ""
echo "启动方式："
echo "  python3 /opt/ai-os/ui/qml-app/main.py"
echo ""
echo "配置角色贴图："
echo "  cp your_image.png /opt/ai-os/ui/qml-app/assets/sprites/idle.png"
echo ""
echo "配置语音："
echo "  cp your_voice.wav /opt/ai-os/ui/qml-app/assets/audio/indeed.wav"

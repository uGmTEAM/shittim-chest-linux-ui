"""
AI OS - Custom Debian ISO Builder
Usage: python make-custom-iso.py [debian.iso path]
"""
import subprocess
import os
import sys
import shutil
import time

# === Config ===
MKISOFS = r"E:\vmware\mkisofs.exe"
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK_DIR = r"C:\tmp\ai-os-build"
OUTPUT_DIR = os.path.join(PROJECT_DIR, "output")

# === Auto-detect ISO ===
iso_path = sys.argv[1] if len(sys.argv) > 1 else None
if not iso_path:
    search_dirs = [
        r"D:\Documents\Downloads",
        r"G:\", r"E:\", r"F:\",
    ]
    for d in search_dirs:
        if os.path.exists(d):
            for f in os.listdir(d):
                if f.lower().startswith("debian") and f.lower().endswith(".iso"):
                    iso_path = os.path.join(d, f)
                    break
        if iso_path:
            break

if not iso_path or not os.path.exists(iso_path):
    print(f"[ERR] No Debian ISO found.")
    print(f"Usage: python make-custom-iso.py <path/to/debian.iso>")
    print(f"Example: python make-custom-iso.py D:\\Downloads\\debian-13.6.0-amd64-netinst.iso")
    sys.exit(1)

print("=" * 60)
print(f"  AI OS - Custom Debian ISO Builder")
print(f"  Source: {iso_path}")
print("=" * 60)
print()

if not os.path.exists(MKISOFS):
    print(f"[ERR] mkisofs not found at: {MKISOFS}")
    sys.exit(1)

# === 1. Prepare dirs ===
print("[1/6] Preparing directories...")
if os.path.exists(WORK_DIR):
    shutil.rmtree(WORK_DIR)
os.makedirs(os.path.join(WORK_DIR, "extracted"), exist_ok=True)
os.makedirs(os.path.join(WORK_DIR, "working"), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
print("[ OK ] Done")

# === 2. Extract ISO ===
print("[2/6] Extracting ISO (1-2 min)...")
try:
    result = subprocess.run(
        ["7z", "x", iso_path, f"-o{os.path.join(WORK_DIR, 'extracted')}", "-y"],
        capture_output=True, timeout=300
    )
    if result.returncode != 0:
        print(f"[WARN] 7z failed: {result.stderr.decode()[:200]}")
        raise FileNotFoundError("7z")
except FileNotFoundError:
    print("[WARN] 7-Zip not found, trying PowerShell built-in...")
    ps_code = f"""Expand-Archive -Path '{iso_path}' -DestinationPath '{os.path.join(WORK_DIR, 'extracted')}' -Force"""
    result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_code], capture_output=True, timeout=300)
    if result.returncode != 0:
        print(f"[ERR] Cannot extract ISO. Install 7-Zip: winget install -e --id 7zip.7zip")
        sys.exit(1)
print("[ OK ] ISO extracted")

# === 3. Copy content ===
print("[3/6] Copying ISO content...")
src = os.path.join(WORK_DIR, "extracted")
dst = os.path.join(WORK_DIR, "working")

def copy_tree(src, dst):
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)

copy_tree(src, dst)
print("[ OK ] Content copied")

# === 4. Inject AI OS ===
print("[4/6] Injecting AI OS components...")

dirs_to_create = [
    os.path.join(WORK_DIR, "working", ".ai-os"),
    os.path.join(WORK_DIR, "working", "ai-os-scripts"),
    os.path.join(WORK_DIR, "working", "etc", "systemd", "system"),
    os.path.join(WORK_DIR, "working", "etc", "skel"),
]
for d in dirs_to_create:
    os.makedirs(d, exist_ok=True)

# Copy server.mjs
server_src = os.path.join(PROJECT_DIR, "gateway", "server.mjs")
server_dst = os.path.join(WORK_DIR, "working", "ai-os-scripts", "server.mjs")
if os.path.exists(server_src):
    shutil.copy2(server_src, server_dst)
    print("[ OK ] server.mjs injected")
else:
    print("[WARN] server.mjs not found")

# Copy app.mjs
app_src = os.path.join(PROJECT_DIR, "gui", "app.mjs")
app_dst = os.path.join(WORK_DIR, "working", "ai-os-scripts", "app.mjs")
if os.path.exists(app_src):
    shutil.copy2(app_src, app_dst)
    print("[ OK ] app.mjs injected")
else:
    print("[WARN] app.mjs not found")

# Create post-install.sh
post_install = os.path.join(WORK_DIR, "working", "ai-os-scripts", "post-install.sh")
post_template = os.path.join(PROJECT_DIR, "scripts", "post-install-template.sh")
if os.path.exists(post_template):
    shutil.copy2(post_template, post_install)
    print("[ OK ] post-install.sh created from template")
else:
    # Fallback inline creation
    with open(post_install, "w", encoding="utf-8") as f:
        f.write(r"""#!/bin/bash
set -e
exec > /var/log/ai-os-install.log 2>&1
echo "=== AI OS Deploy Started ==="

echo "[1/7] Installing dependencies..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl git sudo ca-certificates nodejs npm \
    fonts-wqy-zenhei fonts-wqy-microhei \
    dbus-x11 xdg-utils htop vim-tiny \
    openssh-server procps net-tools iputils-ping 2>/dev/null || true
echo "[OK] Dependencies installed"

echo "[2/7] Configuring locale..."
echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true
locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null || true
printf 'LANG=zh_CN.UTF-8\nLANGUAGE=zh_CN:en\nLC_ALL=zh_CN.UTF-8\n' > /etc/default/locale
printf 'export LANG=zh_CN.UTF-8\nexport LC_ALL=zh_CN.UTF-8\nexport TERM=xterm-256color\n' > /etc/profile.d/99-locale.sh
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
""")
    print("[ OK ] post-install.sh created (inline)")

# Create firstboot service
firstboot = os.path.join(WORK_DIR, "working", "etc", "systemd", "system", "ai-os-firstboot.service")
with open(firstboot, "w", encoding="utf-8") as f:
    f.write("""[Unit]
Description=AI OS First Boot Deployment
After=network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash /ai-os-scripts/post-install.sh
StandardOutput=journal
TimeoutSec=600
[Install]
WantedBy=multi-user.target
""")
print("[ OK ] firstboot service created")

# Update skel .bashrc
skel_bashrc = os.path.join(WORK_DIR, "working", "etc", "skel", ".bashrc")
os.makedirs(os.path.dirname(skel_bashrc), exist_ok=True)
with open(skel_bashrc, "a", encoding="utf-8") as f:
    f.write('\n# AI OS auto-start\n')
    f.write('systemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service\n')
print("[ OK ] skel .bashrc configured")

# === 5. Build ISO ===
print("[5/6] Building ISO...")
iso_output = os.path.join(OUTPUT_DIR, "ai-os-debian-custom.iso")

cmd = [
    MKISOFS,
    "-r", "-V", "AI-OS-DEBIAN",
    "-cache-inodes", "-J", "-l",
    "-b", "isolinux/isolinux.bin",
    "-c", "isolinux/boot.cat",
    "-no-emul-boot", "-boot-load-size", "4", "-boot-info-table",
    "-o", iso_output,
    os.path.join(WORK_DIR, "working")
]

result = subprocess.run(cmd, capture_output=True, timeout=300)
if result.returncode == 0 and os.path.exists(iso_output):
    size_mb = os.path.getsize(iso_output) / (1024 * 1024)
    print(f"[ OK ] ISO created: {iso_output}")
    print(f"[ OK ] Size: {size_mb:.1f} MB")
else:
    stderr_out = result.stderr.decode("utf-8", errors="replace")[:500] if result.stderr else ""
    stdout_out = result.stdout.decode("utf-8", errors="replace")[:500] if result.stdout else ""
    print(f"[WARN] ISO build output: {stdout_out or stderr_out}")
    if not os.path.exists(iso_output):
        print("[ERR] ISO was not created")
        sys.exit(1)

# === 6. Cleanup ===
print("[6/6] Cleaning up...")
shutil.rmtree(WORK_DIR, ignore_errors=True)
print("[ OK ] Cleanup done")

print()
print("=" * 60)
print("  DONE!")
print(f"  Output: {iso_output}")
print("=" * 60)
print()
print("  Next steps:")
print("  1. Use UltraISO to write ISO to USB")
print("  2. Boot from USB and install Debian")
print("  3. After install, AI OS auto-deploys (about 2 min)")
print("  4. Log: sudo cat /var/log/ai-os-install.log")
print()
print("  After deploy:")
print("  AI Gateway:  http://<VM_IP>:8080/docs")
print("  AI Desktop:  http://<VM_IP>:8082")
print("  SSH:         ssh aiuser@<VM_IP> (pass: aiuser123)")
print()
print("  Configure API Key:")
print("  sudo nano /etc/ai-gateway/config.json")
print("  sudo systemctl restart ai-gateway")
print()
print("=" * 60)

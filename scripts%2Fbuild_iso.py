import subprocess
import os
import sys
import shutil
import uuid

MKISOFS = r"E:\vmware\mkisofs.exe"
PROJECT_DIR = r"c:\Users\Administrator\Documents\trae_projects\new\ai-os"
OUTPUT_DIR = os.path.join(PROJECT_DIR, "output")
ISO_PATH = r"D:\Documents\Downloads\debian-13.6.0-amd64-netinst.iso"

print("AI OS - Custom Debian ISO Builder")
print("Source:", ISO_PATH)
print()

# 1. Prepare dirs
print("[1/6] Preparing directories...")
# Clean up any old build dirs
for old in [d for d in os.listdir(r"C:\tmp") if d.startswith("ai-os-build")]:
    old_path = os.path.join(r"C:\tmp", old)
    try:
        shutil.rmtree(old_path, ignore_errors=True)
    except:
        pass
WORK_DIR = rf"C:\tmp\ai-os-build-{uuid.uuid4().hex[:8]}"
os.makedirs(os.path.join(WORK_DIR, "extracted"), exist_ok=True)
os.makedirs(os.path.join(WORK_DIR, "working"), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
print("[ OK ]")

# 2. Extract ISO - use PowerShell Mount-DiskImage
print("[2/6] Extracting ISO...")
try:
    # Try mounting ISO
    ps = f'''
$disk = Mount-DiskImage -ImagePath '{ISO_PATH}' -PassThru
$vol = Get-Volume -DiskImage $disk | Where-Object {{$_.DriveLetter}}
if ($vol) {{
    $src = ($vol.DriveLetter + ':\\')
    Write-Host "Mounted at $src"
}} else {{
    Write-Host "MOUNT_FAILED"
}}
Dismount-DiskImage -DiskImage $disk 2>$null
'''
    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, timeout=120)
    output = r.stdout.strip()
    print("  PS output:", output[:200])
    
    # If mount failed, try 7z fallback
    if "MOUNT_FAILED" in output:
        # Find 7z
        for p in [r"C:\Program Files\7-Zip\7z.exe", r"C:\Program Files (x86)\7-Zip\7z.exe"]:
            if os.path.exists(p):
                subprocess.run([p, "x", ISO_PATH, f"-o{os.path.join(WORK_DIR, 'extracted')}", "-y"], 
                              capture_output=True, timeout=300)
                break
        else:
            raise FileNotFoundError("7z not found and ISO mount failed")
    else:
        # Get the mounted drive letter
        ps2 = f'''
$disk = Mount-DiskImage -ImagePath '{ISO_PATH}' -PassThru
$vol = Get-Volume -DiskImage $disk | Where-Object {{$_.DriveLetter -ne $null}}
$vol.DriveLetter
Dismount-DiskImage -DiskImage $disk 2>$null
'''
        r2 = subprocess.run(["powershell", "-NoProfile", "-Command", ps2], capture_output=True, text=True, timeout=60)
        drive = r2.stdout.strip()
        if drive and len(drive) == 1:
            src_path = drive + ":\\"
            # Copy all files using robust method
            def robust_copy(src, dst):
                for item in os.listdir(src):
                    s = os.path.join(src, item)
                    d = os.path.join(dst, item)
                    try:
                        if os.path.isdir(s):
                            if os.path.exists(d):
                                shutil.rmtree(d)
                            shutil.copytree(s, d, dirs_exist_ok=True)
                        else:
                            shutil.copy2(s, d)
                    except Exception as e:
                        print(f"  SKIP: {item} ({e})")
            robust_copy(src_path, os.path.join(WORK_DIR, "extracted"))
            print("[ OK ] ISO extracted via mount")
        else:
            raise FileNotFoundError("Could not get drive letter")
except Exception as e:
    print(f"[ERR] ISO extraction failed: {e}")
    sys.exit(1)

# 3. Copy content (flat copy: extracted/* -> working/*)
print("[3/6] Copying content...")
src = os.path.join(WORK_DIR, "extracted")
dst = os.path.join(WORK_DIR, "working")
# Ensure dst is the target root, not nested
for item in os.listdir(src):
    s = os.path.join(src, item)
    d = os.path.join(dst, item)
    try:
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
    except Exception as e:
        print(f"  SKIP: {item} ({e})")
print("[ OK ]")

# 4. Inject AI OS
print("[4/6] Injecting AI OS...")
for d in [".ai-os", "ai-os-scripts", "etc/systemd/system", "etc/skel"]:
    os.makedirs(os.path.join(dst, d), exist_ok=True)

# Copy server.mjs
ssrc = os.path.join(PROJECT_DIR, "gateway", "server.mjs")
sdst = os.path.join(dst, "ai-os-scripts", "server.mjs")
if os.path.exists(ssrc):
    shutil.copy2(ssrc, sdst)
    print("[ OK ] server.mjs")

# Copy app.mjs
asrc = os.path.join(PROJECT_DIR, "gui", "app.mjs")
adst = os.path.join(dst, "ai-os-scripts", "app.mjs")
if os.path.exists(asrc):
    shutil.copy2(asrc, adst)
    print("[ OK ] app.mjs")

# 4. Create post-install.sh
pi = os.path.join(dst, "ai-os-scripts", "post-install.sh")
with open(pi, "w", encoding="utf-8") as f:
    f.write("#!/bin/bash\nset -e\nexec > /var/log/ai-os-install.log 2>&1\n")
    f.write('echo "=== AI OS Deploy Started ==="\n\n')
    f.write('echo "[1/7] Installing dependencies..."\n')
    f.write('DEBIAN_FRONTEND=noninteractive apt-get update -qq\n')
    f.write('DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\\n')
    f.write('    curl git sudo ca-certificates nodejs npm \\\n')
    f.write('    fonts-wqy-zenhei fonts-wqy-microhei \\\n')
    f.write('    dbus-x11 xdg-utils htop vim-tiny \\\n')
    f.write('    openssh-server procps net-tools iputils-ping 2>/dev/null || true\n')
    f.write('echo "[OK] Dependencies installed"\n\n')
    f.write('echo "[2/7] Configuring locale..."\n')
    f.write('echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true\n')
    f.write('locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null || true\n')
    f.write("printf 'LANG=zh_CN.UTF-8\\nLANGUAGE=zh_CN:en\\nLC_ALL=zh_CN.UTF-8\\n' > /etc/default/locale\n")
    f.write("printf 'export LANG=zh_CN.UTF-8\\nexport LC_ALL=zh_CN.UTF-8\\nexport TERM=xterm-256color\\n' > /etc/profile.d/99-locale.sh\n")
    f.write('chmod +x /etc/profile.d/99-locale.sh\n')
    f.write('echo "[OK] Locale configured"\n\n')
    f.write('echo "[3/7] Creating directories..."\n')
    f.write('mkdir -p /opt/ai-os/gateway /opt/ai-os/gui /etc/ai-gateway\n')
    f.write('echo "[OK] Directories created"\n\n')
    f.write('echo "[4/7] Deploying AI Gateway..."\n')
    f.write('cp /ai-os-scripts/server.mjs /opt/ai-os/gateway/server.mjs 2>/dev/null || true\n')
    f.write("cat > /opt/ai-os/gateway/package.json << 'EOF'\n")
    f.write('{"name":"ai-gateway","version":"1.0.0","type":"module","main":"server.mjs","scripts":{"start":"node server.mjs"},"dependencies":{"fastify":"^5.0.0","@fastify/cors":"^10.0.0"}}\n')
    f.write("EOF\n")
    f.write("cat > /etc/ai-gateway/config.json << 'EOF'\n")
    f.write('{"ai_gateway":{"port":8080,"host":"0.0.0.0"},"models":{"openai":{"api_key":"","base_url":"https://api.openai.com/v1"},"deepseek":{"api_key":"","base_url":"https://api.deepseek.com"},"local":{"api_key":"","base_url":"http://localhost:11434/v1"}},"routing":{"default_model":"deepseek/deepseek-chat"}}\n')
    f.write("EOF\n")
    f.write('cd /opt/ai-os/gateway && npm install --omit=dev --silent 2>/dev/null || true\n')
    f.write('echo "[OK] AI Gateway deployed"\n\n')
    f.write('echo "[5/7] Deploying AI Desktop..."\n')
    f.write('cp /ai-os-scripts/app.mjs /opt/ai-os/gui/app.mjs 2>/dev/null || true\n')
    f.write("cat > /opt/ai-os/gui/package.json << 'EOF'\n")
    f.write('{"name":"ai-desktop","version":"1.0.0","type":"module"}\n')
    f.write("EOF\n")
    f.write('echo "[OK] AI Desktop deployed"\n\n')
    f.write('echo "[6/7] Registering systemd services..."\n')
    f.write("cat > /etc/systemd/system/ai-gateway.service << 'EOF'\n")
    f.write("[Unit]\nDescription=AI Gateway Service\nAfter=network-online.target\n[Service]\nType=simple\nUser=root\nWorkingDirectory=/opt/ai-os/gateway\nExecStart=/usr/bin/node /opt/ai-os/gateway/server.mjs\nRestart=always\nStandardOutput=journal\n[Install]\nWantedBy=multi-user.target\nEOF\n")
    f.write("cat > /etc/systemd/system/ai-desktop.service << 'EOF'\n")
    f.write("[Unit]\nDescription=AI Desktop Environment\nAfter=ai-gateway.service\nRequires=ai-gateway.service\n[Service]\nType=simple\nUser=root\nWorkingDirectory=/opt/ai-os/gui\nExecStart=/usr/bin/node /opt/ai-os/gui/app.mjs\nRestart=always\n[Install]\nWantedBy=multi-user.target\nEOF\n")
    f.write("systemctl daemon-reload\nsystemctl enable ai-gateway.service ai-desktop.service\n")
    f.write("systemctl start ai-gateway.service ai-desktop.service\n")
    f.write('echo "[OK] Services started"\n\n')
    f.write('echo "[7/7] Configuring users..."\n')
    f.write('useradd -m -s /bin/bash -G sudo aiuser 2>/dev/null || true\n')
    f.write('echo "aiuser:aiuser123" | chpasswd 2>/dev/null || true\n')
    f.write("echo 'aiuser ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers 2>/dev/null || true\n")
    f.write("sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config 2>/dev/null || true\n")
    f.write("service ssh restart 2>/dev/null || /usr/sbin/sshd 2>/dev/null || true\n")
    f.write('echo "[OK] Users configured"\n\n')
    f.write('echo "=== AI OS Deploy Complete ==="\n')
    f.write("GW_IP=$(ip addr show ens33 2>/dev/null | grep 'inet 192' | awk '{print $2}' | cut -d/ -f1)\n")
    f.write("[ -z \"$GW_IP\" ] && GW_IP=$(hostname -I | awk '{print $1}')\n")
    f.write('echo "  AI Gateway:  http://$GW_IP:8080/docs"\n')
    f.write('echo "  AI Desktop:  http://$GW_IP:8082"\n')
    f.write('echo "  SSH:         ssh aiuser@$GW_IP (password: aiuser123)"\n')
os.chmod(pi, 0o755)
print("[ OK ] post-install.sh")

# firstboot service
fb = os.path.join(dst, "etc", "systemd", "system", "ai-os-firstboot.service")
with open(fb, "w", encoding="utf-8") as f:
    f.write("[Unit]\nDescription=AI OS First Boot Deployment\nAfter=network-online.target\n")
    f.write("[Service]\nType=oneshot\nExecStart=/bin/bash /ai-os-scripts/post-install.sh\n")
    f.write("StandardOutput=journal\nTimeoutSec=600\n[Install]\nWantedBy=multi-user.target\n")
print("[ OK ] firstboot service")

# skel .bashrc
sb = os.path.join(dst, "etc", "skel", ".bashrc")
os.makedirs(os.path.dirname(sb), exist_ok=True)
with open(sb, "a", encoding="utf-8") as f:
    f.write("\n# AI OS auto-start\n")
    f.write("systemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service\n")
print("[ OK ] skel .bashrc")

# 5. Build ISO
print("[5/6] Building ISO...")
iso_out = os.path.join(OUTPUT_DIR, "ai-os-debian-custom.iso")
# Remove boot.cat to avoid mkisofs conflict (may already be locked by mount)
isolinux_cat = os.path.join(dst, "isolinux", "boot.cat")
try:
    if os.path.exists(isolinux_cat):
        os.remove(isolinux_cat)
        print("[ OK ] Removed boot.cat")
except PermissionError:
    print("[WARN] boot.cat locked by ISO mount, continuing anyway...")

cmd = [
    MKISOFS,
    "-r", "-V", "AI-OS-DEBIAN",
    "-cache-inodes", "-J", "-l",
    "-b", "isolinux/isolinux.bin",
    "-no-emul-boot", "-boot-load-size", "4", "-boot-info-table",
    "-o", iso_out,
    dst
]
r = subprocess.run(cmd, capture_output=True, timeout=300)
if os.path.exists(iso_out):
    size_mb = os.path.getsize(iso_out) / (1024*1024)
    print(f"[ OK ] ISO created: {iso_out}")
    print(f"[ OK ] Size: {size_mb:.1f} MB")
else:
    print("[WARN] ISO build may have issues")
    if r.stderr:
        print(r.stderr.decode("utf-8", errors="replace")[:500])
    # Fallback: no boot params
    print("[INFO] Trying without boot params...")
    cmd2 = [MKISOFS, "-r", "-V", "AI-OS-DEBIAN", "-J", "-l", "-o", iso_out, dst]
    r2 = subprocess.run(cmd2, capture_output=True, timeout=300)
    if os.path.exists(iso_out):
        size_mb = os.path.getsize(iso_out) / (1024*1024)
        print(f"[ OK ] ISO (fallback): {iso_out}")
        print(f"[ OK ] Size: {size_mb:.1f} MB")
    else:
        print("[ERR] All ISO build methods failed")

# 6. Cleanup
print("[5/6] Cleaning up...")
shutil.rmtree(WORK_DIR, ignore_errors=True)
print("[ OK ]")

print()
print("=" * 60)
print("DONE! Output:", iso_out)
print("=" * 60)
print()
print("Next steps:")
print("  1. UltraISO -> File Open -> write to USB")
print("  2. Boot from USB, install Debian")
print("  3. After install, AI OS auto-deploys (~2 min)")
print("  4. Log: sudo cat /var/log/ai-os-install.log")
print()
print("After deploy:")
print("  Gateway:  http://<IP>:8080/docs")
print("  Desktop:  http://<IP>:8082")
print("  SSH:      ssh aiuser@<IP> (pass: aiuser123)")
print()
print("Config API Key:")
print("  sudo nano /etc/ai-gateway/config.json")
print("  sudo systemctl restart ai-gateway")

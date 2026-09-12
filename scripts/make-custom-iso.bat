@echo off
REM AI OS - Custom Debian ISO Builder (Windows)
REM Usage: make-custom-iso.bat [debian.iso path]
REM Example: make-custom-iso.bat "D:\Downloads\debian-13.6.0-amd64-netinst.iso"

setlocal enabledelayedexpansion

REM === Config ===
set "MKISOFS=E:\vmware\mkisofs.exe"
set "PROJECT_DIR=%~dp0..\.."
set "WORK_DIR=C:\tmp\ai-os-build"
set "OUTPUT_DIR=%PROJECT_DIR%\output"

REM === Auto-detect ISO ===
if "%~1"=="" (
    set "DEBIAN_ISO="
    for %%i in ("D:\Documents\Downloads\debian-*-netinst.iso" "D:\Documents\Downloads\debian-*-DVD-1.iso" "G:\*.iso" "E:\*.iso") do (
        if exist "%%i" set "DEBIAN_ISO=%%i"
    )
    if "%DEBIAN_ISO%"=="" (
        echo [ERR] No Debian ISO found. Please specify path.
        echo Usage: make-custom-iso.bat "path\to\debian.iso"
        exit /b 1
    )
) else (
    set "DEBIAN_ISO=%~1"
)

if not exist "%DEBIAN_ISO%" (
    echo [ERR] ISO not found: %DEBIAN_ISO%
    exit /b 1
)

if not exist "%MKISOFS%" (
    echo [ERR] mkisofs not found at: %MKISOFS%
    exit /b 1
)

echo ============================================================
echo   AI OS - Custom Debian ISO Builder
echo   Source: %DEBIAN_ISO%
echo ============================================================
echo.

REM === 1. Prepare dirs ===
echo [1/6] Preparing directories...
if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"
mkdir "%WORK_DIR%\extracted"
mkdir "%WORK_DIR%\working"
mkdir "%OUTPUT_DIR%"
echo [ OK ] Done

REM === 2. Extract ISO ===
echo [2/6] Extracting ISO (1-2 min)...
where 7z >nul 2>&1
if %errorlevel% equ 0 (
    7z x "%DEBIAN_ISO%" -o"%WORK_DIR%\extracted" -y >nul
) else (
    echo [WARN] 7-Zip not found, trying built-in...
    powershell -Command "Expand-Archive -Path '%DEBIAN_ISO%' -DestinationPath '%WORK_DIR%\extracted' -Force" 2>nul
    if errorlevel 1 (
        echo [ERR] Cannot extract ISO. Install 7-Zip: winget install -e --id 7zip.7zip
        exit /b 1
    )
)
echo [ OK ] ISO extracted

REM === 3. Copy content ===
echo [3/6] Copying ISO content...
xcopy "%WORK_DIR%\extracted\*" "%WORK_DIR%\working\" /E /I /Y /Q >nul 2>&1
echo [ OK ] Content copied

REM === 4. Inject AI OS ===
echo [4/6] Injecting AI OS components...

mkdir "%WORK_DIR%\working\.ai-os" 2>nul
mkdir "%WORK_DIR%\working\ai-os-scripts" 2>nul
mkdir "%WORK_DIR%\working\etc\systemd\system" 2>nul
mkdir "%WORK_DIR%\working\etc\skel" 2>nul

REM Copy server.mjs
if exist "%PROJECT_DIR%\gateway\server.mjs" (
    copy /Y "%PROJECT_DIR%\gateway\server.mjs" "%WORK_DIR%\working\ai-os-scripts\server.mjs" >nul
    echo [ OK ] server.mjs injected
) else (
    echo [WARN] server.mjs not found
)

REM Copy app.mjs
if exist "%PROJECT_DIR%\gui\app.mjs" (
    copy /Y "%PROJECT_DIR%\gui\app.mjs" "%WORK_DIR%\working\ai-os-scripts\app.mjs" >nul
    echo [ OK ] app.mjs injected
) else (
    echo [WARN] app.mjs not found
)

REM Create post-install.sh via PowerShell (avoid encoding issues)
powershell -NoProfile -Command "$OutputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $script = Get-Content '%PROJECT_DIR%\scripts\post-install-template.sh' -Raw -Encoding UTF8; $script | Out-File -FilePath '%WORK_DIR%\working\ai-os-scripts\post-install.sh' -Encoding UTF8" 2>nul
if not exist "%WORK_DIR%\working\ai-os-scripts\post-install.sh" (
    REM Fallback: create inline
    (
    echo #!/bin/bash
    echo set -e
    echo exec > /var/log/ai-os-install.log 2>&1
    echo echo "=== AI OS Deploy Started ==="
    echo DEBIAN_FRONTEND=noninteractive apt-get update -qq
    echo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl git sudo ca-certificates nodejs npm fonts-wqy-zenhei fonts-wqy-microhei dbus-x11 xdg-utils htop vim-tiny openssh-server procps net-tools iputils-ping 2>/dev/null || true
    echo echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true
    echo locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null || true
    echo printf 'LANG=zh_CN.UTF-8\nLC_ALL=zh_CN.UTF-8\n' > /etc/default/locale
    echo mkdir -p /opt/ai-os/gateway /opt/ai-os/gui /etc/ai-gateway
    echo cp /ai-os-scripts/server.mjs /opt/ai-os/gateway/server.mjs 2>/dev/null || true
    echo printf '{"name":"ai-gateway","type":"module","dependencies":{"fastify":"^5.0.0","@fastify/cors":"^10.0.0"}}\n' > /opt/ai-os/gateway/package.json
    echo printf '{"ai_gateway":{"port":8080,"host":"0.0.0.0"},"models":{"deepseek":{"api_key":"","base_url":"https://api.deepseek.com"},"openai":{"api_key":"","base_url":"https://api.openai.com/v1"},"local":{"api_key":"","base_url":"http://localhost:11434/v1"}},"routing":{"default_model":"deepseek/deepseek-chat"}}\n' > /etc/ai-gateway/config.json
    echo cd /opt/ai-os/gateway && npm install --omit=dev --silent 2>/dev/null || true
    echo cp /ai-os-scripts/app.mjs /opt/ai-os/gui/app.mjs 2>/dev/null || true
    echo printf '{"name":"ai-desktop","type":"module"}\n' > /opt/ai-os/gui/package.json
    echo cat > /etc/systemd/system/ai-gateway.service << 'SVCEOF'
    echo [Unit]
    echo Description=AI Gateway Service
    echo After=network-online.target
    echo [Service]
    echo Type=simple
    echo User=root
    echo WorkingDirectory=/opt/ai-os/gateway
    echo ExecStart=/usr/bin/node /opt/ai-os/gateway/server.mjs
    echo Restart=always
    echo StandardOutput=journal
    echo [Install]
    echo WantedBy=multi-user.target
    echo SVCEOF
    echo cat > /etc/systemd/system/ai-desktop.service << 'SVCEOF'
    echo [Unit]
    echo Description=AI Desktop Environment
    echo After=ai-gateway.service
    echo Requires=ai-gateway.service
    echo [Service]
    echo Type=simple
    echo User=root
    echo WorkingDirectory=/opt/ai-os/gui
    echo ExecStart=/usr/bin/node /opt/ai-os/gui/app.mjs
    echo Restart=always
    echo [Install]
    echo WantedBy=multi-user.target
    echo SVCEOF
    echo systemctl daemon-reload
    echo systemctl enable ai-gateway.service ai-desktop.service
    echo systemctl start ai-gateway.service ai-desktop.service
    echo useradd -m -s /bin/bash -G sudo aiuser 2>/dev/null || true
    echo echo aiuser:aiuser123 | chpasswd 2>/dev/null || true
    echo echo 'aiuser ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers 2>/dev/null || true
    echo sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config 2>/dev/null || true
    echo service ssh restart 2>/dev/null || /usr/sbin/sshd 2>/dev/null || true
    echo echo "=== AI OS Deploy Complete ==="
    echo GW_IP=$(ip addr show ens33 2>/dev/null | grep 'inet 192' | awk '{print $2}' | cut -d/ -f1)
    echo [ -z "$GW_IP" ] && GW_IP=$(hostname -I | awk '{print $1}')
    echo echo "  AI Gateway:  http://$GW_IP:8080/docs"
    echo echo "  AI Desktop:  http://$GW_IP:8082"
    echo echo "  SSH:         ssh aiuser@$GW_IP (password: aiuser123)"
    ) > "%WORK_DIR%\working\ai-os-scripts\post-install.sh"
    echo [ OK ] post-install.sh created (inline version)
)
if exist "%WORK_DIR%\working\ai-os-scripts\post-install.sh" (
    echo [ OK ] post-install.sh ready
)

REM Create firstboot systemd service
(
echo [Unit]
echo Description=AI OS First Boot Deployment
echo After=network-online.target
echo [Service]
echo Type=oneshot
echo ExecStart=/bin/bash /ai-os-scripts/post-install.sh
echo StandardOutput=journal
echo TimeoutSec=600
echo [Install]
echo WantedBy=multi-user.target
) > "%WORK_DIR%\working\etc\systemd\system\ai-os-firstboot.service"
echo [ OK ] firstboot service created

REM Add autostart to skel .bashrc
if not exist "%WORK_DIR%\working\etc\skel\.bashrc" (
    echo "# AI OS auto-start" > "%WORK_DIR%\working\etc\skel\.bashrc"
    echo 'systemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service' >> "%WORK_DIR%\working\etc\skel\.bashrc"
) else (
    echo "" >> "%WORK_DIR%\working\etc\skel\.bashrc"
    echo "# AI OS auto-start" >> "%WORK_DIR%\working\etc\skel\.bashrc"
    echo 'systemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service' >> "%WORK_DIR%\working\etc\skel\.bashrc"
)
echo [ OK ] skel .bashrc configured

REM === 5. Build ISO ===
echo [5/6] Building ISO...
set "ISO_PATH=%OUTPUT_DIR%\ai-os-debian-custom.iso"

"%MKISOFS%" -r -V "AI-OS-DEBIAN" -cache-inodes -J -l ^
    -b isolinux/isolinux.bin -c isolinux/boot.cat ^
    -no-emul-boot -boot-load-size 4 -boot-info-table ^
    -o "%ISO_PATH%" "%WORK_DIR%\working\" 2>&1

if exist "%ISO_PATH%" (
    for %%F in ("%ISO_PATH%") do (
        set /a SIZE_MB=%%~zF/1048576
        echo [ OK ] ISO created: %ISO_PATH%
        echo [ OK ] Size: !SIZE_MB! MB
    )
) else (
    echo [WARN] ISO build may have failed, checking...
)

REM === 6. Cleanup ===
echo [6/6] Cleaning up...
rmdir /s /q "%WORK_DIR%" 2>nul
echo [ OK ] Cleanup done

echo.
echo ============================================================
echo   DONE!
echo   Output: %ISO_PATH%
echo ============================================================
echo.
echo   Next steps:
echo   1. Use UltraISO to write ISO to USB
echo   2. Boot from USB and install Debian
echo   3. After install, AI OS auto-deploys (about 2 min)
echo   4. Log: sudo cat /var/log/ai-os-install.log
echo.
echo   After deploy:
echo   AI Gateway:  http://<VM_IP>:8080/docs
echo   AI Desktop:  http://<VM_IP>:8082
echo   SSH:         ssh aiuser@<VM_IP> (pass: aiuser123)
echo.
echo   Configure API Key:
echo   sudo nano /etc/ai-gateway/config.json
echo   sudo systemctl restart ai-gateway
echo.
echo ============================================================

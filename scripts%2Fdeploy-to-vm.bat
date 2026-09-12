@echo off
REM AI OS - 复制项目到 Debian VM 并部署
REM 使用说明：修改下面的 VM_IP 为你的 VM 内网 IP

set VM_IP=192.168.3.4
set VM_USER=root
set PROJECT_DIR=%~dp0..

echo ==========================================
echo   AI OS - Deploy to VM
echo ==========================================
echo.
echo   Target VM: %VM_USER%@%VM_IP%
echo   Source:    %PROJECT_DIR%
echo.

REM 检查 SCP
where scp >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] scp not found
    echo Install Git for Windows: https://git-scm.com/download/win
    echo Then add to PATH and restart
    pause
    exit /b 1
)

echo [1/3] Copying project files...
scp -r "%PROJECT_DIR%\scripts" "%VM_USER%@%VM_IP%:/tmp/ai-os/" 2>nul
if %errorlevel% neq 0 (
    echo   [WARN] SCP failed, trying alternative...
    echo   Please manually copy the following to the VM:
    echo     %PROJECT_DIR%\scripts\deploy.sh
    echo     %PROJECT_DIR%\scripts\ai-gateway.service
    echo     %PROJECT_DIR%\scripts\ai-desktop.service
)

echo.
echo [2/3] Connecting to VM...
echo   SSH into the VM and run:
echo     sudo bash /tmp/ai-os/deploy.sh
echo.
echo   Common VM IPs to try:
echo     192.168.3.4     (VMware NAT)
echo     192.168.81.1    (VMware NAT #2)
echo     192.168.247.1   (VMware NAT #3)
echo.

echo [3/3] Alternative: Use VMware shared folder
echo.
echo   If SCP fails, you can:
echo   1. In VMware: VM -> Settings -> Options -> Shared Folders
echo   2. Enable shared folders pointing to: %PROJECT_DIR%
echo   3. In VM: mount -t vmhgfs-fuse .host:/ /mnt/hgfs
echo   4. Run: sudo bash /mnt/hgfs/scripts/deploy.sh
echo.

echo ==========================================
echo   After deployment, access:
echo ==========================================
echo   AI Gateway:  http://%VM_IP%:8080
echo   AI Desktop:  http://%VM_IP%:8082
echo.
pause

@echo off
REM ============================================================
REM AI OS - Windows 部署指南
REM 此脚本提供操作指引，不直接修改任何系统
REM ============================================================

echo.
echo ============================================================
echo   AI OS - 部署指南
echo ============================================================
echo.

echo [当前环境检测]
echo.

REM 检测 Python
python --version 2>nul
if %errorlevel% equ 0 (
    echo [OK] Python 可用
) else (
    echo [INFO] Python 不可用（不影响 Linux VM 部署）
)

REM 检测 Node.js
node --version 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js: %node_ver%
) else (
    echo [INFO] Node.js 未安装
)

REM 检测 WSL
wsl --list 2>nul >nul
if %errorlevel% equ 0 (
    echo [INFO] WSL 已安装
) else (
    echo [INFO] WSL 未安装（无需使用）
)

REM 检测 VMware
where vmware 2>nul >nul
if %errorlevel% equ 0 (
    echo [OK] VMware 已安装
) else (
    echo [INFO] VMware 命令未找到
)

echo.
echo ============================================================
echo   部署步骤
echo ============================================================
echo.
echo 方法一: SSH 直接部署（推荐）
echo ----------------------------------------------------------
echo.
echo  1. 确认 VM IP 地址:
echo       在 VMware 中查看: 编辑 -> 虚拟网络编辑器 -> NAT 设置
echo       或 SSH 进 VM 执行: ip addr show
echo.
echo  2. 复制部署脚本到 VM:
echo.
echo     PowerShell:
echo       scp scripts/deploy.sh root@<VM_IP>:/tmp/
echo       scp scripts/verify.sh root@<VM_IP>:/tmp/
echo.
echo     或手动复制到 /tmp/deploy.sh
echo.
echo  3. 在 VM 内执行部署:
echo       ssh root@<VM_IP>
echo       sudo bash /tmp/deploy.sh
echo.
echo  4. 验证部署:
echo       sudo bash /tmp/verify.sh
echo.

echo.
echo 方法二: VMware 共享文件夹
echo ----------------------------------------------------------
echo.
echo  1. VMware 菜单: 虚拟机 -> 设置 -> 选项 -> 共享文件夹
echo  2. 选择"始终启用"，添加项目目录:
echo       %~dp0..
echo  3. 启动 VM，在 VM 内执行:
echo       sudo bash /mnt/hgfs/ai-os/scripts/deploy.sh
echo.

echo.
echo 方法三: 手动复制粘贴（最慢但最可靠）
echo ----------------------------------------------------------
echo.
echo  1. 打开 scripts/deploy.sh
echo  2. 全选复制内容
echo  3. SSH 进 VM，执行:
echo       sudo nano /tmp/deploy.sh
echo       # 粘贴内容，Ctrl+O 保存，Ctrl+X 退出
echo       sudo bash /tmp/deploy.sh
echo.

echo ============================================================
echo   部署后访问地址
echo ============================================================
echo.
echo   AI Gateway API:  http://<VM_IP>:8080
echo   API 文档:        http://<VM_IP>:8080/docs
echo   AI Desktop:      http://<VM_IP>:8082
echo.
echo   登录信息:
echo     用户名: aiuser
echo     密码:   aiuser123
echo.
echo ============================================================
echo   配置 API Key
echo ============================================================
echo.
echo  1. SSH 进 VM: ssh root@<VM_IP>
echo  2. 编辑配置: sudo nano /etc/ai-gateway/config.json
echo  3. 在 "deepseek" 或 "openai" 段填入 api_key
echo  4. 重启服务: sudo systemctl restart ai-gateway
echo  5. 测试: curl http://localhost:8080/health
echo.
echo ============================================================

// ============================================================
// AI OS WebUI - 桌面系统（任务栏 / 窗口管理器 / 开始菜单）
// ============================================================

const DESKTOP = {
    windows: new Map(),
    zIndex: 100,
    winIdCounter: 0,
    activeWindow: null,

    init() {
        this._createTaskbar();
        this._createDesktopIcons();
        this._updateClock();
        setInterval(() => this._updateClock(), 1000);
        document.addEventListener("mousedown", e => this._onMouseDown(e));
        document.addEventListener("keydown", e => this._onKeyDown(e));
        // 活跃指示器点击 → 打开设置
        const activeInd = () => document.getElementById("active-indicator");
        setTimeout(() => {
            const el = activeInd();
            if (el) el.addEventListener("click", () => this.openWindow("settings", "设置", 520, 520));
        }, 100);
    },

    // ─── 时钟 ────────────────────────────────────────────────
    _updateClock() {
        const el = document.getElementById("clock");
        if (!el) return;
        const now = new Date();
        const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        const date = now.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
        el.textContent = `${date}  ${time}`;
    },

    // ─── 任务栏 ────────────────────────────────────────────────
    _createTaskbar() {
        const tb = document.createElement("div");
        tb.id = "taskbar";
        tb.innerHTML = `
            <div id="start-btn" title="开始">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/>
                </svg>
            </div>
            <div id="taskbar-apps"></div>
            <div id="tray">
                <span id="tray-icons" title="系统托盘">
                    <span id="active-indicator" title="活跃模式" style="cursor:pointer;font-size:14px;opacity:0.3;">✦</span>
                </span>
                <span id="clock"></span>
            </div>
        `;
        document.body.appendChild(tb);

        document.getElementById("start-btn").addEventListener("click", () => this._toggleStartMenu());
        // 点击任务栏其他地方关闭开始菜单
        tb.addEventListener("mousedown", e => { if (e.target === tb || e.target.id === "taskbar-apps") this._closeStartMenu(); });
    },

    // ─── 开始菜单 ────────────────────────────────────────────────
    _startMenuOpen: false,
    _toggleStartMenu() {
        this._startMenuOpen = !this._startMenuOpen;
        let menu = document.getElementById("start-menu");
        if (!menu) {
            menu = document.createElement("div");
            menu.id = "start-menu";
            menu.innerHTML = `
                <div class="start-header">
                    <div class="start-user">
                        <div class="start-avatar">S</div>
                        <div>
                            <div class="start-username">Sensei</div>
                            <div class="start-host">shittimchest</div>
                        </div>
                    </div>
                </div>
                <div class="start-apps">
                    <div class="start-app" data-app="terminal" title="终端">
                        <span class="app-icon term">⌘</span>
                        <span>终端</span>
                    </div>
                    <div class="start-app" data-app="files" title="文件">
                        <span class="app-icon files">📁</span>
                        <span>文件管理器</span>
                    </div>
                    <div class="start-app" data-app="settings" title="设置">
                        <span class="app-icon settings">⚙</span>
                        <span>设置</span>
                    </div>
                    <div class="start-app" data-app="about" title="关于">
                        <span class="app-icon about">✦</span>
                        <span>关于系统</span>
                    </div>
                </div>
                <div class="start-footer">
                    <div class="start-power" id="start-power">关机</div>
                </div>
            `;
            document.body.appendChild(menu);
            menu.querySelectorAll(".start-app").forEach(el => {
                el.addEventListener("click", () => {
                    this._closeStartMenu();
                    this._launchApp(el.dataset.app);
                });
            });
            document.getElementById("start-power").addEventListener("click", () => {
                this._closeStartMenu();
                if (confirm("确定要关机吗？")) window.close();
            });
        }
        menu.classList.toggle("open", this._startMenuOpen);
    },
    _closeStartMenu() {
        this._startMenuOpen = false;
        const m = document.getElementById("start-menu");
        if (m) m.classList.remove("open");
    },
    _launchApp(name) {
        switch (name) {
            case "terminal": this.openWindow("terminal", "终端", 700, 480); break;
            case "files": this.openWindow("files", "文件管理器", 700, 480); break;
            case "settings": this.openWindow("settings", "设置", 520, 520); break;
            case "about": this.openWindow("about", "关于什亭之匣", 400, 300); break;
        }
    },

    // ─── 桌面图标 ────────────────────────────────────────────────
    _createDesktopIcons() {
        const container = document.getElementById("desktop-icons");
        if (!container) return;
        const icons = [
            { name: "终端", icon: "⌘", app: "terminal" },
            { name: "文件", icon: "📁", app: "files" },
            { name: "设置", icon: "⚙", app: "settings" },
        ];
        icons.forEach(ic => {
            const el = document.createElement("div");
            el.className = "desktop-icon";
            el.innerHTML = `<span class="desktop-icon-img">${ic.icon}</span><span class="desktop-icon-label">${ic.name}</span>`;
            el.addEventListener("dblclick", () => this._launchApp(ic.app));
            container.appendChild(el);
        });
    },

    // ─── 窗口管理 ────────────────────────────────────────────────
    openWindow(id, title, w, h) {
        // 关闭同名窗口
        const existing = Array.from(this.windows.values()).find(w => w.appId === id);
        if (existing) { existing.el.style.zIndex = ++this.zIndex; this._focusWindow(existing); return; }

        const win = document.createElement("div");
        win.className = "window";
        win.style.width = w + "px";
        win.style.height = h + "px";
        win.style.left = (window.innerWidth / 2 - w / 2) + "px";
        win.style.top = (window.innerHeight / 2 - h / 2 - 40) + "px";
        win.style.zIndex = ++this.zIndex;

        win.innerHTML = `
            <div class="win-titlebar" data-winid="${id}">
                <span class="win-title">${title}</span>
                <div class="win-controls">
                    <button class="win-min" title="最小化">─</button>
                    <button class="win-max" title="最大化">□</button>
                    <button class="win-close" title="关闭">×</button>
                </div>
            </div>
            <div class="win-body" id="win-body-${id}"></div>
        `;

        const winId = ++this.winIdCounter;
        win.dataset.winId = winId;
        win.dataset.appId = id;

        // 拖拽
        const titlebar = win.querySelector(".win-titlebar");
        let dragging = false, dx, dy;
        titlebar.addEventListener("mousedown", e => {
            if (e.target.classList.contains("win-min") || e.target.classList.contains("win-max") || e.target.classList.contains("win-close")) return;
            dragging = true;
            dx = e.clientX - win.offsetLeft;
            dy = e.clientY - win.offsetTop;
            this._focusWindow({ el: win });
        });
        document.addEventListener("mousemove", e => {
            if (!dragging) return;
            win.style.left = Math.max(0, e.clientX - dx) + "px";
            win.style.top = Math.max(0, e.clientY - dy) + "px";
        });
        document.addEventListener("mouseup", () => { dragging = false; });

        // 缩放
        let maximized = false, prevRect = null;
        win.querySelector(".win-max").addEventListener("click", () => {
            var tb = document.getElementById("taskbar");
            var tbH = tb ? tb.offsetHeight : 0;
            if (!maximized) {
                prevRect = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
                win.style.left = "0"; win.style.top = tbH + "px";
                win.style.width = "100vw"; win.style.height = "calc(100vh - " + tbH + "px)";
            } else {
                win.style.left = prevRect.left; win.style.top = prevRect.top;
                win.style.width = prevRect.width; win.style.height = prevRect.height;
            }
            maximized = !maximized;
        });
        win.querySelector(".win-close").addEventListener("click", () => this.closeWindow(id));
        win.querySelector(".win-min").addEventListener("click", () => {
            win.style.display = "none";
            const tbBtn = document.querySelector(`[data-winid="${winId}"]`);
            if (tbBtn) tbBtn.style.opacity = "0.4";
        });

        // 点击聚焦
        win.addEventListener("mousedown", () => { win.style.zIndex = ++this.zIndex; this._focusWindow({ el: win }); });

        document.body.appendChild(win);
        this.windows.set(winId, { el: win, appId: id, title, minimized: false });

        // 任务栏按钮
        this._addTaskbarBtn(winId, title, id);

        // 渲染应用内容
        this._renderAppContent(id, `win-body-${id}`);
    },

    closeWindow(id) {
        for (const [winId, w] of this.windows) {
            if (w.appId === id) {
                w.el.remove();
                this.windows.delete(winId);
                this._removeTaskbarBtn(winId);
                break;
            }
        }
    },

    _focusWindow(w) {
        if (w.el) { w.el.style.zIndex = ++this.zIndex; w.el.style.display = "block"; }
        for (const [, ww] of this.windows) {
            const btn = document.querySelector(`[data-tbid="${ww.el?.dataset.winId}"]`);
            if (btn) btn.style.background = ww.el === w.el ? "rgba(125,211,252,0.25)" : "";
        }
        this.activeWindow = w;
    },

    _addTaskbarBtn(winId, title, appId) {
        const bar = document.getElementById("taskbar-apps");
        if (!bar) return;
        const btn = document.createElement("div");
        btn.className = "tb-btn active";
        btn.dataset.tbid = winId;
        btn.title = title;
        btn.textContent = title.length > 12 ? title.slice(0, 12) + "…" : title;
        btn.addEventListener("click", () => {
            const w = this.windows.get(winId);
            if (!w) return;
            if (w.minimized) { w.minimized = false; w.el.style.display = "block"; w.el.style.zIndex = ++this.zIndex; }
            else if (this.activeWindow?.el === w.el) { w.minimized = true; w.el.style.display = "none"; }
            else { w.el.style.zIndex = ++this.zIndex; this._focusWindow(w); }
        });
        bar.appendChild(btn);
    },

    _removeTaskbarBtn(winId) {
        const btn = document.querySelector(`[data-tbid="${winId}"]`);
        if (btn) btn.remove();
    },

    _onKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === "Escape") {
            e.preventDefault();
            this._toggleStartMenu();
        }
        if (e.key === "Escape") this._closeStartMenu();
    },

    // ─── 应用内容渲染 ────────────────────────────────────────────
    _renderAppContent(appId, bodyId) {
        const body = document.getElementById(bodyId);
        if (!body) return;
        switch (appId) {
            case "terminal": Apps.terminal.render(body); break;
            case "files": Apps.files.render(body); break;
            case "settings": Apps.settings.render(body); break;
            case "about": Apps.about.render(body); break;
            case "welcome": Apps.welcome.render(body); break;
        }
    },

    _onMouseDown(e) {
        const sm = document.getElementById("start-menu");
        const sb = document.getElementById("start-btn");
        if (sm?.classList.contains("open") && !sm.contains(e.target) && !sb.contains(e.target)) {
            this._closeStartMenu();
        }
    },
};

// ─── 应用模块 ────────────────────────────────────────────────
const Apps = {
    _api(url, opts = {}) {
        const def = { headers: { "Content-Type": "application/json" }, ...opts };
        if (def.body && typeof def.body === "object") def.body = JSON.stringify(def.body);
        return fetch("http://localhost:8080" + url, def).then(r => r.ok ? r.json() : { error: r.status });
    },

    terminal: {
        hist: [], histIdx: -1, cwd: "~", procId: 0,
        render(el) {
            el.innerHTML = `
                <div class="term-output" id="term-out"></div>
                <div class="term-input-line">
                    <span class="term-prompt">${this.cwd}&gt; </span>
                    <input type="text" class="term-input" autofocus spellcheck="false" />
                </div>
            `;
            const input = el.querySelector(".term-input");
            const out = el.querySelector("#term-out");
            this._print(out, "什亭之匣终端 v1.0 — 输入 help 查看命令");
            input.addEventListener("keydown", async e => {
                if (e.key === "Enter") {
                    const cmd = input.value.trim();
                    this._print(out, `${this.cwd}> ${cmd}`);
                    input.value = "";
                    if (!cmd) return;
                    this.hist.push(cmd); this.histIdx = this.hist.length;
                    try {
                        const r = await this._exec(cmd);
                        if (r.stdout) this._print(out, r.stdout);
                        if (r.stderr) this._print(out, r.stderr, "error");
                        if (r.error) this._print(out, `Error: ${r.error}`, "error");
                    } catch (err) { this._print(out, `执行失败: ${err.message}`, "error"); }
                } else if (e.key === "ArrowUp") {
                    if (this.histIdx > 0) { this.histIdx--; input.value = this.hist[this.histIdx]; }
                    e.preventDefault();
                } else if (e.key === "ArrowDown") {
                    if (this.histIdx < this.hist.length - 1) { this.histIdx++; input.value = this.hist[this.histIdx]; }
                    else { this.histIdx = this.hist.length; input.value = ""; }
                    e.preventDefault();
                }
                el.scrollTop = el.scrollHeight;
            });
            el.addEventListener("click", () => input.focus());
        },
        _print(el, text, cls) {
            const line = document.createElement("div");
            if (cls) line.className = cls;
            line.textContent = text;
            el.appendChild(line);
            el.scrollTop = el.scrollHeight;
        },
        async _exec(cmd) {
            // 解析内置命令
            const parts = cmd.split(/\s+/);
            const c = parts[0]?.toLowerCase();
            const args = parts.slice(1);
            if (c === "help") return { stdout: "可用命令: help, clear, ls, pwd, cat, echo, whoami, date, uname, hostname, uptime, neofetch, ps, df, free, top, apt, apt-get, systemctl, nano, vim, cd, exit" };
            if (c === "clear") { const el = document.getElementById("term-out"); if (el) el.innerHTML = ""; return {}; }
            if (c === "exit") { DESKTOP.closeWindow("terminal"); return {}; }
            if (c === "echo") return { stdout: args.join(" ") };
            if (c === "pwd") return { stdout: "/" };
            if (c === "whoami") return { stdout: "root" };
            if (c === "hostname") return { stdout: "shittimchest" };
            if (c === "date") return { stdout: new Date().toLocaleString("zh-CN") };
            if (c === "uname") return { stdout: "Linux shittimchest 6.1.0-amd64 x86_64 GNU/Linux" };
            if (c === "uptime") return { stdout: "up " + Math.floor(performance.now() / 60000) + " minutes" };
            if (c === "ps") return { stdout: "PID TTY          TIME CMD\n  1 ?        00:00:01 systemd\n  10 ?        00:00:00 bash\n 999 ?        00:00:00 node\n1234 ?        00:00:00 ps" };
            if (c === "df") return { stdout: "Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/sda1      51200000 12345678  36182654  26% /\ntmpfs             4096000       0   4096000   0% /tmp" };
            if (c === "free") return { stdout: "              total        used        free      shared  buff/cache   available\nMem:        8192000     2345678     4567890      123456     1278432     5678901\nSwap:       2097152           0     2097152" };
            if (c === "ls") {
                const target = args[0] || "/";
                const r = await this._api("/api/fs/list", { method: "POST", body: { path: target } });
                if (r.entries) return { stdout: r.entries.map(e => e.dir ? `\x1b[34m${e.name}/\x1b[0m` : e.name).join("  ") };
                return { stdout: r.error || "无法列出目录" };
            }
            if (c === "cat") {
                if (!args[0]) return { stderr: "用法: cat <file>" };
                const r = await this._api("/api/fs/read", { method: "POST", body: { path: args[0] } });
                if (r.content) return { stdout: r.content };
                return { stderr: r.error || "文件不存在" };
            }
            if (c === "neofetch") {
                return { stdout: `
       .---.        root@shittimchest
      /     \\       ────────────────
     |  O O  |      OS: Debian 13 (Trixie)
     |   ^   |      Host: Virtual Machine
     |  \\_/  |      Kernel: 6.1.0-amd64
      \\     /       Uptime: ${Math.floor(performance.now()/60000)} mins
       '---'        Shell: bash 5.2
                    Terminal: ai-terminal
                    CPU: Node.js Gateway
                    Memory: ${Math.round(performance.memory?.usedJSHeapSize/1024/1024||128)}MB / ${Math.round(performance.memory?.jsHeapSizeLimit/1024/1024||512)}MB
` };
            }
            // 执行系统命令
            const r = await this._api("/api/tools", {
                method: "POST",
                body: { name: "execute_command", arguments: { command: cmd } },
            });
            return { stdout: r.output, stderr: r.error || "" };
        },
    },

    files: {
        cwd: "/",
        history: ["/"],
        historyIdx: 0,
        render(el) {
            el.innerHTML = `
                <div class="fm-toolbar">
                    <button class="fm-nav" id="fm-back">←</button>
                    <button class="fm-nav" id="fm-up">↑</button>
                    <input class="fm-path" id="fm-path" value="/" />
                    <button class="fm-go" id="fm-go">转到</button>
                </div>
                <div class="fm-content" id="fm-content"></div>
            `;
            el.querySelector("#fm-go").addEventListener("click", () => this._navigate(el.querySelector("#fm-path").value));
            el.querySelector("#fm-path").addEventListener("keydown", e => { if (e.key === "Enter") this._navigate(e.target.value); });
            el.querySelector("#fm-back").addEventListener("click", () => { if (this.historyIdx > 0) { this.historyIdx--; this._navigate(this.history[this.historyIdx], el); } });
            el.querySelector("#fm-up").addEventListener("click", () => this._navigate("..", el));
            this._navigate("/", el);
        },
        async _navigate(path, el) {
            el = el || document.querySelector(".files .fm-content");
            if (!el) return;
            const resolved = path === ".." ? this.cwd.split("/").slice(0, -1).join("/") || "/" : path.startsWith("/") ? path : this.cwd + "/" + path;
            const r = await this._api("/api/fs/list", { method: "POST", body: { path: resolved } });
            if (r.error) { el.innerHTML = `<div class="fm-error">错误: ${r.error}</div>`; return; }
            this.cwd = resolved;
            this.history[this.historyIdx] = resolved;
            this.historyIdx++;
            this.history = this.history.slice(0, this.historyIdx);
            const pathInput = document.querySelector(".files .fm-path");
            if (pathInput) pathInput.value = resolved;
            const entries = r.entries || [];
            el.innerHTML = entries.length === 0 ? '<div class="fm-empty">目录为空</div>' : `
                <table class="fm-table">
                    <thead><tr><th>名称</th><th>大小</th><th>类型</th><th>修改时间</th></tr></thead>
                    <tbody>${entries.map(e => `
                        <tr class="fm-row ${e.dir ? "fm-dir" : "fm-file"}" data-name="${e.name}" data-dir="${e.dir}">
                            <td>${e.dir ? "📁" : "📄"} ${e.name}</td>
                            <td>${e.dir ? "-" : (e.size ? (e.size > 1024*1024 ? (e.size/1024/1024).toFixed(1)+"MB" : (e.size/1024).toFixed(1)+"KB") : "-")}</td>
                            <td>${e.dir ? "目录" : "文件"}</td>
                            <td>${e.mtime || "-"}</td>
                        </tr>
                    `).join("")}</tbody>
                </table>
            `;
            el.querySelectorAll(".fm-row").forEach(row => {
                row.addEventListener("dblclick", () => {
                    const name = row.dataset.name, isDir = row.dataset.dir === "true";
                    if (isDir) this._navigate(resolved === "/" ? "/" + name : resolved + "/" + name, el);
                    else this._showFile(resolved + "/" + name, el);
                });
            });
        },
        async _showFile(path, el) {
            const r = await this._api("/api/fs/read", { method: "POST", body: { path } });
            el.innerHTML = `<div class="fm-viewer"><button class="fm-back-btn" onclick="Apps.files._navigate('${path.split('/').slice(0,-1).join('/')||'/'}')">← 返回</button><pre class="fm-pre">${this._escapeHtml(r.content || "")}</pre></div>`;
        },
        _escapeHtml(t) {
            return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        },
    },

    settings: {
        activeStatus: null,
        _pollActive() {
            this._api("/api/active/status").then(s => {
                this.activeStatus = s;
                const el = document.getElementById("active-indicator");
                if (el) {
                    if (s.enabled && s.remaining > 0) {
                        el.textContent = `✦ ${s.remaining}`;
                        el.title = `活跃任务: ${s.executed}/${s.totalTasks} 已完成`;
                        el.style.opacity = "1";
                    } else {
                        el.textContent = "✦";
                        el.title = s.enabled ? "活跃模式已暂停（所有任务完成）" : "活跃模式未启用";
                        el.style.opacity = s.enabled ? "0.5" : "0.2";
                    }
                }
            }).catch(() => {});
        },
        render(el) {
            el.innerHTML = `
                <div class="settings-layout">
                    <div class="settings-nav">
                        <div class="s-nav-item active" data-tab="system">系统</div>
                        <div class="s-nav-item" data-tab="network">网络</div>
                        <div class="s-nav-item" data-tab="display">显示</div>
                        <div class="s-nav-item" data-tab="sound">声音</div>
                        <div class="s-nav-item" data-tab="users">用户</div>
                        <div class="s-nav-item" data-tab="time">时间</div>
                        <div class="s-nav-item" data-tab="ssh">SSH</div>
                        <div class="s-nav-item" data-tab="active">活跃模式</div>
                    </div>
                    <div class="settings-content" id="settings-body"></div>
                </div>
            `;
            el.querySelectorAll(".s-nav-item").forEach(item => {
                item.addEventListener("click", () => {
                    el.querySelectorAll(".s-nav-item").forEach(i => i.classList.remove("active"));
                    item.classList.add("active");
                    this._renderTab(el.querySelector("#settings-body"), item.dataset.tab);
                });
            });
            this._renderTab(el.querySelector("#settings-body"), "system");
            // 活跃模式轮询
            if (el.querySelector('[data-tab="active"]')) {
                this._pollActive();
                setInterval(() => this._pollActive(), 30000);
            }
        },
        async _renderTab(body, tab) {
            const s = await this._api("/api/system/info");
            const n = await this._api("/api/system/network");
            const a = await this._api("/api/active/status").catch(() => ({}));
            switch (tab) {
                case "system":
                    body.innerHTML = `
                        <div class="set-section">
                            <h3>系统信息</h3>
                            <div class="set-row"><span>主机名</span><span class="set-val">${s.hostname||"shittimchest"}</span></div>
                            <div class="set-row"><span>操作系统</span><span class="set-val">${s.os||"Debian 13"}</span></div>
                            <div class="set-row"><span>内核</span><span class="set-val">${s.kernel||"6.1.0-amd64"}</span></div>
                            <div class="set-row"><span>CPU</span><span class="set-val">${s.cpu||"Node.js Gateway"}</span></div>
                            <div class="set-row"><span>内存</span><span class="set-val">${s.memory||"8GB"}</span></div>
                            <div class="set-row"><span>运行时间</span><span class="set-val">${s.uptime||"-"}</span></div>
                        </div>
                    `; break;
                case "network":
                    body.innerHTML = `
                        <div class="set-section">
                            <h3>网络配置</h3>
                            ${(n.interfaces||[]).map(iface => `
                                <div class="set-row"><span>${iface.name}</span><span class="set-val">${iface.ip||"未获取"}</span><span class="set-val">${iface.mac||""}</span></div>
                            `).join("")}
                            <div class="set-row"><span>DNS</span><span class="set-val">${(n.dns||[]).join(", ")}</span></div>
                        </div>
                    `; break;
                case "display":
                    body.innerHTML = `
                        <div class="set-section">
                            <h3>显示设置</h3>
                            <div class="set-row"><span>分辨率</span><span class="set-val">${screen.width}×${screen.height}</span></div>
                            <div class="set-row"><span>颜色深度</span><span class="set-val">${screen.colorDepth}bit</span></div>
                            <div class="set-row"><span>像素比</span><span class="set-val">${window.devicePixelRatio}x</span></div>
                            <div class="set-row"><span>DPI</span><span class="set-val">${Math.round(window.devicePixelRatio*96)}</span></div>
                        </div>
                    `; break;
                case "sound":
                    body.innerHTML = `<div class="set-section"><h3>声音</h3><p class="set-empty">系统声音已静音（无音频硬件）</p></div>`; break;
                case "users":
                    body.innerHTML = `
                        <div class="set-section">
                            <h3>用户管理</h3>
                            <div class="set-row"><span>当前用户</span><span class="set-val">sensei</span></div>
                            <div class="set-row"><span>显示名称</span><span class="set-val">Sensei</span></div>
                            <div class="set-row"><span>Shell</span><span class="set-val">/bin/bash</span></div>
                            <div class="set-row"><span>角色</span><span class="set-val">sudo</span></div>
                        </div>
                    `; break;
                case "time":
                    body.innerHTML = `
                        <div class="set-section">
                            <h3>日期与时间</h3>
                            <div class="set-row"><span>时区</span><span class="set-val">Asia/Shanghai (CST)</span></div>
                            <div class="set-row"><span>当前时间</span><span class="set-val">${new Date().toLocaleString("zh-CN")}</span></div>
                            <div class="set-row"><span>自动同步</span><span class="set-val">启用 (NTP)</span></div>
                        </div>
                    `; break;
                case "ssh":
                    body.innerHTML = `
                        <div class="set-section">
                            <h3>SSH 远程访问</h3>
                            <div class="set-row"><span>状态</span><span class="set-val">✓ 已启用</span></div>
                            <div class="set-row"><span>端口</span><span class="set-val">22</span></div>
                            <div class="set-row"><span>允许 Root 登录</span><span class="set-val">是</span></div>
                            <div class="set-row"><span>密码认证</span><span class="set-val">启用</span></div>
                            <div class="set-row"><span>连接地址</span><span class="set-val ssh-ip">${n?.interfaces?.[0]?.ip || "192.168.1.100"}</span></div>
                        </div>
                    `; break;
                case "active":
                    const enabled = a.enabled;
                    const tasksHtml = (a.allTasks || []).map(t => `
                        <div class="set-row ${t.executed ? '' : 'active-pending'}">
                            <span>${t.time}</span>
                            <span class="set-val ${t.executed ? 'active-done' : 'active-wait'}">${t.executed ? '✓' : '○'}</span>
                            <span class="set-val active-activity">${(t.activity||'等待中').slice(0,40)}</span>
                        </div>
                    `).join('') || '<div class="set-empty">今日暂无任务</div>';
                    body.innerHTML = `
                        <div class="set-section">
                            <h3>✦ 活跃模式</h3>
                            <div class="set-row">
                                <span>状态</span>
                                <span class="set-val ${enabled ? 'active-on' : 'active-off'}">${enabled ? '✓ 运行中' : '○ 未启用'}</span>
                            </div>
                            <div class="set-row"><span>今日任务</span><span class="set-val">${a.totalTasks||0} 个（已完成 ${a.executed||0}）</span></div>
                            <div class="set-row"><span>下次执行</span><span class="set-val">${a.nextTask?.time || '-'}</span></div>
                            <div style="margin-top:12px;display:flex;gap:8px;">
                                <button class="active-btn" id="active-run-now" ${!enabled?'disabled':''}>立即执行</button>
                                <button class="active-btn" id="active-reschedule" ${!enabled?'disabled':''}>重新调度</button>
                            </div>
                            <div style="margin-top:16px;"><h3>今日任务列表</h3>${tasksHtml}</div>
                        </div>
                    `;
                    const runBtn = body.querySelector('#active-run-now');
                    const reschedBtn = body.querySelector('#active-reschedule');
                    if (runBtn) runBtn.addEventListener('click', async () => {
                        const r = await this._api('/api/active/run-now', { method: 'POST' });
                        if (r.ok) { this._renderTab(body, 'active'); this._pollActive(); }
                    });
                    if (reschedBtn) reschedBtn.addEventListener('click', async () => {
                        const r = await this._api('/api/active/schedule-today', { method: 'POST' });
                        if (r.ok) { this._renderTab(body, 'active'); this._pollActive(); }
                    });
                    break;
            }
        },
    },

    about: {
        render(el) {
            el.innerHTML = `
                <div style="padding:24px;text-align:center;">
                    <div style="font-size:48px;margin-bottom:12px;">✦</div>
                    <h2 style="color:#7dd3fc;margin-bottom:8px;">什亭之匣</h2>
                    <p style="color:#aaa;margin-bottom:4px;">AI OS v1.0 — 基于 Debian 13</p>
                    <p style="color:#888;font-size:12px;margin-bottom:20px;">融合 Spine 动画 · AI 记忆 · 工具调用</p>
                    <div style="text-align:left;background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;font-size:13px;color:#bbb;line-height:2;">
                        <div><b style="color:#7dd3fc;">主机名:</b> shittimchest</div>
                        <div><b style="color:#7dd3fc;">用户:</b> sensei</div>
                        <div><b style="color:#7dd3fc;">AI 网关:</b> http://localhost:8080</div>
                        <div><b style="color:#7dd3fc;">记忆存储:</b> /etc/ai-os/memory.json</div>
                        <div><b style="color:#7dd3fc;">语言:</b> zh_CN.UTF-8</div>
                    </div>
                </div>
            `;
        },
    },

    welcome: {
        render(el) {
            el.innerHTML = `
                <div style="padding:24px;text-align:center;">
                    <div style="font-size:36px;margin-bottom:8px;">✦</div>
                    <h2 style="color:#7dd3fc;margin-bottom:8px;">欢迎使用什亭之匣</h2>
                    <p style="color:#aaa;margin-bottom:20px;">AI 驱动的智能操作系统</p>
                    <div style="text-align:left;font-size:13px;color:#ccc;line-height:2;">
                        <p>• 点击左下角 <b>开始</b> 按钮打开应用菜单</p>
                        <p>• 双击桌面图标快速启动</p>
                        <p>• 使用 Ctrl+Esc 快捷键呼出开始菜单</p>
                        <p>• 窗口支持拖拽移动、最大化和关闭</p>
                    </div>
                </div>
            `;
        },
    },
};

// 挂载到全局
window.DESKTOP = DESKTOP;
window.Apps = Apps;

// 初始化
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("taskbar")) return; // 已初始化
    DESKTOP.init();
});

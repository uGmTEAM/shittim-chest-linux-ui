// ============================================================
// AI OS WebUI - 底部信息面板（标准格式，所有 HTML 通用）
// 提供 showBottomPanel / hideBottomPanel 两个函数
// ============================================================

(function () {
    "use strict";

    let panelEl = null;
    let bodyEl = null;
    let finished = false;
    let onDoneCallback = null;
    let keyHandler = null;
    let currentText = "";
    let typingTimer = null;

    // 创建面板 DOM（懒加载）
    function ensurePanel() {
        if (panelEl) return;

        panelEl = document.createElement("div");
        panelEl.className = "bottom-panel panel-hidden";

        panelEl.innerHTML = `
            <div class="bp-bg"></div>
            <div class="bp-line"></div>
            <div class="bp-header">
                <span class="bp-name" style="filter:drop-shadow(1px 1px 0 #1a202c) drop-shadow(-1px 1px 0 #1a202c) drop-shadow(1px -1px 0 #1a202c) drop-shadow(-1px -1px 0 #1a202c);"></span>
                <span class="bp-affil"></span>
            </div>
            <div class="bp-content">
                <div class="bp-body"></div>
            </div>
        `;

        bodyEl = panelEl.querySelector(".bp-body");
        document.body.appendChild(panelEl);
    }

    // 获取面板内部元素
    function getNameEl() { return panelEl && panelEl.querySelector(".bp-name"); }
    function getAffilEl() { return panelEl && panelEl.querySelector(".bp-affil"); }

    // ─── 响应式字体缩放 ────────────────────────────────────
    function scaleFonts() {
        var w = window.innerWidth;
        var base = Math.max(22, Math.min(32, w * 0.016));
        var nameSize = Math.max(28, Math.min(40, w * 0.019));
        var affilSize = Math.max(20, Math.min(30, w * 0.015));
        var bodyEl = panelEl && panelEl.querySelector(".bp-body");
        var nameEl = panelEl && panelEl.querySelector(".bp-name");
        var affilEl = panelEl && panelEl.querySelector(".bp-affil");
        var indEl = panelEl && panelEl.querySelector(".bp-indicator");
        if (bodyEl) bodyEl.style.fontSize = base + "px";
        if (nameEl) nameEl.style.fontSize = nameSize + "px";
        if (affilEl) affilEl.style.fontSize = affilSize + "px";
        if (indEl) indEl.style.fontSize = (base * 0.7) + "px";
    }
    window.addEventListener("resize", scaleFonts);

    // 清除之前的 Enter 监听
    function removeKeyHandler() {
        if (keyHandler) {
            window.removeEventListener("keydown", keyHandler);
            keyHandler = null;
        }
    }

    // ─── 显示面板 ──────────────────────────────────────────
    // options:
    //   name       - 人名（如 "什亭之匣"）
    //   affil      - 所属信息（如 "AI OS"）
    //   body       - 正文（支持逐字输出）
    //   speed      - 逐字输出速度 ms/字，默认 80
    //   delay      - 面板显示后等待 ms 再开始输出，默认 500
    //   onDone     - 输出完毕后的回调（点击或 Enter 均可触发）
    //   showDelay  - 面板弹出前的延迟 ms，默认 500
    // ────────────────────────────────────────────────────────
    window.showBottomPanel = function (options) {
        const opts = Object.assign({
            name: "什亭之匣",
            affil: "AI OS",
            body: "",
            speed: 60,
            delay: 500,
            onDone: null,
            showDelay: 500,
        }, options || {});
        console.log("[BP] showBottomPanel name=" + opts.name + " body='" + String(opts.body).slice(0,20) + "' autoAdvance=" + opts.autoAdvance);

        ensurePanel();
        removeKeyHandler();
        finished = false;
        onDoneCallback = opts.onDone || null;

        // 设置静态内容
        const nameEl = getNameEl();
        const affilEl = getAffilEl();
        const headerEl = panelEl && panelEl.querySelector(".bp-header");
        var hasName = opts.name && opts.name !== "无";
        var hasAffil = opts.affil && opts.affil !== "无";
        if (nameEl) nameEl.textContent = opts.name;
        if (affilEl) affilEl.textContent = opts.affil || "";
        if (headerEl) {
            headerEl.style.display = hasName ? "" : "none";
        }
        if (affilEl) {
            affilEl.style.display = hasAffil ? "" : "none";
        }
        // 响应式字体
        scaleFonts();

        // 先隐藏面板
        panelEl.classList.add("panel-hidden");
        bodyEl.textContent = "";

        // 设置点击跳转
        panelEl.style.pointerEvents = "auto";

        // 等待 showDelay 后显示面板
        setTimeout(function () {
            panelEl.classList.remove("panel-hidden");
            panelEl.classList.add("visible");

            // 再等待 delay 后开始逐字输出
            setTimeout(function () {
                startTypewriter(opts.body, opts.speed, opts.autoAdvance);
            }, opts.delay);
        }, opts.showDelay);
    };

    // ─── 逐字输出 ──────────────────────────────────────────
    function startTypewriter(text, speed, autoAdvance) {
        currentText = text;
        var i = 0;
        var cnPunct = { "，": true, "。": true, "？": true, "！": true };
        function tick() {
            if (i >= currentText.length) {
                finished = true;
                removeKeyHandler();
                if (panelEl) {
                    panelEl.removeEventListener("click", onPanelClick);
                    panelEl.addEventListener("click", onPanelClick);
                }
                keyHandler = function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        removeKeyHandler();
                        if (typeof onDoneCallback === "function") {
                            onDoneCallback();
                        }
                    }
                };
                window.addEventListener("keydown", keyHandler);
                if (autoAdvance && typeof onDoneCallback === "function") {
                    setTimeout(function() {
                        if (finished && typeof onDoneCallback === "function") {
                            onDoneCallback();
                        }
                    }, 800);
                }
                return;
            }
            i++;
            bodyEl.textContent = currentText.slice(0, i);
            var ch = currentText[i - 1];
            var delay = cnPunct[ch] ? 300 : speed;
            typingTimer = setTimeout(tick, delay);
        }
        // 打字过程中点击跳过
        if (panelEl) {
            panelEl.addEventListener("click", onPanelClick);
        }
        typingTimer = setTimeout(tick, speed);
    }

    // 点击面板回调：打字中点击直接显示全文并触发完成
    function onPanelClick() {
        if (bodyEl && !finished) {
            clearTimeout(typingTimer);
            bodyEl.textContent = currentText.slice(0);
            finished = true;
            if (panelEl) {
                panelEl.removeEventListener("click", onPanelClick);
            }
            removeKeyHandler();
            if (typeof onDoneCallback === "function") {
                onDoneCallback();
            }
            return;
        }
        if (finished && typeof onDoneCallback === "function") {
            if (panelEl) {
                panelEl.removeEventListener("click", onPanelClick);
            }
            removeKeyHandler();
            onDoneCallback();
        }
    }

    // ─── 隐藏面板 ──────────────────────────────────────────
    window.hideBottomPanel = function () {
        removeKeyHandler();
        if (panelEl) {
            panelEl.classList.add("panel-hidden");
            panelEl.classList.remove("visible");
            panelEl.removeEventListener("click", onPanelClick);
        }
        finished = false;
        onDoneCallback = null;
    };

    // ─── 切换文本（不隐藏面板，直接清屏并重新输出）───────────
    window.switchBottomPanelText = function (opts) {
        opts = Object.assign({ speed: 60, showDelay: 0, autoAdvance: false }, opts || {});
        ensurePanel();
        removeKeyHandler();
        finished = false;
        onDoneCallback = opts.onDone || null;
        var nameEl = getNameEl();
        var affilEl = getAffilEl();
        var headerEl = panelEl && panelEl.querySelector(".bp-header");
        var hasName = opts.name && opts.name !== "无";
        var hasAffil = opts.affil && opts.affil !== "无";
        if (nameEl) nameEl.textContent = opts.name;
        if (affilEl) affilEl.textContent = opts.affil || "";
        if (headerEl) headerEl.style.display = hasName ? "" : "none";
        if (affilEl) affilEl.style.display = hasAffil ? "" : "none";
        scaleFonts();
        // 保持可见状态，直接清屏开始新文本
        panelEl.classList.remove("panel-hidden");
        panelEl.classList.add("visible");
        clearTimeout(typingTimer);
        bodyEl.textContent = "";
        startTypewriter(opts.body, opts.speed, opts.autoAdvance);
    };

    // ─── 检查是否输出完毕 ─────────────────────────────────
    window.isBottomPanelFinished = function () {
        return finished;
    };

})();
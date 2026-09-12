// ============================================================
// AI OS WebUI - 什亭之匣 主逻辑（纯 Spine 渲染）
// ============================================================

const state = {
    currentCharacter: "arona",
    currentBackground: "day",
    gatewayUrl: "http://localhost:8080",
    showFPS: false,
    dialogQueue: [],
    isTyping: false,
    touchStartX: 0,
    touchStartY: 0,
    currentIdle: 0,
    isTouchPlaying: false,
    isFloorMode: false,
    isBlankBg: false,
    blankTimer: null,
    currentFace: null,
    setupAwaitingTouch: false,
    onTouchComplete: null,
    setupActive: false,
};

const BG_ANIMS = {
    day: {
        floor: "floor_00_R",
        idles: ["Idle_00", "Idle_01", "Idle_02", "Idle_03"],
    },
    night: {
        floor: "floor_00_R",
        idles: ["Idle_00", "Idle_01", "Idle_02", "Idle_03", "Idle_04"],
    },
};

const CHAR_NAMES = { arona: "阿罗娜", plana: "普拉娜" };

const charVideo = document.getElementById("char-video");
const dialogBox = document.getElementById("dialog-box");
const dialogText = document.getElementById("dialog-text");
const speakerName = document.getElementById("speaker-name");
const actionPanel = document.getElementById("action-panel");
const configPanel = document.getElementById("config-panel");
const loading = document.getElementById("loading");

// ─── 配置管理 ────────────────────────────────────────────
const CONFIG_KEY = "aios_config";

function loadConfig() {
    try {
        const saved = localStorage.getItem(CONFIG_KEY);
        if (saved) Object.assign(state, JSON.parse(saved));
    } catch (e) { console.warn("加载配置失败:", e); }
}

function saveConfig() {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify({
            currentCharacter: state.currentCharacter,
            currentBackground: state.currentBackground,
            gatewayUrl: state.gatewayUrl,
            showFPS: state.showFPS,
            currentFace: state.currentFace,
        }));
    } catch (e) { console.warn("保存配置失败:", e); }
}

// ─── Spine 动画控制 ─────────────────────────────────────
function getBgAnims() {
    return BG_ANIMS[state.currentBackground] || BG_ANIMS.day;
}

function playIdle() {
    const anims = getBgAnims();
    const rand = anims.idles[Math.floor(Math.random() * anims.idles.length)];
    state.currentIdle = rand;
    state.isTouchPlaying = false;
    state.isFloorMode = false;
    if (window.playSpineAnim) window.playSpineAnim(rand, true);
    console.log("playIdle:", rand, "(loop)");
}

function playTouch(type) {
    state.isTouchPlaying = true;
    state.isBlankBg = false;
    if (state.blankTimer) {
        clearTimeout(state.blankTimer);
        state.blankTimer = null;
    }
    if (window.showSpineCharacter) window.showSpineCharacter(false);
    const animName = window.getTouchAnim ? window.getTouchAnim("m") : "Idle_00_Touch_M";
    window.playSpineAnim(animName);
    console.log("playTouch:", animName);

    const touchDuration = 2000;
    const touchStart = Date.now();
    const checkTouchEnd = setInterval(() => {
        if (!state.isTouchPlaying) { clearInterval(checkTouchEnd); return; }
        const elapsed = Date.now() - touchStart;
        if (elapsed >= touchDuration) {
            clearInterval(checkTouchEnd);
            state.isTouchPlaying = false;
            state.isBlankBg = true;
            if (window.clearSpineAnimation) window.clearSpineAnimation();
            console.log("locked to dummy skeleton");
            if (window.loadSpineCharacter) {
                window.loadSpineCharacter(state.currentCharacter, function() {
                    if (window.showSpineCharacter) window.showSpineCharacter(true);
                    // 延迟播放动画，确保 SpinePlayer 构造函数内部先完成 setAnimation+setViewport
                    setTimeout(function() {
                        if (window.playSpineCharacterAnim) {
                            window.playSpineCharacterAnim("Idle_01", state.currentFace);
                        }
                        populateFaceOptions();
                        if (state.onTouchComplete) {
                            const cb = state.onTouchComplete;
                            state.onTouchComplete = null;
                            cb();
                        }
                    }, 0);
                });
            }
            state.blankTimer = setTimeout(() => {
                if (state.isBlankBg) {
                    state.isBlankBg = false;
                    state.blankTimer = null;
                    if (window.showSpineCharacter) window.showSpineCharacter(false);
                    playIdle();
                    console.log("blank timer expired, recovered to idle");
                }
            }, 300000);
        }
    }, 100);
}

function showFloor() {
    const anims = getBgAnims();
    state.isFloorMode = true;
    state.isTouchPlaying = false;
    if (anims.floor) {
        window.playSpineAnim(anims.floor);
    } else {
        playIdle();
    }
    console.log("showFloor");
}

function changeCharacter(name) {
    state.currentCharacter = name;
    saveConfig();
    playIdle();
}

// ─── 对话框 ──────────────────────────────────────────────
function showDialog(text, speaker) {
    if (state.setupActive) return;
    speakerName.textContent = speaker || CHAR_NAMES[state.currentCharacter];
    typeText(text);
    dialogBox.classList.remove("hidden");
}

function hideDialog() {
    dialogBox.classList.add("hidden");
    state.dialogQueue = [];
    state.isTyping = false;
}

function typeText(text) {
    state.isTyping = true;
    dialogText.textContent = "";
    let i = 0;
    const speed = 30;
    function tick() {
        if (i < text.length) { dialogText.textContent += text[i++]; setTimeout(tick, speed); }
        else state.isTyping = false;
    }
    tick();
}

dialogBox.addEventListener("click", () => { hideDialog(); });

// ─── 点击 / 触摸交互 ────────────────────────────────────
document.addEventListener("click", (e) => {
    if (state.setupActive) return;
    if (state.setupAwaitingTouch) {
        state.setupAwaitingTouch = false;
        hideDialog();
        state.onTouchComplete = startSetupWizard;
        playTouch("m");
        return;
    }
    if (e.target.closest(".action-btn, .close-btn, .config-item, #setup-area, .setup-opt-btn, #setup-submit, .setup-skip-btn, #config-panel, #action-panel, .window, #taskbar")) return;
    if (!dialogBox.classList.contains("hidden")) { hideDialog(); return; }
    if (state.isTouchPlaying) return;
    if (state.isBlankBg) return;
    playTouch("m");
});

document.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
        state.touchStartX = e.touches[0].clientX;
        state.touchStartY = e.touches[0].clientY;
    }
}, { passive: true });

document.addEventListener("touchend", (e) => {
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - state.touchStartX;
    const dy = e.changedTouches[0].clientY - state.touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) {
        const t = e.changedTouches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el?.closest(".action-btn, .close-btn, .config-item, #setup-area, .setup-opt-btn, #setup-submit, .setup-skip-btn, #config-panel, #action-panel, .window, #taskbar")) return;
        if (state.setupActive || state.setupAwaitingTouch) {
            state.setupAwaitingTouch = false;
            hideDialog();
            state.onTouchComplete = startSetupWizard;
            playTouch("m");
            return;
        }
        if (!dialogBox.classList.contains("hidden")) { hideDialog(); return; }
        if (state.isTouchPlaying) return;
        if (state.isBlankBg) return;
        playTouch("m");
    }
});

// ─── 操作面板 ────────────────────────────────────────────
function toggleActionPanel() { actionPanel.classList.toggle("hidden"); }

actionPanel.querySelectorAll(".action-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        switch (btn.dataset.action) {
            case "talk": startConversation(); break;
            case "config": openConfig(); break;
            case "exit": if (confirm("确定要退出吗？")) window.close(); break;
        }
        actionPanel.classList.add("hidden");
    });
});

// ─── AI Gateway 对话 ─────────────────────────────────────
const conversationHistory = [];
let memoryStatus = null;
let reasoningContext = null;
let isReasoning = false;
let systemPrompt = "";

async function loadPrompt() {
    try {
        const resp = await fetch("/api/prompt");
        if (resp.ok) {
            const data = await resp.json();
            systemPrompt = data.prompt || "";
            console.log("Loaded system prompt (" + systemPrompt.length + " chars)");
        } else {
            console.warn("Failed to load prompt, using fallback");
        }
    } catch (e) {
        console.warn("Failed to fetch prompt:", e.message);
    }
    if (!systemPrompt) {
        systemPrompt = `你是${CHAR_NAMES[state.currentCharacter]}，一个友好的AI助手。请用中文简短回答，语气自然亲切。`;
    }
}

async function startConversation() {
    hideDialog();
    showDialog("嗯...有什么想聊的吗？", CHAR_NAMES[state.currentCharacter]);
}

async function callAI(message) {
    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: message },
    ];

    try {
        const body = {
            model: "deepseek/deepseek-chat",
            messages,
            session_id: "main",
        };
        if (reasoningContext) {
            body.reasoning_context = reasoningContext;
            reasoningContext = null;
        }

        const resp = await fetch(`${state.gatewayUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content || "（无回复）";

        if (data.interrupted && data.reasoning_context) {
            reasoningContext = data.reasoning_context;
            isReasoning = true;
            console.log("[AI] Reasoning interrupted, saving context for resume");
            showDialog("⏸ 推理被新消息中断，请继续发送消息以恢复...", CHAR_NAMES[state.currentCharacter]);
            setTimeout(() => continueReasoning(), 2000);
            return reply;
        }

        isReasoning = false;
        reasoningContext = null;

        conversationHistory.push({ role: "user", content: message });
        conversationHistory.push({ role: "assistant", content: reply });

        if (data.memory) {
            memoryStatus = data.memory;
            console.log("[Memory]", JSON.stringify(memoryStatus));
        }

        return reply;
    } catch (e) {
        console.error("AI 调用失败:", e);
        return "（AI 网关未连接）请检查 " + state.gatewayUrl;
    }
}

async function continueReasoning() {
    if (!reasoningContext || !isReasoning) return;
    console.log("[AI] Continuing interrupted reasoning...");
    showDialog("↩️ 恢复推理...", CHAR_NAMES[state.currentCharacter]);
    const reply = await callAI("");
    if (reply) showDialog(reply, CHAR_NAMES[state.currentCharacter]);
}

// ─── 对话输入 ───────────────────────────────────────────
const inputOverlay = document.getElementById("input-overlay");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-input-send");

function showInputDialog() {
    inputOverlay.classList.remove("hidden");
    chatInput.value = "";
    chatInput.focus();
}

function hideInputDialog() {
    inputOverlay.classList.add("hidden");
}

function submitChatInput() {
    const text = chatInput.value.trim();
    if (!text) return;
    hideInputDialog();
    showDialog("嗯...让我想想...", CHAR_NAMES[state.currentCharacter]);
    callAI(text).then(reply => {
        showDialog(reply, CHAR_NAMES[state.currentCharacter]);
    });
}

chatSendBtn.addEventListener("click", submitChatInput);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitChatInput();
    if (e.key === "Escape") hideInputDialog();
});
inputOverlay.addEventListener("click", (e) => {
    if (e.target === inputOverlay) hideInputDialog();
});

// document.addEventListener("dblclick", () => { showInputDialog(); });

const talkBtn = actionPanel.querySelector('[data-action="talk"]');
if (talkBtn) {
    talkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // showInputDialog();
        actionPanel.classList.add("hidden");
    });
}

// ─── 面部表情选择 ────────────────────────────────────────
function populateFaceOptions() {
    const sel = document.getElementById("face-select");
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "无";
    sel.appendChild(noneOpt);
    const faces = window.getCharacterFaceAnimations ? window.getCharacterFaceAnimations() : [];
    faces.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });
    if (prevVal && faces.includes(prevVal)) {
        sel.value = prevVal;
    } else if (state.currentFace && faces.includes(state.currentFace)) {
        sel.value = state.currentFace;
    } else {
        sel.value = "";
    }
}

// ─── 设置面板 ────────────────────────────────────────────
function openConfig() {
    document.getElementById("character-select").value = state.currentCharacter;
    document.getElementById("background-select").value = state.currentBackground;
    document.getElementById("gateway-url").value = state.gatewayUrl;
    document.getElementById("fps-toggle").checked = state.showFPS;
    populateFaceOptions();
    configPanel.classList.remove("hidden");
}

function closeConfig() { configPanel.classList.add("hidden"); }
document.getElementById("config-close").addEventListener("click", closeConfig);

document.getElementById("character-select").addEventListener("change", (e) => {
    changeCharacter(e.target.value);
    closeConfig();
});

document.getElementById("background-select").addEventListener("change", (e) => {
    state.currentBackground = e.target.value;
    saveConfig();
    if (window.loadSpineDesktop) {
        window.loadSpineDesktop(e.target.value, () => {
            if (state.isFloorMode) showFloor();
            else playIdle();
        });
    }
});

document.getElementById("fps-toggle").addEventListener("change", (e) => {
    state.showFPS = e.target.checked;
    saveConfig();
    document.getElementById("fps-counter").classList.toggle("hidden", !state.showFPS);
    initFPS();
});

document.getElementById("gateway-url").addEventListener("change", (e) => {
    state.gatewayUrl = e.target.value.trim() || "http://localhost:8080";
    saveConfig();
});

document.getElementById("face-select").addEventListener("change", (e) => {
    state.currentFace = e.target.value || null;
    saveConfig();
    if (state.isBlankBg && window.setCharacterFace) {
        window.setCharacterFace(state.currentFace);
    }
});

// ─── FPS 计数器 ─────────────────────────────────────────
let fpsRafId = null;
function initFPS() {
    const fpsEl = document.getElementById("fps-counter");
    if (!state.showFPS) { if (fpsRafId) cancelAnimationFrame(fpsRafId); fpsRafId = null; return; }
    fpsEl.classList.remove("hidden");
    let frames = 0, last = performance.now();
    function tick() {
        frames++;
        const now = performance.now();
        if (now - last >= 1000) { fpsEl.textContent = `FPS: ${frames}`; frames = 0; last = now; }
        if (state.showFPS) fpsRafId = requestAnimationFrame(tick);
    }
    if (fpsRafId) cancelAnimationFrame(fpsRafId);
    fpsRafId = requestAnimationFrame(tick);
}

// ─── 加载 / 错误 UI ─────────────────────────────────────
const errorBox = document.getElementById("error-box");

function hideLoading() { loading.classList.add("hidden"); initFPS(); }

function showError(msg) {
    document.getElementById("error-message").textContent = msg;
    errorBox.classList.remove("hidden");
}

function retryInit() {
    errorBox.classList.add("hidden");
    loading.classList.remove("hidden");
    init();
}
document.getElementById("error-retry").addEventListener("click", retryInit);

// ─── 初始化向导（预设问题，使用底部面板） ─────────────
const SETUP_DONE_KEY = "aios_setup_done";
let setupStep = 0;
let setupAnswers = {};

const SETUP_STEPS = [
    {
        text: "（熟悉的教室里，阿罗娜正趴在桌子上打着瞌睡。）",
        name: "无",
        affil: "无"
    },
    {
        text: "呼呼...Zzzz",
        name: "阿罗娜",
        affil: "无"
    },
    {
        text: "呼呼...Zzzz",
        name: "阿罗娜",
        affil: "无"
    },
    {
        text: "唔，蜂蜜蛋糕......比起草莓牛奶......还是香蕉牛奶更配......",
        name: "阿罗娜",
        affil: "无"
    },
    {
        text: "呼呼...Zzzz",
        name: "阿罗娜",
        affil: "无"
    },
    {
        text: "嘿嘿......还剩好多啊......",
        name: "阿罗娜",
        affil: "无",
        image: true,
        imageSrc: "assets/bgcsarona.jpg"
    }
];

function showSetupInput() {
    const step = SETUP_STEPS[setupStep];
    const inputOverlay = document.getElementById("input-overlay");
    const chatInput = document.getElementById("chat-input");
    if (inputOverlay && chatInput) {
        chatInput.value = step.default || "";
        chatInput.placeholder = "输入回答…";
        inputOverlay.classList.remove("hidden");
        chatInput.focus();
    }
}

function hideSetupInput() {
    const inputOverlay = document.getElementById("input-overlay");
    if (inputOverlay) inputOverlay.classList.add("hidden");
}

function advanceSetup() {
    console.log("[SETUP] advanceSetup: setupStep=" + setupStep + " → " + (setupStep + 1));
    setupStep++;
    if (setupStep >= SETUP_STEPS.length) {
        console.log("[SETUP] all steps done, calling finishSetup()");
        finishSetup();
        return;
    }
    showSetupStep();
}

function showSetupStep() {
    const step = SETUP_STEPS[setupStep];
    if (!step) { console.warn("[SETUP] step not found at index", setupStep); finishSetup(); return; }
    console.log("[SETUP] showStep", setupStep, "image=" + !!step.image, "body=", String(step.text).slice(0, 30));
    console.log("[SETUP] overlayExists=" + (!!document.getElementById("setup-image-overlay")), "maskExists=" + (!!document.getElementById("setup-mask")));

    // 图片步骤：先显示图片（转场1.5s），再等待1秒，然后显示文本框
    if (step.image) {
        showSetupImage(step.imageSrc);
        setTimeout(function() {
            window.showBottomPanel({
                name: step.name || "什亭之匣",
                affil: step.affil || "AI OS",
                body: step.text,
                speed: 60,
                delay: 0,
                showDelay: 0,
                autoAdvance: true,
                onDone: function() {
                    window.hideBottomPanel();
                    setTimeout(function() {
                        hideSetupImage(function() {
                            advanceSetup();
                            // 检查下一步是否为纯文本步，若是则直接切换不隐藏面板
                            var nextStep = SETUP_STEPS[setupStep];
                            if (nextStep && !nextStep.image && !nextStep.input && !nextStep.done) {
                                window.switchBottomPanelText({
                                    name: nextStep.name || "什亭之匣",
                                    affil: nextStep.affil || "AI OS",
                                    body: nextStep.text,
                                    speed: 60,
                                    showDelay: 0,
                                    autoAdvance: false
                                });
                            }
                        });
                    }, 1000);
                }
            });
        }, 2500);
        return;
    }

    window.showBottomPanel({
        name: step.name || "什亭之匣",
        affil: step.affil || "AI OS",
        body: step.text,
        speed: 60,
        delay: 500,
        showDelay: 300,
        autoAdvance: false,
        onDone: function() {
            if (step.input) {
                // 确保立绘已显示后再展示输入框
                if (window.showSpineCharacter) window.showSpineCharacter(true);
                showSetupInput();
            } else if (step.done) {
                finishSetup();
            } else {
                advanceSetup();
                // 检查下一步是否为纯文本步，若是则直接切换不隐藏面板
                var nextStep = SETUP_STEPS[setupStep];
                if (nextStep && !nextStep.image && !nextStep.input && !nextStep.done) {
                    window.switchBottomPanelText({
                        name: nextStep.name || "什亭之匣",
                        affil: nextStep.affil || "AI OS",
                        body: nextStep.text,
                        speed: 60,
                        showDelay: 0,
                        autoAdvance: false
                    });
                }
            }
        }
    });
}

// ─── 设置向导图片与黑色蒙版转场 ──────────────────────
function getMaskEl() {
    var el = document.getElementById("setup-mask");
    if (!el) {
        el = document.createElement("div");
        el.id = "setup-mask";
        el.className = "setup-mask";
        document.body.appendChild(el);
    }
    return el;
}

function showSetupImage(src) {
    console.log("[SETUP] showSetupImage: src=" + src);
    var mask = getMaskEl();
    console.log("[SETUP] mask classList:", mask.className);
    mask.classList.add("visible");
    void mask.offsetHeight;
    mask.classList.add("active");
    console.log("[SETUP] mask active, waiting 500ms for image...");

    // 等待蒙版完全变黑（0.5s）后显示图片
    setTimeout(function() {
        var el = document.getElementById("setup-image-overlay");
        if (!el) {
            el = document.createElement("div");
            el.id = "setup-image-overlay";
            el.className = "setup-image-overlay";
            document.body.appendChild(el);
        }
        el.style.backgroundImage = "url(" + src + ")";
        el.classList.add("visible");
        // 图片淡入完成后禁用背景点击层，让面板可交互
        setTimeout(function() {
            mask.classList.remove("active");
            var clickOverlay = document.getElementById("spine-click-overlay");
            if (clickOverlay) clickOverlay.style.pointerEvents = "none";
            setTimeout(function() {
                mask.classList.remove("visible");
            }, 500);
        }, 500);
    }, 500);
}

function hideSetupImage(callback) {
    console.log("[SETUP] hideSetupImage called");
    var mask = getMaskEl();
    mask.classList.add("visible");
    void mask.offsetHeight;
    mask.classList.add("active");

    // 等待蒙版完全变黑后隐藏图片
    setTimeout(function() {
        var el = document.getElementById("setup-image-overlay");
        if (el) {
            el.classList.remove("visible");
            console.log("[SETUP] image overlay hidden");
        }
        // 等待图片完全淡出后移除蒙版，并恢复背景点击层
        setTimeout(function() {
            mask.classList.remove("active");
            setTimeout(function() {
                mask.classList.remove("visible");
                var clickOverlay = document.getElementById("spine-click-overlay");
                if (clickOverlay) clickOverlay.style.pointerEvents = "auto";
                if (callback) callback();
            }, 500);
        }, 500);
    }, 500);
}

function handleSetupSubmit() {
    const step = SETUP_STEPS[setupStep];
    if (!step || !step.input) return;
    const chatInput = document.getElementById("chat-input");
    const val = chatInput.value.trim();
    if (val) {
        setupAnswers[step.key] = val;
    }
    hideSetupInput();

    // 保存配置
    if (step.key === "gatewayUrl" && val) {
        state.gatewayUrl = val;
        saveConfig();
    }

    advanceSetup();
}

function finishSetup() {
    console.log("[SETUP] finishSetup() called");
    setupStep = 0;
    setupAnswers = {};
    state.setupActive = false;
    localStorage.setItem(SETUP_DONE_KEY, "1");
    window.hideBottomPanel();
    hideSetupImage();
    var tb = document.getElementById("taskbar");
    if (tb) tb.style.display = "";
    if (window.adjustSpinePosition) window.adjustSpinePosition();
    // 恢复背景点击层
    var clickOverlay = document.getElementById("spine-click-overlay");
    if (clickOverlay) clickOverlay.style.pointerEvents = "auto";
    // 显示欢迎窗口
    setTimeout(function() {
        if (window.DESKTOP && window.DESKTOP.openWindow) {
            window.DESKTOP.openWindow("welcome", "欢迎使用什亭之匣", 400, 300);
        }
    }, 500);
}

function skipSetup() {
    setupStep = 0;
    setupAnswers = {};
    state.setupActive = false;
    window.hideBottomPanel();
    hideSetupInput();
    hideSetupImage();
    var tb = document.getElementById("taskbar");
    if (tb) tb.style.display = "";
    if (window.adjustSpinePosition) window.adjustSpinePosition();
    localStorage.setItem(SETUP_DONE_KEY, "1");
}

function startSetupWizard() {
    console.log("[SETUP] startSetupWizard called, taskbar display:", getComputedStyle(document.getElementById("taskbar"))?.display);
    setupStep = 0;
    setupAnswers = {};
    state.setupActive = true;
    var tb = document.getElementById("taskbar");
    if (tb) { tb.style.display = "none"; }
    if (window.adjustSpinePosition) window.adjustSpinePosition();

    // 先加载立绘（不显示，等到需要输入时再显示）
    if (window.loadSpineCharacter) {
        window.loadSpineCharacter(state.currentCharacter, function() {
            if (window.showSpineCharacter) window.showSpineCharacter(false);
        });
    }

    // 延迟启动向导
    setTimeout(function() {
        showSetupStep();
    }, 500);
}

// 设置输入提交
document.addEventListener("click", function(e) {
    const chatInput = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-input-send");
    if (e.target === chatSendBtn ||
        (e.target === chatInput && e.keyCode === undefined)) {
        // 由 submitChatInput 处理
    }
});

// 重写输入提交逻辑以支持向导
const origSubmitChatInput = submitChatInput;
submitChatInput = function() {
    // 如果在设置向导模式，用向导提交
    if (setupStep > 0 && setupStep < SETUP_STEPS.length - 1) {
        handleSetupSubmit();
        return;
    }
    origSubmitChatInput();
};

// ─── 初始化 ─────────────────────────────────────────────
async function init() {
    await loadPrompt();
    loadConfig();

    if (state.blankTimer) {
        clearTimeout(state.blankTimer);
        state.blankTimer = null;
    }
    state.isBlankBg = false;
    try {
        if (window.loadSpineDesktop) {
            await new Promise((resolve, reject) => {
                window.loadSpineDesktop(state.currentBackground, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        const transitionEl = document.getElementById("page-transition");
        if (transitionEl) {
            transitionEl.style.opacity = "1";
            transitionEl.style.pointerEvents = "auto";
            requestAnimationFrame(() => {
                transitionEl.style.transition = "opacity 0.6s ease";
                transitionEl.style.opacity = "0";
                setTimeout(() => {
                    transitionEl.style.pointerEvents = "none";
                }, 700);
            });
        }

        if (!localStorage.getItem(SETUP_DONE_KEY)) {
            console.log("[INIT] starting setup wizard");
            // 隐藏任务栏，禁止背景交互
            var tb = document.getElementById("taskbar");
            if (tb) tb.style.display = "none";
            state.setupActive = true;
            if (window.adjustSpinePosition) window.adjustSpinePosition();
            if (window.playSpineAnim) window.playSpineAnim("Idle_00", true);
            hideLoading();
            // 自动启动设置向导，无需等待点击
            setTimeout(function() {
                state.setupAwaitingTouch = false;
                console.log("[INIT] calling startSetupWizard()");
                startSetupWizard();
            }, 1000);
        } else {
            console.log("[INIT] setup already done, loading character");
            playIdle();
            hideLoading();
            if (window.loadSpineCharacter) {
                // 初始加载仅预载资源，不显示立绘（立绘仅在 dummy 触摸状态后显示）
                window.loadSpineCharacter(state.currentCharacter, function() {
                    console.log("loadSpineCharacter callback fired");
                    if (window.showSpineCharacter) window.showSpineCharacter(false);
                });
            } else {
                console.warn("[DIAG] window.loadSpineCharacter not found!");
            }
        }
    } catch (e) {
        console.error("初始化失败:", e);
        showError("桌面加载失败！\n请确认 Spine 资源路径正确。\n\n" + e.message);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

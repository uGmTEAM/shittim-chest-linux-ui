// ============================================================
// AI OS WebUI - Spine 完整桌面动画渲染（纯 Spine，无 webm）
// 使用 spine-player 4.2.33 API: new spine.SpinePlayer(parent, config)
// 单一 Spine 实例负责背景 + 角色所有动画（待机/触摸/底层）
// ============================================================

const SPINE_BASE = "assets/spine/backgrounds/";

// 子目录名映射（内部名 → 实际目录名）
const BG_DIR = {
    day: "daytime",
    night: "nighttime",
};

// 每日/夜间骨架资源
const BG_SKELETONS = {
    day: {
        binaryUrl: "arona_workpage_daytime_2.skel",
        atlasUrl: "arona_workpage_daytime_2.atlas",
    },
    night: {
        binaryUrl: "arona_workpage_nighttime_2.skel",
        atlasUrl: "arona_workpage_nighttime_2.atlas",
    },
};

// 动画映射：待机/底层
const ANIM_MAP = {
    day: {
        floor: "floor_00_R",
        idle: ["Idle_00", "Idle_01", "Idle_02", "Idle_03"],
    },
    night: {
        floor: "floor_00_R",
        idle: ["Idle_00", "Idle_01", "Idle_02", "Idle_03", "Idle_04"],
    },
};

// 根据当前播放的待机动画生成触摸动画名
function getTouchAnim(type) {
    const current = window.getCurrentAnimation();
    const base = current && current.startsWith("Idle_") ? current : "Idle_00";
    return base + (type === "a" ? "_Touch_A" : "_Touch_M");
}

let currentBg = null;
let spineEl = null;
let isLoading = false;

let charSpineEl = null;     // 角色立绘 Spine 实例
let charContainer = null;   // 角色立绘容器

// 创建全屏容器
const container = document.createElement("div");
container.id = "spine-desktop";
container.style.position = "fixed";
container.style.top = "0";
container.style.left = "0";
container.style.right = "0";
container.style.bottom = "0";
container.style.zIndex = "1";
container.style.pointerEvents = "none";
container.style.background = "transparent";
container.style.overflow = "hidden";

// Spine 全屏 CSS
const spineStyle = document.createElement("style");
spineStyle.textContent = `
    #spine-desktop {
        width: 100vw !important;
    }
    #spine-desktop > *,
    #spine-desktop canvas {
        width: 100% !important;
        height: 100% !important;
        display: block !important;
    }
    #spine-character > *,
    #spine-character canvas {
        width: 100% !important;
        height: 100% !important;
        display: block !important;
    }
`;
document.head.appendChild(spineStyle);

document.addEventListener("DOMContentLoaded", () => {
    document.body.insertBefore(container, document.body.firstChild);

    // 创建点击交互层（覆盖 Spine 动画区域，用于检测点击动画交互）
    const clickOverlay = document.createElement("div");
    clickOverlay.id = "spine-click-overlay";
    clickOverlay.style.position = "fixed";
    clickOverlay.style.left = "0";
    clickOverlay.style.right = "0";
    clickOverlay.style.zIndex = "2";
    clickOverlay.style.pointerEvents = "auto";
    clickOverlay.style.background = "rgba(0,0,0,0.001)";
    clickOverlay.style.cursor = "pointer";
    document.body.appendChild(clickOverlay);

    // 角色立绘容器
    charContainer = document.createElement("div");
    charContainer.id = "spine-character";
    charContainer.style.position = "fixed";
    charContainer.style.left = "0";
    charContainer.style.width = "75vw";
    charContainer.style.overflow = "hidden";
    charContainer.style.zIndex = "100";
    charContainer.style.pointerEvents = "none";
    charContainer.style.display = "none";
    document.body.appendChild(charContainer);

    // 初始化位置（根据任务栏高度动态设置）
    window.adjustSpinePosition();
});

// 加载角色立绘
window.loadSpineCharacter = function(charName, onLoaded) {
    if (charSpineEl) {
        try { charSpineEl.dispose(); } catch (e) { /* ignore */ }
        charSpineEl = null;
    }
    // 临时显示容器以便 WebGL 初始化，初始化后立即隐藏
    if (charContainer) charContainer.style.display = "block";
    const basePath = "assets/spine/characters/" + charName + "/";
    const skelName = charName === "plana" ? "NP0035_spr.skel" : "arona_spr.skel";
    const atlasName = charName === "plana" ? "NP0035_spr.atlas" : "arona_spr.atlas";
    try {
        charSpineEl = new spine.SpinePlayer(charContainer, {
                binaryUrl: basePath + skelName,
                atlasUrl: basePath + atlasName,
                scale: 1.0,
                showControls: false,
                alpha: true,
                backgroundColor: "00000000",
                premultipliedAlpha: false,
                showLoading: false,
                animation: "Idle_01",
                viewport: {
                    padLeft: "0%",
                    padRight: "0%",
                    padTop: "0%",
                    padBottom: "0%"
                },
                // 每帧将角色左边缘对齐屏幕左边缘，下移屏幕1/3
                update: function(player, delta) {
                    if (player.sceneRenderer && player.sceneRenderer.camera && player.currentViewport) {
                        var vp = player.currentViewport;
                        var canvas = player.canvas;
                        var zoom = player.sceneRenderer.camera.zoom;
                        if (vp && vp.width > 0 && canvas && zoom > 0) {
                            // 水平：角色左边缘(vp.x)对齐屏幕左边缘
                            // 投影矩阵: right=zoom*vpW/2, left=-zoom*vpW/2 → 可见宽度=zoom*vpW
                            // cam.x = vp.x + 可见宽度/2 = vp.x + zoom * canvas.width / 2
                            player.sceneRenderer.camera.position.x = vp.x + zoom * canvas.width / 2;
                            // 垂直：从默认中心下移屏幕1/3 → 相机上移1/3可见高度
                            // 默认 cam.y = vp.y + vp.height / 2
                            // 偏移 = (1/3) * 可见高度 = (1/3) * zoom * canvas.height
                            player.sceneRenderer.camera.position.y = vp.y + vp.height / 2 + (1/3) * zoom * canvas.height;
                            // 重置渲染器，使 renderer.begin() 重新上传投影矩阵到着色器
                            player.sceneRenderer.activeRenderer = null;
                        }
                    }
                },
                success: function(player) {
                console.log("Spine character loaded:", charName);
                if (charContainer) {
                    player.canvas.width = charContainer.clientWidth;
                    player.canvas.height = charContainer.clientHeight;
                }
                // 加载完成后默认隐藏，由回调决定是否显示
                if (charContainer) charContainer.style.display = "none";
                if (onLoaded) onLoaded();
            },
            error: function(message, reason) {
                console.error("Spine character load error:", charName, message, reason);
                if (charContainer) charContainer.style.display = "none";
                if (onLoaded) onLoaded(new Error(message));
            },
        });
        // SpinePlayer 构造函数同步执行，初始化后立即隐藏容器
        if (charContainer) charContainer.style.display = "none";
    } catch (e) {
        console.error("Spine character create error:", e);
        if (charContainer) charContainer.style.display = "none";
        if (onLoaded) onLoaded(e);
    }
};

// 显示/隐藏角色立绘
window.showSpineCharacter = function(visible) {
    if (!charContainer) return;
    charContainer.style.display = visible ? "block" : "none";
};

// 应用角色 viewport 偏移（紧贴左侧窗口边缘，无偏移）
function applyCharacterViewportOffset(player) {
    if (!player || !player.currentViewport || !player.currentViewport.width) return;
    // 无需偏移，角色使用自动计算视口（紧贴左侧边缘）
    // 仅保留此函数作为兼容接口
}

// 当前角色面部表情动画名（null = 无面部叠加）
let characterFaceAnim = null;

// 播放角色立绘动画（双轨道：Idle_01 身体 + 可选面部表情）
window.playSpineCharacterAnim = function(animName, faceName) {
    console.log("playSpineCharacterAnim:", animName, "face:", faceName);
    if (!charSpineEl) return;
    if (!charSpineEl.skeleton || !charSpineEl.skeleton.data) {
        console.warn("Character skeleton not ready yet");
        return;
    }
    const anims = charSpineEl.skeleton.data.animations;
    try {
        // 轨道 0：始终播放 Idle_01 作为身体动画
        const bodyIdle = anims.find(a => a.name.toLowerCase() === "idle_01");
        if (bodyIdle) {
            charSpineEl.animationState.setAnimation(0, bodyIdle.name, true);
        } else if (anims.length > 0) {
            // 兜底：播第一个可用动画
            charSpineEl.animationState.setAnimation(0, anims[0].name, true);
        }
        // 轨道 1：面部表情叠加
        if (faceName) {
            const faceFound = anims.find(a => a.name.toLowerCase() === faceName.toLowerCase());
            if (faceFound && faceFound.name.toLowerCase() !== "idle_01") {
                charSpineEl.animationState.setAnimation(1, faceFound.name, true);
                characterFaceAnim = faceFound.name;
            }
        } else if (characterFaceAnim) {
            // 恢复之前的面部表情
            const faceFound = anims.find(a => a.name === characterFaceAnim);
            if (faceFound) {
                charSpineEl.animationState.setAnimation(1, characterFaceAnim, true);
            }
        }
        charSpineEl.paused = false;
    } catch (e) {
        console.warn("Character anim error:", e);
    }
};

// 设置角色面部表情（覆盖到轨道 1）
window.setCharacterFace = function(faceName) {
    if (!charSpineEl || !charSpineEl.skeleton || !charSpineEl.skeleton.data) {
        characterFaceAnim = faceName || null;
        return;
    }
    const anims = charSpineEl.skeleton.data.animations;
    if (!faceName) {
        // 清除面部表情
        characterFaceAnim = null;
        try {
            charSpineEl.animationState.setEmptyAnimation(1, 0);
        } catch (e) {}
        return;
    }
    const found = anims.find(a => a.name.toLowerCase() === faceName.toLowerCase());
    if (found && found.name.toLowerCase() !== "idle_01") {
        characterFaceAnim = found.name;
        try {
            charSpineEl.animationState.setAnimation(1, found.name, true);
            charSpineEl.paused = false;
        } catch (e) {}
    } else {
        console.warn("Face animation not found or is body animation:", faceName);
    }
};

// 获取可用面部表情列表（排除 Idle_01 后的所有动画）
window.getCharacterFaceAnimations = function() {
    if (!charSpineEl || !charSpineEl.skeleton || !charSpineEl.skeleton.data) return [];
    const anims = charSpineEl.skeleton.data.animations;
    return anims
        .map(a => a.name)
        .filter(n => n.toLowerCase() !== "idle_01")
        .sort();
};

// 获取当前面部表情名
window.getCurrentCharacterFace = function() {
    return characterFaceAnim;
};

// 加载 Spine 桌面动画
window.loadSpineDesktop = function(backgroundName, onLoaded) {
    if (currentBg === backgroundName && spineEl && !isLoading) {
        if (onLoaded) onLoaded();
        return;
    }

    isLoading = true;
    currentBg = backgroundName;

    if (spineEl) {
        try { spineEl.dispose(); } catch (e) { /* ignore */ }
        spineEl = null;
    }

    const res = BG_SKELETONS[backgroundName];
    if (!res) {
        console.error("Unknown background:", backgroundName);
        isLoading = false;
        if (onLoaded) onLoaded(new Error("Unknown background: " + backgroundName));
        return;
    }

    const dirName = BG_DIR[backgroundName] || backgroundName;
    const basePath = SPINE_BASE + dirName + "/";
    try {
        spineEl = new spine.SpinePlayer(container, {
            binaryUrl: basePath + res.binaryUrl,
            atlasUrl: basePath + res.atlasUrl,
            // 不设初始动画，由 app.js 的 playIdle() 控制
            scale: 1.0,
            showControls: false,
            alpha: true,
            backgroundColor: "00000000",
            premultipliedAlpha: false,
            showLoading: false,
            viewport: {
                padLeft: "0%",
                padRight: "0%",
                padTop: "0%",
                padBottom: "0%"
            },
            // 背景适应模式（fit），显示完整背景
            update: function(player, delta) {
                if (player.sceneRenderer && player.sceneRenderer.camera) {
                    var canvas = player.canvas;
                    var vp = player.viewport;
                    if (canvas && vp && vp.width > 0 && vp.height > 0) {
                        // "适应"（fit）模式：显示完整视口
                        player.sceneRenderer.camera.zoom = canvas.height / canvas.width > vp.height / vp.width
                            ? vp.height / canvas.height
                            : vp.width / canvas.width;
                    }
                }
            },
            success: function(player) {
                isLoading = false;
                console.log("Spine desktop loaded: " + backgroundName);
                if (onLoaded) onLoaded();
            },
            error: function(message, reason) {
                isLoading = false;
                console.error("Spine desktop load error:", backgroundName, message, reason);
                if (onLoaded) onLoaded(new Error(message));
            },
        });
    } catch (e) {
        isLoading = false;
        console.error("Spine desktop create error:", e);
        if (onLoaded) onLoaded(e);
    }
};

// 播放指定动画（loop 默认为 false）
window.playSpineAnim = function(animationName, loop) {
    if (!spineEl) {
        console.warn("Spine element not ready, cannot play:", animationName);
        return;
    }
    const shouldLoop = loop === true;
    spineEl.setAnimation(animationName, shouldLoop);
    spineEl.play();
    console.log("Playing animation:", animationName, shouldLoop ? "(loop)" : "(once)");
};

// 清除动画，显示骨骼默认状态（空白背景）
window.clearSpineAnimation = function() {
    if (!spineEl) return;
    try {
        if (spineEl.animationState) {
            const entry = spineEl.animationState.setEmptyAnimation(0, 0);
            if (entry) entry.trackEnd = 1e8; // 防止动画自动结束
        }
        if (spineEl.skeleton) {
            spineEl.skeleton.setToSetupPose();
            spineEl.skeleton.updateWorldTransform(2 /* update */);
        }
        spineEl.pause();
        console.log("Spine animation cleared (dummy state)");
    } catch (e) {
        console.warn("Failed to clear spine animation:", e);
    }
};

// 获取当前动画名
window.getCurrentAnimation = function() {
    return spineEl && spineEl.animationState ? spineEl.animationState.getCurrent(0)?.animation?.name : null;
};

// 获取触摸动画名（暴露给 app.js）
window.getTouchAnim = getTouchAnim;

// 显示/隐藏整个桌面
window.setSpineDesktopVisible = function(visible) {
    container.style.display = visible ? "block" : "none";
};

// 根据任务栏高度调整 Spine 容器位置（暴露给 app.js）
window.adjustSpinePosition = function() {
    var tb = document.getElementById("taskbar");
    // 用 getComputedStyle 判断是否真正可见（display:none 时 offsetParent 为 null）
    var topPx = tb && getComputedStyle(tb).display !== 'none' ? tb.offsetHeight : 0;
    var topStr = topPx + "px";
    var heightStr = topPx === 0 ? "100vh" : "calc(100vh - " + topPx + "px)";
    container.style.top = topStr;
    container.style.height = heightStr;
    var clickOverlay = document.getElementById("spine-click-overlay");
    if (clickOverlay) {
        clickOverlay.style.top = topStr;
        clickOverlay.style.height = heightStr;
    }
    if (charContainer) {
        charContainer.style.top = topStr;
        charContainer.style.height = heightStr;
    }
    // 同步更新 overlay 和 mask（使用 top:0/bottom:0 确保全屏覆盖）
    var imgOverlay = document.getElementById("setup-image-overlay");
    if (imgOverlay) {
        imgOverlay.style.top = "0";
        imgOverlay.style.bottom = "0";
        imgOverlay.style.height = "";
    }
    var mask = document.getElementById("setup-mask");
    if (mask) {
        mask.style.top = "0";
        mask.style.bottom = "0";
        mask.style.height = "";
    }
};

// ============================================================
// AI OS WebUI - Spine 立绘模块（已从 spine-bg.js 整合）
// 此文件保留全局接口兼容性，实际逻辑在 spine-bg.js 中
// ============================================================

// 立绘逻辑已合并到 spine-bg.js（全桌面 Spine 已包含角色动画）
window.loadSpinePortrait = function(characterName, onLoaded) {
    console.log("[spine-portrait] portrait mode integrated into desktop spine");
    if (onLoaded) onLoaded();
};

window.setSpinePortraitVisible = function(visible) {
    // No-op: full desktop spine handles everything
};

window.getSpineCharacter = function() {
    return window._currentCharacter || "arona";
};

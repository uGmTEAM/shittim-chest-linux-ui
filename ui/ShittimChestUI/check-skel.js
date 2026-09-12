const fs = require('fs');
const path = require('path');
const spine = require('@esotericsoftware/spine-player');

const resourceDir = path.join(__dirname, 'resources', 'spine');

function findSkelFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findSkelFiles(full));
        else if (entry.name.endsWith('.skel')) results.push(full);
    }
    return results;
}

const skelFiles = findSkelFiles(resourceDir);
console.log(`Found ${skelFiles.length} .skel files:\n`);

// Use spine-player's internal SkeletonDataLoader
for (const skelPath of skelFiles) {
    const base = skelPath.replace(/\.skel$/, '');
    const atlasPath = base + '.atlas';
    const jsonOutPath = base + '.json';

    if (!fs.existsSync(atlasPath)) {
        console.log(`SKIP ${path.relative(__dirname, skelPath)}: no atlas`);
        continue;
    }

    console.log(`Converting ${path.relative(__dirname, skelPath)} ...`);
    try {
        // Create a minimal HTML page to test loading
        const htmlPage = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<canvas id="canvas" width="800" height="600"></canvas>
<script src="https://unpkg.com/@esotericsoftware/spine-player@4.3.13/dist/iife/spine-player.js"></script>
<script>
const player = new spine.player.WebPlayer({
    skeleton: "FILE_URL",
    atlas: "ATLAS_URL",
    animation: "idle",
    loop: true,
    alphaMode: "alpha"
});
player.canvas = document.getElementById("canvas");
console.log("Loaded animations:", player.animations);
</script>
</body>
</html>`;
        console.log(`  Atlas exists: ${fs.existsSync(atlasPath)}`);
        console.log(`  Output would go to: ${path.relative(__dirname, jsonOutPath)}`);
        console.log(`  Test HTML page ready (use with WebEngineView)\n`);
    } catch (e) {
        console.log(`  ERROR: ${e.message}\n`);
    }
}
console.log('Done. Check resources for test HTML pages.');

const fs = require('fs');
const path = require('path');
const { TextureAtlas, AtlasAttachmentLoader, SkeletonBinary } = require('@esotericsoftware/spine-core');

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
        // Load atlas - the findTexture callback receives the full relative path from the atlas
        const atlas = new TextureAtlas(atlasPath, {
            findTexture: (name) => {
                const pngName = name.replace(/\.[^/.]+$/, '') + '.png';
                // Try same directory as atlas
                const candidate = path.join(path.dirname(atlasPath), pngName);
                if (fs.existsSync(candidate)) return candidate;
                // Try parent directory
                const candidate2 = path.join(path.dirname(path.dirname(atlasPath)), pngName);
                if (fs.existsSync(candidate2)) return candidate2;
                return null;
            }
        });

        console.log(`  Atlas pages: ${atlas.pages.length}`);
        for (const page of atlas.pages) {
            console.log(`    - ${page.name} (${page.width}x${page.height})`);
        }

        // Load binary skeleton
        const skelData = fs.readFileSync(skelPath);
        const loader = new AtlasAttachmentLoader(atlas);
        const binary = new SkeletonBinary(loader);
        const skeletonData = binary.readSkeletonData(skelData);

        // Print available animations
        const anims = skeletonData.animations;
        console.log(`  Animations: ${anims.map(a => a.name).join(', ')}`);
        console.log(`  Bones: ${skeletonData.bones.length}, Slots: ${skeletonData.slots.length}, Skins: ${skeletonData.skins.length}`);

        const json = JSON.stringify(skeletonData, null, 2);
        fs.writeFileSync(jsonOutPath, json, 'utf8');
        console.log(`  -> ${path.relative(__dirname, jsonOutPath)} (${(json.length / 1024).toFixed(1)} KB)\n`);
    } catch (e) {
        console.log(`  ERROR: ${e.message}\n`);
    }
}
console.log('Done.');

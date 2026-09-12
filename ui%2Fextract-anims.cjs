const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const SPINE_JS = path.join(BASE, 'webui', 'js', 'spine-player.js');

// spine-player.js is an IIFE: var spine = (() => { ... return __toCommonJS(src_exports); })();
const code = fs.readFileSync(SPINE_JS, 'utf-8');
const getSpine = new Function(code + '; return spine;');
const spine = getSpine();

// Helper to load a spine skeleton and list its animations
function listAnimations(label, skelRelPath, atlasRelPath) {
  const skelPath = path.join(BASE, skelRelPath);
  const atlasPath = path.join(BASE, atlasRelPath);

  const skelBuf = fs.readFileSync(skelPath);
  const atlasText = fs.readFileSync(atlasPath, 'utf-8');

  const atlas = new spine.TextureAtlas(atlasText);
  const attachmentLoader = new spine.AtlasAttachmentLoader(atlas);
  const reader = new spine.SkeletonBinary(attachmentLoader);

  // Convert Node Buffer to ArrayBuffer
  const arrayBuf = new Uint8Array(skelBuf).buffer;
  const skeletonData = reader.readSkeletonData(arrayBuf);

  console.log(`\n=== ${label} ===`);
  console.log('Animations:');
  for (const anim of skeletonData.animations) {
    console.log('  -', anim.name);
  }
  console.log('Skins:');
  for (const skin of skeletonData.skins) {
    console.log('  -', skin.name);
  }
}

listAnimations(
  'Daytime',
  'webui\\assets\\spine\\backgrounds\\daytime\\arona_workpage_daytime_2.skel',
  'webui\\assets\\spine\\backgrounds\\daytime\\arona_workpage_daytime_2.atlas'
);

listAnimations(
  'Nighttime',
  'webui\\assets\\spine\\backgrounds\\nighttime\\arona_workpage_nighttime_2.skel',
  'webui\\assets\\spine\\backgrounds\\nighttime\\arona_workpage_nighttime_2.atlas'
);
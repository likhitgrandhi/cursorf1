/**
 * Download Ferrari SF-25 GLB from Sketchfab (CC Attribution — Abu Saif)
 * https://sketchfab.com/3d-models/ferrari-sf-25-11b53fd8dc324ab7b7fed6b43c62e398
 *
 * Requires a free Sketchfab API token:
 *   1. Create account at sketchfab.com
 *   2. Settings → Password & API → Generate Token
 *   3. SKETCHFAB_TOKEN=your_token npm run download-model
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_UID = '11b53fd8dc324ab7b7fed6b43c62e398';
const OUT_DIR = path.join(__dirname, '../public/models');
const OUT_FILE = path.join(OUT_DIR, 'ferrari-sf-25.glb');

const token = process.env.SKETCHFAB_TOKEN;

if (fs.existsSync(OUT_FILE) && fs.statSync(OUT_FILE).size > 100_000) {
  console.log('Ferrari SF-25 already present:', OUT_FILE);
  process.exit(0);
}

if (!token) {
  console.error(`
Missing SKETCHFAB_TOKEN.

One-time setup:
  1. Open https://sketchfab.com/settings/password
  2. Generate an API token
  3. Run: SKETCHFAB_TOKEN=your_token npm run download-model

Or download GLB manually from:
  https://sketchfab.com/3d-models/ferrari-sf-25-11b53fd8dc324ab7b7fed6b43c62e398
Save as: public/models/ferrari-sf-25.glb
`);
  process.exit(process.env.CI || process.env.RENDER ? 1 : 0);
}

const metaRes = await fetch(`https://api.sketchfab.com/v3/models/${MODEL_UID}/download`, {
  headers: { Authorization: `Token ${token}` },
});

if (!metaRes.ok) {
  console.error('Sketchfab download API failed:', metaRes.status, await metaRes.text());
  process.exit(1);
}

const meta = await metaRes.json();
const glbUrl = meta.glb?.url || meta.gltf?.url;
if (!glbUrl) {
  console.error('No GLB/GLTF URL in Sketchfab response:', meta);
  process.exit(1);
}

console.log('Downloading Ferrari SF-25…');
const glbRes = await fetch(glbUrl);
if (!glbRes.ok) {
  console.error('GLB download failed:', glbRes.status);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const buffer = Buffer.from(await glbRes.arrayBuffer());
fs.writeFileSync(OUT_FILE, buffer);
console.log(`Saved ${(buffer.length / 1024 / 1024).toFixed(1)} MB → ${OUT_FILE}`);
